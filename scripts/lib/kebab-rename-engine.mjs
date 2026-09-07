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
 * Normalize a file path to use forward slashes for consistent comparison.
 */
function normalizePath(path) {
  return path.replace(/\\/g, "/");
}

/**
 * Extract the file stem (basename without extension) from a path.
 */
function extractStem(path) {
  const normalized = normalizePath(path);
  const parts = normalized.split("/");
  const filename = parts[parts.length - 1];
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex === -1 ? filename : filename.slice(0, dotIndex);
}

/**
 * Replace the final segment of an import specifier with a new stem.
 * E.g., "@/components/StatusCard" -> "@/components/status-card"
 */
function replaceLastSegment(specifier, newStem) {
  const parts = specifier.split("/");
  parts[parts.length - 1] = newStem;
  return parts.join("/");
}

/**
 * Apply a rename plan to a ts-morph project in three passes.
 *
 * Pass 1: Before any move, record all non-relative imports and their resolved paths.
 * Pass 2: Move files (ts-morph rewrites relative specifiers here).
 * Pass 3: Update recorded non-relative specifiers with new paths.
 *
 * Case-only renames are additionally staged through git so the rename is not lost.
 */
export function applyRenames(project, plan, options = {}) {
  // Pass 1: Record non-relative imports and their resolved file paths
  const records = [];

  for (const sourceFile of project.getSourceFiles()) {
    // Record ImportDeclarations
    for (const importDecl of sourceFile.getImportDeclarations()) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      if (!moduleSpecifier.startsWith(".")) {
        const resolved = importDecl.getModuleSpecifierSourceFile();
        if (resolved) {
          records.push({
            node: importDecl,
            resolvedPath: normalizePath(resolved.getFilePath()),
          });
        }
      }
    }

    // Record ExportDeclarations
    for (const exportDecl of sourceFile.getExportDeclarations()) {
      const moduleSpecifier = exportDecl.getModuleSpecifierValue();
      if (moduleSpecifier && !moduleSpecifier.startsWith(".")) {
        const resolved = exportDecl.getModuleSpecifierSourceFile();
        if (resolved) {
          records.push({
            node: exportDecl,
            resolvedPath: normalizePath(resolved.getFilePath()),
          });
        }
      }
    }
  }

  // Pass 2: Move files (ts-morph rewrites relative specifiers)
  for (const { from, to, caseOnly } of plan) {
    const sourceFile = project.getSourceFile(from);
    if (!sourceFile) throw new Error(`not in project: ${from}`);

    if (caseOnly && options.gitMove) options.gitMove(from, to);
    sourceFile.move(to, { overwrite: false });
  }

  project.saveSync();

  // Pass 3: Update non-relative specifiers
  const pathMap = new Map(
    plan.map((p) => [normalizePath(p.from), normalizePath(p.to)]),
  );

  for (const record of records) {
    if (pathMap.has(record.resolvedPath)) {
      const newPath = pathMap.get(record.resolvedPath);
      const newStem = extractStem(newPath);
      const currentSpecifier = record.node.getModuleSpecifierValue();
      const newSpecifier = replaceLastSegment(currentSpecifier, newStem);
      record.node.setModuleSpecifier(newSpecifier);
    }
  }

  project.saveSync();
}
