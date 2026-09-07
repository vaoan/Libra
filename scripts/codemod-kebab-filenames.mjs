import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Project } from "ts-morph";
import { buildRenamePlan } from "./lib/kebab-rename-plan.mjs";
import {
  auditDynamicImports,
  partitionDynamicImports,
} from "./lib/dynamic-import-audit.mjs";
import {
  applyRenames,
  gitMoveCaseOnly,
  hasNonKebabLastSegment,
  recordMockSpecifiers,
} from "./lib/kebab-rename-engine.mjs";

const SOURCE_DIRECTORIES = ["src", "tests", "test", "e2e"];
const EXCLUDED = new Set(["node_modules", ".next", "generated"]);

export function collectFiles(workspaceDirectory) {
  const files = [];

  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED.has(entry.name)) walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        files.push(full);
      }
    }
  };

  for (const sub of SOURCE_DIRECTORIES) {
    const directory = path.join(workspaceDirectory, sub);
    if (fs.existsSync(directory)) walk(directory);
  }

  return files;
}

const toPosix = (value) => value.split(path.sep).join("/");

/**
 * Report whether the git working tree that contains `directory` is dirty.
 *
 * Returns `null` when the directory is not inside a git repository, in which
 * case the caller has nothing to protect and proceeds.
 */
export function workingTreeStatus(directory) {
  try {
    return execFileSync("git", ["status", "--porcelain"], {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      workspace: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });

  if (!values.workspace) {
    console.error(
      "usage: codemod-kebab-filenames.mjs --workspace <dir> [--dry-run]",
    );
    process.exit(2);
  }

  const workspace = path.resolve(values.workspace);
  const tsConfigFilePath = path.join(workspace, "tsconfig.json");
  if (!fs.existsSync(tsConfigFilePath)) {
    console.error(`no tsconfig.json in ${workspace}`);
    process.exit(2);
  }

  // The engine performs irreversible `git mv` calls in the same pass that can
  // throw, and a pass-3 failure leaves renamed files with stale specifiers.
  // Insisting on a clean tree keeps `git checkout .` a complete undo.
  const status = workingTreeStatus(workspace);
  if (status !== null && status.trim() !== "") {
    console.error(
      "working tree is not clean — refusing to run.\n" +
        "This codemod moves files with `git mv` and rewrites imports in two\n" +
        "separate save steps; a failure part-way is only recoverable with\n" +
        "`git checkout`. Commit or stash your changes first.\n\n" +
        status.trimEnd(),
    );
    process.exit(1);
  }

  const files = collectFiles(workspace).map(toPosix);
  const cwd = process.cwd();
  const display = (value) => toPosix(path.relative(cwd, value));
  const { plan, collisions } = buildRenamePlan(files);

  if (collisions.length > 0) {
    console.error(`${collisions.length} collision(s) — refusing to proceed:`);
    for (const { target, sources } of collisions) {
      console.error(
        `  ${display(target)} <= ${sources.map(display).join(", ")}`,
      );
    }
    process.exit(1);
  }

  const project = new Project({ tsConfigFilePath });

  // The workspace tsconfig `include` globs do not always cover everything
  // `collectFiles` walks — every packages/* tsconfig includes only `src/**`,
  // and apps/auth excludes `e2e`. Without this the planned files are not
  // project members and pass 2 aborts with "not in project". Adding them also
  // makes the test files' own imports rewritable, which is what we want.
  for (const file of files) {
    if (!project.getSourceFile(file)) project.addSourceFileAtPath(file);
  }

  const { computed, aliased } = partitionDynamicImports(
    auditDynamicImports(project),
  );

  if (computed.length > 0) {
    console.warn(
      `${computed.length} computed import() call(s) need manual review:`,
    );
    for (const entry of computed) {
      console.warn(`  ${display(entry.file)}:${entry.line}  ${entry.text}`);
    }
  }

  if (aliased.length > 0) {
    console.warn(
      `${aliased.length} non-relative dynamic import() specifier(s) are NOT rewritten — review each:`,
    );
    for (const entry of aliased) {
      console.warn(`  ${display(entry.file)}:${entry.line}  ${entry.text}`);
    }
  }

  console.log(`${plan.length} file(s) to rename in ${values.workspace}`);
  for (const { from, to, caseOnly } of plan) {
    console.log(
      `  ${display(from)} -> ${display(to)}${caseOnly ? "  (case-only)" : ""}`,
    );
  }

  if (values["dry-run"]) {
    // vitest treats a `vi.mock` path that resolves to nothing as a silent
    // no-op, so preview the mock rewrites too — this is the one class of
    // breakage neither tsc nor a green test run would ever surface.
    const mocks = recordMockSpecifiers(project, plan);
    const rewritable = mocks.filter((entry) => entry.renamed);
    const unresolved = mocks.filter(
      (entry) =>
        entry.callee !== "require" &&
        (entry.computed ||
          (entry.resolvedPath === null &&
            hasNonKebabLastSegment(entry.specifier))),
    );
    console.log(
      `${rewritable.length} vi.mock/require specifier(s) would be rewritten; ` +
        `${unresolved.length} would need manual attention`,
    );
    for (const entry of unresolved) {
      console.warn(
        `  ${display(entry.file)}:${entry.line}  ${entry.specifier}`,
      );
    }
    console.log("dry run — nothing written");
    return;
  }

  const report = applyRenames(project, plan, { gitMove: gitMoveCaseOnly });

  console.log(`renamed ${report.renamed} file(s)`);
  console.log(
    `rewrote ${report.importRewrites} recorded import/export specifier(s) ` +
      `(${report.caseOnlyRelativeRewrites} relative, from case-only renames)`,
  );
  console.log(
    `rewrote ${report.mockRewrites} vi.mock/require specifier(s); ` +
      `${report.mockManual.length} need manual attention`,
  );

  if (report.mockManual.length > 0) {
    console.warn("mock specifiers needing manual attention:");
    for (const entry of report.mockManual) {
      console.warn(
        `  ${display(entry.file)}:${entry.line}  ${entry.specifier}  — ${entry.reason}`,
      );
    }
  }

  if (report.specifierMismatches.length > 0) {
    console.warn(
      `${report.specifierMismatches.length} specifier(s) were left untouched because their last segment does not name the renamed file:`,
    );
    for (const entry of report.specifierMismatches) {
      console.warn(
        `  ${display(entry.file)}:${entry.line}  ${entry.specifier}  -> ${display(entry.target)}`,
      );
    }
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main();
}
