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
  describeExecError,
  gitMoveCaseOnly,
  hasNonKebabLastSegment,
  recordDynamicImportSpecifiers,
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
 * Returns `null` only for the one failure that genuinely means "there is
 * nothing to protect": the directory is not inside a git repository, which git
 * signals with exit status 128 and `not a git repository` on stderr.
 *
 * Every other failure — git not installed, a broken index, an index lock held
 * by another process — leaves the tree state *unknown*, and treating unknown as
 * clean silently disables the guard and lets the destructive path run against a
 * dirty tree. Those throw instead, naming the underlying error.
 */
export function workingTreeStatus(directory, options = {}) {
  const run = options.run ?? execFileSync;
  try {
    return run("git", ["status", "--porcelain"], {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = describeExecError(error);
    if (error?.status === 128 && /not a git repository/i.test(detail)) {
      return null;
    }
    throw new Error(
      `could not determine the git working tree status of ${directory}: ${detail}`,
    );
  }
}

/**
 * How to undo a run. `git checkout` is wrong on both counts: `gitMoveCaseOnly`
 * uses `git mv`, which *stages* the rename, and pass 2 writes new kebab-named
 * files that are untracked — `git checkout` reverts neither.
 */
const RECOVERY = "`git reset --hard HEAD && git clean -fd`";

const CASE_ONLY_WARNING =
  "Note: a case-only rename may still need a manual two-step rename back\n" +
  "(through a temporary name) — with core.ignorecase git cannot see a\n" +
  "case-only difference and reports a clean tree while the file is still\n" +
  "renamed on disk.";

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
  // Insisting on a clean tree keeps the recovery command a complete undo. A dry
  // run writes nothing, so it warns and continues rather than refusing.
  let status;
  try {
    status = workingTreeStatus(workspace);
  } catch (error) {
    console.error(`${error.message}\n\nrefusing to run.`);
    process.exit(1);
  }
  if (status !== null && status.trim() !== "") {
    const message =
      "working tree is not clean.\n" +
      "This codemod moves files with `git mv` and rewrites imports in two\n" +
      "separate save steps; a failure part-way is only recoverable with\n" +
      `${RECOVERY}. Commit or stash your changes first.\n` +
      `${CASE_ONLY_WARNING}\n\n` +
      status.trimEnd();

    if (!values["dry-run"]) {
      console.error(`${message}\n\nrefusing to run.`);
      process.exit(1);
    }
    console.warn(`${message}\n\ncontinuing — a dry run writes nothing.\n`);
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

  const { computed } = partitionDynamicImports(auditDynamicImports(project));

  if (computed.length > 0) {
    console.warn(
      `${computed.length} computed import() call(s) need manual review:`,
    );
    for (const entry of computed) {
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

    // Only the aliased dynamic imports that actually point into the rename
    // plan, plus the ones the last-segment guard refuses. Listing every
    // non-relative import() (~106 repo-wide, ~43 of them bare packages like
    // `react`) buries the handful that matter and gets skipped.
    const dynamic = recordDynamicImportSpecifiers(project, plan).filter(
      (entry) => entry.renamed,
    );
    const dynamicManual = dynamic.filter((entry) => entry.rewritten === null);
    console.log(
      `${dynamic.length - dynamicManual.length} aliased dynamic import()/import-type ` +
        `specifier(s) would be rewritten; ${dynamicManual.length} would need manual attention`,
    );
    for (const entry of dynamicManual) {
      console.warn(
        `  ${display(entry.file)}:${entry.line}  ${entry.specifier}  -> ${display(entry.resolvedPath)}`,
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
  console.log(
    `rewrote ${report.dynamicRewrites} aliased dynamic import()/import-type specifier(s)`,
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
      `${report.specifierMismatches.length} specifier(s) point at a renamed file but were left untouched — fix each by hand:`,
    );
    for (const entry of report.specifierMismatches) {
      console.warn(
        `  ${display(entry.file)}:${entry.line}  ${entry.specifier}  -> ${display(entry.target)}  — ${entry.reason}`,
      );
    }
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main();
}
