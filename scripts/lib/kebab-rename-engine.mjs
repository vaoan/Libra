import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { SyntaxKind, ts } from "ts-morph";

/**
 * Call expressions whose first string-literal argument names a module but which
 * TypeScript never type-checks, so `tsc` cannot catch a stale path.
 *
 * `vi.mock` is the dangerous one: vitest treats a mock path that resolves to
 * nothing as a silent no-op — the suite stays green while exercising the real
 * module. See the C3 finding in the whole-branch review.
 */
const MOCK_CALLEES = new Set([
  "vi.mock",
  "vi.doMock",
  "vi.unmock",
  "vi.doUnmock",
  "vi.importActual",
  "vi.importMock",
  "require",
]);

/** Callees whose computed (non-string-literal) argument is worth reporting. */
const VITEST_CALLEES = new Set(
  [...MOCK_CALLEES].filter((name) => name.startsWith("vi.")),
);

const CANDIDATE_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".d.ts",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  "/index.ts",
  "/index.tsx",
  "/index.js",
];

/**
 * Move a file through a temporary name so git records the rename on a
 * case-insensitive filesystem. `core.ignorecase` is true in this repository,
 * which makes a direct `git mv Pagination.tsx pagination.tsx` a silent no-op.
 *
 * `execFileSync` throws an error whose `stderr` is a Buffer; printing that
 * error renders the buffer as a list of decimal bytes, which is unreadable.
 * Both moves are therefore wrapped so the real git message survives, and a
 * failure of the second move restores the `.casetmp` file to its original
 * name rather than leaving it stranded.
 */
export function gitMoveCaseOnly(from, to, options = {}) {
  const run = options.run ?? execFileSync;
  const rename = options.rename ?? fs.renameSync;
  const temporary = `${from}.casetmp`;

  try {
    run("git", ["mv", from, temporary]);
  } catch (error) {
    throw new Error(
      `git mv "${from}" "${temporary}" failed: ${describeExecError(error)}`,
    );
  }

  try {
    run("git", ["mv", temporary, to]);
  } catch (error) {
    const cleanup = restoreTemporary({ run, rename, temporary, from });
    throw new Error(
      `git mv "${temporary}" "${to}" failed: ${describeExecError(error)}\n${cleanup}`,
    );
  }
}

function describeExecError(error) {
  const stderr = error?.stderr;
  const text =
    typeof stderr === "string"
      ? stderr
      : stderr && typeof stderr.toString === "function"
        ? stderr.toString("utf8")
        : "";
  return text.trim() || error?.message || String(error);
}

function restoreTemporary({ run, rename, temporary, from }) {
  try {
    run("git", ["mv", temporary, from]);
    return `cleaned up: restored ${temporary} to ${from}`;
  } catch {
    try {
      rename(temporary, from);
      return `cleaned up: restored ${temporary} to ${from}`;
    } catch (error) {
      return `WARNING: could not clean up ${temporary} — remove it by hand (${error?.message ?? error})`;
    }
  }
}

/**
 * Normalize a file path to use forward slashes for consistent comparison.
 */
function normalizePath(filePath) {
  return String(filePath).replace(/\\/g, "/");
}

/**
 * Extract the file stem (basename without extension) from a path.
 */
function extractStem(filePath) {
  const normalized = normalizePath(filePath);
  const parts = normalized.split("/");
  const filename = parts[parts.length - 1];
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex === -1 ? filename : filename.slice(0, dotIndex);
}

/**
 * Replace the final segment of an import specifier with a new stem, but only
 * when that segment actually names the file being renamed.
 *
 * A specifier can reach a file through something other than its own name — a
 * `package.json` `exports` entry or a non-star path alias, e.g.
 * `shared/app-root-layout` resolving to `AppRootLayout.tsx`. Rewriting the
 * last segment there would produce a specifier that points nowhere, so this
 * returns `null` instead and the caller reports the site for manual handling.
 */
function replaceLastSegment(specifier, expectedStem, newStem) {
  const parts = specifier.split("/");
  if (parts[parts.length - 1] !== expectedStem) return null;
  parts[parts.length - 1] = newStem;
  return parts.join("/");
}

/** True when two stems differ only in letter case. */
function isCaseOnlyStem(oldStem, newStem) {
  return oldStem.toLowerCase() === newStem.toLowerCase();
}

/**
 * True when the last path segment of a specifier is not already kebab-case,
 * i.e. it could plausibly be pointing at a file this migration renames.
 */
export function hasNonKebabLastSegment(specifier) {
  const last = specifier.split("/").pop() ?? "";
  return /[A-Z]/.test(last);
}

/**
 * Pass 1 recording step for import and export declarations.
 *
 * Two categories are recorded, both of which `SourceFile.move()` fails to fix
 * on its own:
 *
 *  - **non-relative specifiers** (path aliases). TypeScript's
 *    `getEditsForFileRename` only rewrites relative specifiers.
 *  - **relative specifiers whose target is a case-only rename.** With
 *    `useCaseSensitiveFileNames === false` TypeScript considers the old and
 *    new paths to be the same file and emits no edits at all, so a relative
 *    importer of `Pagination.tsx` keeps pointing at the old casing.
 *
 * Exported so the recording step can be asserted directly: a case-insensitive
 * in-memory ts-morph filesystem cannot be constructed, so the case-only branch
 * is verified here and on a real (case-insensitive) disk instead.
 */
export function recordImportSpecifiers(project, plan) {
  const pathMap = buildPathMap(plan);
  const caseOnlyPaths = new Set(
    plan
      .filter((entry) => entry.caseOnly)
      .map((entry) => normalizePath(entry.from)),
  );
  const records = [];

  const consider = (declaration) => {
    const specifier = declaration.getModuleSpecifierValue();
    if (!specifier) return;
    const relative = specifier.startsWith(".");

    const resolved = declaration.getModuleSpecifierSourceFile();
    if (!resolved) return;
    const resolvedPath = normalizePath(resolved.getFilePath());

    // Relative specifiers are rewritten by ts-morph during the move, EXCEPT
    // when the rename is case-only. Record only that exception.
    if (relative && !caseOnlyPaths.has(resolvedPath)) return;
    if (!pathMap.has(resolvedPath)) return;

    records.push({
      node: declaration,
      specifier,
      relative,
      resolvedPath,
      file: normalizePath(declaration.getSourceFile().getFilePath()),
      line: declaration.getStartLineNumber(),
    });
  };

  for (const sourceFile of project.getSourceFiles()) {
    for (const declaration of sourceFile.getImportDeclarations())
      consider(declaration);
    for (const declaration of sourceFile.getExportDeclarations())
      consider(declaration);
  }

  return records;
}

function buildPathMap(plan) {
  return new Map(
    plan.map((entry) => [normalizePath(entry.from), normalizePath(entry.to)]),
  );
}

/**
 * Resolve a module specifier to an absolute file path, preferring
 * TypeScript's own resolver and falling back to a tsconfig-`paths` aware
 * candidate search. The fallback matters for in-memory projects and for
 * `moduleResolution` modes where the resolver declines extensionless paths.
 */
function resolveSpecifier(specifier, containingFile, context) {
  const key = `${normalizePath(containingFile)} ${specifier}`;
  if (context.cache.has(key)) return context.cache.get(key);

  let resolved = null;
  try {
    const result = ts.resolveModuleName(
      specifier,
      containingFile,
      context.compilerOptions,
      context.host,
    );
    if (result?.resolvedModule) {
      resolved = normalizePath(result.resolvedModule.resolvedFileName);
    }
  } catch {
    resolved = null;
  }

  if (!resolved) {
    for (const candidate of candidatePaths(
      specifier,
      containingFile,
      context.compilerOptions,
    )) {
      if (context.knownFiles.has(candidate)) {
        resolved = candidate;
        break;
      }
    }
  }

  context.cache.set(key, resolved);
  return resolved;
}

function candidatePaths(specifier, containingFile, compilerOptions) {
  const bases = [];

  if (specifier.startsWith(".")) {
    bases.push(
      path.posix.resolve(
        path.posix.dirname(normalizePath(containingFile)),
        specifier,
      ),
    );
  } else {
    const base = normalizePath(
      compilerOptions.baseUrl ?? compilerOptions.pathsBasePath ?? "/",
    );
    for (const [pattern, targets] of Object.entries(
      compilerOptions.paths ?? {},
    )) {
      const star = pattern.indexOf("*");
      if (star === -1) {
        if (pattern !== specifier) continue;
        for (const target of targets) {
          bases.push(path.posix.resolve(base, normalizePath(target)));
        }
        continue;
      }
      const prefix = pattern.slice(0, star);
      const suffix = pattern.slice(star + 1);
      if (!specifier.startsWith(prefix)) continue;
      if (suffix && !specifier.endsWith(suffix)) continue;
      const middle = specifier.slice(
        prefix.length,
        specifier.length - suffix.length,
      );
      for (const target of targets) {
        bases.push(
          path.posix.resolve(base, normalizePath(target).replace("*", middle)),
        );
      }
    }
  }

  const candidates = [];
  for (const bare of bases) {
    for (const suffix of CANDIDATE_SUFFIXES)
      candidates.push(`${bare}${suffix}`);
  }
  return candidates;
}

/**
 * Pass 1 recording step for `vi.mock`-family and `require` specifiers.
 *
 * These are plain string arguments. TypeScript does not type-check them and
 * ts-morph's rename machinery does not touch them, so they are resolved by
 * hand here — before any file moves, while the old paths still exist — and
 * rewritten in pass 3.
 */
export function recordMockSpecifiers(project, plan) {
  const pathMap = buildPathMap(plan);
  const context = {
    compilerOptions: project.getCompilerOptions(),
    host: project.getModuleResolutionHost(),
    knownFiles: new Set(
      project.getSourceFiles().map((file) => normalizePath(file.getFilePath())),
    ),
    cache: new Map(),
  };

  const records = [];

  for (const sourceFile of project.getSourceFiles()) {
    const containingFile = normalizePath(sourceFile.getFilePath());

    for (const call of sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression,
    )) {
      const callee = call.getExpression().getText();
      if (!MOCK_CALLEES.has(callee)) continue;

      const [argument] = call.getArguments();
      const line = call.getStartLineNumber();

      if (!argument || argument.getKind() !== SyntaxKind.StringLiteral) {
        if (VITEST_CALLEES.has(callee)) {
          records.push({
            callee,
            computed: true,
            file: containingFile,
            line,
            specifier: call.getText(),
            resolvedPath: null,
          });
        }
        continue;
      }

      const specifier = argument.getLiteralValue();
      const resolvedPath = resolveSpecifier(specifier, containingFile, context);

      records.push({
        node: argument,
        callee,
        computed: false,
        file: containingFile,
        line,
        specifier,
        resolvedPath,
        renamed: resolvedPath !== null && pathMap.has(resolvedPath),
      });
    }
  }

  return records;
}

/**
 * Apply a rename plan to a ts-morph project in three passes.
 *
 * Pass 1: Before any move, record everything the move itself will not fix —
 *         non-relative import/export specifiers, relative specifiers whose
 *         target is a case-only rename, and `vi.mock`-family / `require`
 *         string arguments together with the file each one resolves to.
 * Pass 2: Move files (ts-morph rewrites ordinary relative specifiers here).
 * Pass 3: Rewrite every recorded specifier whose target was renamed.
 *
 * Case-only renames are additionally staged through git so the rename is not
 * lost on a case-insensitive filesystem.
 *
 * **Partial-application hazard.** Pass 2 performs irreversible `git mv` calls
 * inside the same loop that can throw, and the first `saveSync` happens only
 * after that loop completes. A throw in pass 3 therefore leaves the tree with
 * correct filenames but stale aliased/mock specifiers. Both states are
 * recoverable only by `git checkout`, which is why the CLI refuses to run
 * against a dirty working tree.
 *
 * Returns a report describing what was rewritten and what needs a human.
 */
export function applyRenames(project, plan, options = {}) {
  const pathMap = buildPathMap(plan);

  // ---- Pass 1: record ----------------------------------------------------
  const importRecords = recordImportSpecifiers(project, plan);
  const mockRecords = recordMockSpecifiers(project, plan);

  const report = {
    renamed: 0,
    importRewrites: 0,
    caseOnlyRelativeRewrites: 0,
    mockRewrites: 0,
    mockManual: [],
    specifierMismatches: [],
  };

  // ---- Pass 2: move ------------------------------------------------------
  for (const { from, to, caseOnly } of plan) {
    const sourceFile = project.getSourceFile(from);
    if (!sourceFile) throw new Error(`not in project: ${from}`);

    if (caseOnly && options.gitMove) options.gitMove(from, to);
    sourceFile.move(to, { overwrite: false });
    report.renamed += 1;
  }

  project.saveSync();

  // ---- Pass 3: rewrite recorded specifiers -------------------------------
  for (const record of importRecords) {
    const newPath = pathMap.get(record.resolvedPath);
    if (!newPath) continue;
    if (record.node.wasForgotten?.()) continue;

    const current = record.node.getModuleSpecifierValue();
    const oldStem = extractStem(record.resolvedPath);
    const newStem = extractStem(newPath);

    // A case-only rename may or may not have been rewritten by ts-morph
    // already, depending on whether the host filesystem is case-sensitive.
    // If it was, there is nothing to do — and nothing to report either.
    if (
      isCaseOnlyStem(oldStem, newStem) &&
      current.split("/").pop() === newStem
    )
      continue;

    const rewritten = replaceLastSegment(current, oldStem, newStem);

    if (rewritten === null) {
      report.specifierMismatches.push({
        file: record.file,
        line: record.line,
        specifier: current,
        target: record.resolvedPath,
        reason: "last segment does not name the renamed file",
      });
      continue;
    }

    if (rewritten !== current) record.node.setModuleSpecifier(rewritten);
    report.importRewrites += 1;
    if (record.relative) report.caseOnlyRelativeRewrites += 1;
  }

  for (const record of mockRecords) {
    if (record.computed) {
      report.mockManual.push({
        file: record.file,
        line: record.line,
        specifier: record.specifier,
        reason: "computed specifier — cannot be resolved statically",
      });
      continue;
    }

    const newPath = record.resolvedPath
      ? pathMap.get(record.resolvedPath)
      : undefined;

    if (!newPath) {
      // Unresolvable AND non-kebab means it might have been pointing at a file
      // this migration renames. Anything already kebab-case, or resolving to a
      // real module, needs no attention.
      if (
        record.resolvedPath === null &&
        hasNonKebabLastSegment(record.specifier) &&
        record.callee !== "require"
      ) {
        report.mockManual.push({
          file: record.file,
          line: record.line,
          specifier: record.specifier,
          reason: "could not resolve specifier to a file",
        });
      }
      continue;
    }

    if (record.node.wasForgotten?.()) {
      report.mockManual.push({
        file: record.file,
        line: record.line,
        specifier: record.specifier,
        reason: "AST node was invalidated before it could be rewritten",
      });
      continue;
    }

    const oldStem = extractStem(record.resolvedPath);
    const newStem = extractStem(newPath);
    if (
      isCaseOnlyStem(oldStem, newStem) &&
      record.specifier.split("/").pop() === newStem
    )
      continue;

    const rewritten = replaceLastSegment(record.specifier, oldStem, newStem);

    if (rewritten === null) {
      report.specifierMismatches.push({
        file: record.file,
        line: record.line,
        specifier: record.specifier,
        target: record.resolvedPath,
        reason: "last segment does not name the renamed file",
      });
      report.mockManual.push({
        file: record.file,
        line: record.line,
        specifier: record.specifier,
        reason: "last segment does not name the renamed file",
      });
      continue;
    }

    if (rewritten !== record.specifier) record.node.setLiteralValue(rewritten);
    report.mockRewrites += 1;
  }

  project.saveSync();

  return report;
}
