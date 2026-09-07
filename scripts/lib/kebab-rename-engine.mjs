import { execFileSync } from "node:child_process";

/**
 * Move a file through a temporary name so git records the rename on a
 * case-insensitive filesystem. `core.ignorecase` is true in this repository,
 * which makes a direct `git mv Pagination.tsx pagination.tsx` a silent no-op.
 */
export function gitMoveCaseOnly(from, to) {
  const temporary = `${from}.casetmp`;
  execFileSync("git", ["mv", from, temporary]);
  execFileSync("git", ["mv", temporary, to]);
}

/**
 * Apply a rename plan to a ts-morph project.
 *
 * `SourceFile.move()` rewrites every import specifier that references the file,
 * including barrel re-exports and static `import()` calls. Case-only renames
 * are additionally staged through git so the rename is not lost.
 */
export function applyRenames(project, plan, options = {}) {
  for (const { from, to, caseOnly } of plan) {
    const sourceFile = project.getSourceFile(from);
    if (!sourceFile) throw new Error(`not in project: ${from}`);

    if (caseOnly && options.gitMove) options.gitMove(from, to);
    sourceFile.move(to, { overwrite: false });
  }

  project.saveSync();
}
