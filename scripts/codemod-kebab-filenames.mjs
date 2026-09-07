import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { Project } from "ts-morph";
import { buildRenamePlan } from "./lib/kebab-rename-plan.mjs";
import { auditDynamicImports } from "./lib/dynamic-import-audit.mjs";
import { applyRenames, gitMoveCaseOnly } from "./lib/kebab-rename-engine.mjs";

const SOURCE_DIRECTORIES = ["src", "tests", "test", "e2e"];
const EXCLUDED = new Set(["node_modules", ".next", "generated"]);

export function collectFiles(workspaceDirectory, fileSystem = fs) {
  const files = [];

  const walk = (directory) => {
    for (const entry of fileSystem.readdirSync(directory, {
      withFileTypes: true,
    })) {
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
    if (fileSystem.existsSync(directory)) walk(directory);
  }

  return files;
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

  const files = collectFiles(workspace);
  const cwd = process.cwd();
  const { plan, collisions } = buildRenamePlan(
    files.map((f) => f.split(path.sep).join("/")),
  );

  if (collisions.length > 0) {
    console.error(`${collisions.length} collision(s) — refusing to proceed:`);
    for (const { target, sources } of collisions) {
      console.error(
        `  ${path.relative(cwd, target).split(path.sep).join("/")} <= ${sources.map((s) => path.relative(cwd, s).split(path.sep).join("/")).join(", ")}`,
      );
    }
    process.exit(1);
  }

  const project = new Project({ tsConfigFilePath });

  const computed = auditDynamicImports(project).filter(
    (entry) => !entry.static,
  );
  if (computed.length > 0) {
    console.warn(
      `${computed.length} computed import() call(s) need manual review:`,
    );
    for (const entry of computed) {
      const displayFile = path
        .relative(cwd, entry.file)
        .split(path.sep)
        .join("/");
      console.warn(`  ${displayFile}:${entry.line}  ${entry.text}`);
    }
  }

  console.log(`${plan.length} file(s) to rename in ${values.workspace}`);
  for (const { from, to, caseOnly } of plan) {
    const displayFrom = path.relative(cwd, from).split(path.sep).join("/");
    const displayTo = path.relative(cwd, to).split(path.sep).join("/");
    console.log(
      `  ${displayFrom} -> ${displayTo}${caseOnly ? "  (case-only)" : ""}`,
    );
  }

  if (values["dry-run"]) {
    console.log("dry run — nothing written");
    return;
  }

  applyRenames(project, plan, { gitMove: gitMoveCaseOnly });
  console.log(`renamed ${plan.length} file(s)`);
}

if (
  import.meta.url === `file://${process.argv[1].split(path.sep).join("/")}` ||
  import.meta.url === `file:///${process.argv[1].split(path.sep).join("/")}`
) {
  main();
}
