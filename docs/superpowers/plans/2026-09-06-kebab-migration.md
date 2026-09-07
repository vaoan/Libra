# Kebab-case File Naming Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename all 694 non-kebab-case TypeScript files in libra to kebab-case, rewriting every import, and turn on three layers of enforcement so the convention cannot drift again.

**Architecture:** A purpose-built codemod in `scripts/` does the work in three separable pieces — a pure `toKebab` string function, a rename-plan builder that also detects collisions, and a `ts-morph` engine that performs the moves while rewriting import specifiers across the module graph. The codemod runs one workspace at a time, producing eleven reviewable pull requests, and enforcement lands in a twelfth once every workspace is compliant.

**Tech Stack:** Node 24, pnpm 10.32.1, ts-morph (new devDependency), vitest (`vitest.config.scripts.js`), ESLint 9 flat config with `eslint-plugin-unicorn`, `@ls-lint/ls-lint`.

**Spec:** `docs/superpowers/specs/2026-09-06-kebab-migration-design.md`
**Decision record:** `../../../orrery/docs/decisions/0001-file-naming.md`
**Parent design:** `../../../orrery/docs/specs/2026-09-06-orrery-design.md`

## Global Constraints

- Node `>=24` (`.nvmrc` pins `24`); pnpm `10.32.1`.
- Scripts in `scripts/` are ESM `.mjs`. Their tests live in `scripts/__tests__/*.test.mjs` and run under `vitest.config.scripts.js` via `pnpm test:workflows`.
- `forceConsistentCasingInFileNames: true` is already set in `tsconfig.base.json`. It is the migration's safety net: any import left at an old casing fails `pnpm typecheck`.
- `git config core.ignorecase` is `true` in this repository. Case-only renames must go through a temporary filename.
- The kebab conversion **must split acronym boundaries**: `MSWProvider` → `msw-provider`, `useAIData` → `use-ai-data`, `graphqlFetch` → `graphql-fetch`, `AIOptimization` → `ai-optimization`.
- Verified 2026-09-06 across all 1,067 `.ts`/`.tsx` files in `apps/*/{src,tests,test,e2e}` and `packages/*/{src,tests}`: **zero collisions** after conversion. No manual disambiguation is required.
- Verified 2026-09-06 (corrected): **exactly two** true case-only renames exist, both in `apps/admin` —
  `apps/admin/src/features/users/presentation/components/Pagination.tsx` and
  `apps/admin/tests/Pagination.test.tsx`. The original count of one scanned only `src`
  directories and missed the test file.
- Relative importers of a case-only rename are **not** fixed by ts-morph's `SourceFile.move()`:
  with `useCaseSensitiveFileNames === false` TypeScript treats the old and new path as the
  same file and emits no edits. The codemod handles this itself (pass 1 records those
  specifiers, pass 3 rewrites them); nothing manual is required, but do not assume
  `pnpm typecheck` alone would have caught it on Windows.
- Zero `.stories.tsx` and zero `.module.css` files repo-wide, so no sibling file must rename in lockstep.
- The CLI refuses to run against a dirty working tree (non-zero exit). Pass 2 performs
  irreversible `git mv` calls before the first `saveSync`, so `git checkout` is the only
  recovery from a mid-run failure — it must be a complete undo. Commit or stash first,
  including before a `--dry-run`.
- Enforcement must not be switched on until every workspace is migrated, or CI reddens for the duration.
- Identifier casing (variables, functions, constants, enum-like objects) is **out of scope**. Only file names change.

## Scope

| Location                                                        | Files     | To rename |
| --------------------------------------------------------------- | --------- | --------- |
| `apps/*/src`, `packages/*/src`                                  | 677       | 396       |
| `apps/*/tests`, `apps/*/test`, `packages/*/tests`, `apps/*/e2e` | 390       | 298       |
| **Total**                                                       | **1,067** | **694**   |

---

### Task 1: Rename-plan builder (pure logic, no filesystem writes)

Produces the analysis layer: what would be renamed, and whether anything collides. Dependency-free and fully unit-testable, so the risky part (Task 3) can be reviewed against a known-good plan.

**Files:**

- Create: `scripts/lib/kebab-rename-plan.mjs`
- Test: `scripts/__tests__/kebab-rename-plan.test.mjs`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `toKebab(stem: string) => string`
  - `buildRenamePlan(files: string[]) => { plan: Array<{from: string, to: string, caseOnly: boolean}>, collisions: Array<{target: string, sources: string[]}> }`

- [ ] **Step 1: Write the failing test**

```javascript
// scripts/__tests__/kebab-rename-plan.test.mjs
import { describe, it, expect } from "vitest";
import { toKebab, buildRenamePlan } from "../lib/kebab-rename-plan.mjs";

describe("toKebab", () => {
  it("splits camelCase", () => {
    expect(toKebab("loginForm")).toBe("login-form");
  });

  it("splits PascalCase", () => {
    expect(toKebab("LoginForm")).toBe("login-form");
  });

  it("splits acronym boundaries", () => {
    expect(toKebab("MSWProvider")).toBe("msw-provider");
    expect(toKebab("useAIData")).toBe("use-ai-data");
    expect(toKebab("AIOptimization")).toBe("ai-optimization");
  });

  it("handles lowercase acronyms already joined", () => {
    expect(toKebab("graphqlFetch")).toBe("graphql-fetch");
    expect(toKebab("currentUserId")).toBe("current-user-id");
  });

  it("splits before a capital that follows a digit", () => {
    expect(toKebab("h2Heading")).toBe("h2-heading");
  });

  it("leaves already-kebab and single-word names alone", () => {
    expect(toKebab("already-kebab")).toBe("already-kebab");
    expect(toKebab("utils")).toBe("utils");
  });

  it("lowercases a single-word PascalCase name", () => {
    expect(toKebab("Pagination")).toBe("pagination");
  });
});

describe("buildRenamePlan", () => {
  it("preserves compound extensions", () => {
    const { plan } = buildRenamePlan(["src/LoginForm.test.tsx"]);
    expect(plan).toEqual([
      {
        from: "src/LoginForm.test.tsx",
        to: "src/login-form.test.tsx",
        caseOnly: false,
      },
    ]);
  });

  it("omits files that are already compliant", () => {
    const { plan } = buildRenamePlan(["src/login-form.tsx", "src/utils.ts"]);
    expect(plan).toEqual([]);
  });

  it("flags a case-only rename", () => {
    const { plan } = buildRenamePlan(["src/Pagination.tsx"]);
    expect(plan[0]).toEqual({
      from: "src/Pagination.tsx",
      to: "src/pagination.tsx",
      caseOnly: true,
    });
  });

  it("does not flag an acronym rename as case-only", () => {
    const { plan } = buildRenamePlan(["src/MSWProvider.tsx"]);
    expect(plan[0].to).toBe("src/msw-provider.tsx");
    expect(plan[0].caseOnly).toBe(false);
  });

  it("reports collisions instead of silently overwriting", () => {
    const { collisions } = buildRenamePlan([
      "src/userApi.ts",
      "src/UserAPI.ts",
    ]);
    expect(collisions).toEqual([
      {
        target: "src/user-api.ts",
        sources: ["src/userApi.ts", "src/UserAPI.ts"],
      },
    ]);
  });

  it("reports no collisions when targets are distinct", () => {
    const { collisions } = buildRenamePlan(["src/userApi.ts", "src/userDb.ts"]);
    expect(collisions).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run -c vitest.config.scripts.js scripts/__tests__/kebab-rename-plan.test.mjs`
Expected: FAIL — `Failed to load ../lib/kebab-rename-plan.mjs`

- [ ] **Step 3: Write the implementation**

```javascript
// scripts/lib/kebab-rename-plan.mjs
import path from "node:path";

/**
 * Convert a filename stem to kebab-case.
 *
 * Two passes are needed. The first splits a lowercase-or-digit followed by an
 * uppercase letter (`loginForm` -> `login-Form`). The second splits a run of
 * capitals followed by a capital-then-lowercase, which is what separates an
 * acronym from the word after it (`MSWProvider` -> `MSW-Provider`). Without
 * the second pass, `MSWProvider` would collapse to `mswprovider`.
 */
export function toKebab(stem) {
  return stem
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/**
 * Split a basename into its stem and the whole remaining suffix, so compound
 * extensions survive: `LoginForm.test.tsx` -> `LoginForm` + `.test.tsx`.
 * The search starts at index 1 so a leading dot is never treated as the
 * separator.
 */
function splitBasename(base) {
  const dot = base.indexOf(".", 1);
  return dot === -1 ? [base, ""] : [base.slice(0, dot), base.slice(dot)];
}

export function buildRenamePlan(files) {
  const plan = [];
  const byTarget = new Map();

  for (const file of files) {
    const dir = path.dirname(file);
    const [stem, suffix] = splitBasename(path.basename(file));
    const target = path.posix.join(dir, toKebab(stem) + suffix);

    byTarget.set(target, [...(byTarget.get(target) ?? []), file]);

    if (target !== file) {
      plan.push({
        from: file,
        to: target,
        caseOnly: target.toLowerCase() === file.toLowerCase(),
      });
    }
  }

  const collisions = [...byTarget]
    .filter(([, sources]) => sources.length > 1)
    .map(([target, sources]) => ({ target, sources }));

  return { plan, collisions };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run -c vitest.config.scripts.js scripts/__tests__/kebab-rename-plan.test.mjs`
Expected: PASS — 13 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/kebab-rename-plan.mjs scripts/__tests__/kebab-rename-plan.test.mjs
git commit -m "feat(scripts): add kebab rename-plan builder with collision detection"
```

---

### Task 2: Dynamic-import auditor

Eleven `import()` call sites exist in the repository. ts-morph rewrites static string specifiers reliably and computed ones not at all, so those must be found and reported before any file moves.

**Files:**

- Create: `scripts/lib/dynamic-import-audit.mjs`
- Test: `scripts/__tests__/dynamic-import-audit.test.mjs`

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces: `auditDynamicImports(project: Project) => Array<{file: string, line: number, text: string, static: boolean}>` — takes a ts-morph `Project`, returns every `import()` call with whether its specifier is a plain string literal.

- [ ] **Step 1: Add ts-morph as a devDependency**

```bash
pnpm add -Dw ts-morph
```

- [ ] **Step 2: Write the failing test**

```javascript
// scripts/__tests__/dynamic-import-audit.test.mjs
import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { auditDynamicImports } from "../lib/dynamic-import-audit.mjs";

function projectWith(source) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile("a.ts", source);
  return project;
}

describe("auditDynamicImports", () => {
  it("marks a string-literal specifier as static", () => {
    const found = auditDynamicImports(
      projectWith(`const m = import("./login-form");`),
    );
    expect(found).toHaveLength(1);
    expect(found[0].static).toBe(true);
  });

  it("marks a template-literal specifier as not static", () => {
    const found = auditDynamicImports(
      projectWith("const n = 'x';\nconst m = import(`./${n}`);"),
    );
    expect(found).toHaveLength(1);
    expect(found[0].static).toBe(false);
  });

  it("marks an identifier specifier as not static", () => {
    const found = auditDynamicImports(
      projectWith(`const p = "./x"; const m = import(p);`),
    );
    expect(found[0].static).toBe(false);
  });

  it("reports the line number", () => {
    const found = auditDynamicImports(
      projectWith(`\n\nconst m = import("./x");`),
    );
    expect(found[0].line).toBe(3);
  });

  it("ignores static import declarations", () => {
    const found = auditDynamicImports(projectWith(`import x from "./x";`));
    expect(found).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run -c vitest.config.scripts.js scripts/__tests__/dynamic-import-audit.test.mjs`
Expected: FAIL — `Failed to load ../lib/dynamic-import-audit.mjs`

- [ ] **Step 4: Write the implementation**

```javascript
// scripts/lib/dynamic-import-audit.mjs
import { SyntaxKind } from "ts-morph";

/**
 * Find every `import(...)` expression in the project.
 *
 * ts-morph rewrites a specifier that is a plain string literal when the target
 * file moves. Anything computed — a template literal, an identifier, a
 * concatenation — is invisible to it and must be checked by hand.
 */
export function auditDynamicImports(project) {
  const found = [];

  for (const sourceFile of project.getSourceFiles()) {
    for (const call of sourceFile.getDescendantsOfKind(
      SyntaxKind.CallExpression,
    )) {
      if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) continue;

      const [argument] = call.getArguments();
      found.push({
        file: sourceFile.getFilePath(),
        line: call.getStartLineNumber(),
        text: call.getText(),
        static: argument?.getKind() === SyntaxKind.StringLiteral,
      });
    }
  }

  return found;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run -c vitest.config.scripts.js scripts/__tests__/dynamic-import-audit.test.mjs`
Expected: PASS — 5 tests

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/dynamic-import-audit.mjs scripts/__tests__/dynamic-import-audit.test.mjs package.json pnpm-lock.yaml
git commit -m "feat(scripts): add dynamic-import auditor for the kebab migration"
```

---

### Task 3: Rename engine

Performs the moves and rewrites imports. `SourceFile.move()` in ts-morph updates every referencing import specifier across the module graph, including barrel `index.ts` re-exports and `@/` path aliases resolved through the tsconfig.

**Files:**

- Create: `scripts/lib/kebab-rename-engine.mjs`
- Test: `scripts/__tests__/kebab-rename-engine.test.mjs`

**Interfaces:**

- Consumes: `buildRenamePlan` from Task 1 (`scripts/lib/kebab-rename-plan.mjs`).
- Produces: `applyRenames(project: Project, plan: Array<{from, to, caseOnly}>, options?: {gitMove?: (from: string, to: string) => void}) => void` — moves each file in the project and saves. When an entry has `caseOnly: true` and `options.gitMove` is supplied, the move is delegated to it so git sees the rename on a case-insensitive filesystem.

- [ ] **Step 1: Write the failing test**

```javascript
// scripts/__tests__/kebab-rename-engine.test.mjs
import { describe, it, expect, vi } from "vitest";
import { Project } from "ts-morph";
import { buildRenamePlan } from "../lib/kebab-rename-plan.mjs";
import { applyRenames } from "../lib/kebab-rename-engine.mjs";

function project(files) {
  const p = new Project({ useInMemoryFileSystem: true });
  for (const [name, text] of Object.entries(files))
    p.createSourceFile(name, text);
  return p;
}

describe("applyRenames", () => {
  it("renames the file and rewrites a direct import", () => {
    const p = project({
      "/src/LoginForm.tsx": `export const LoginForm = () => null;`,
      "/src/page.tsx": `import { LoginForm } from "./LoginForm";\nexport default LoginForm;`,
    });
    applyRenames(p, buildRenamePlan(["/src/LoginForm.tsx"]).plan);

    expect(p.getSourceFile("/src/login-form.tsx")).toBeDefined();
    expect(p.getSourceFile("/src/LoginForm.tsx")).toBeUndefined();
    expect(p.getSourceFileOrThrow("/src/page.tsx").getFullText()).toContain(
      `from "./login-form"`,
    );
  });

  it("rewrites a barrel re-export", () => {
    const p = project({
      "/src/MSWProvider.tsx": `export const MSWProvider = () => null;`,
      "/src/index.ts": `export { MSWProvider } from "./MSWProvider";`,
    });
    applyRenames(p, buildRenamePlan(["/src/MSWProvider.tsx"]).plan);

    expect(p.getSourceFileOrThrow("/src/index.ts").getFullText()).toContain(
      `from "./msw-provider"`,
    );
  });

  it("rewrites a static dynamic-import specifier", () => {
    const p = project({
      "/src/StatusCard.tsx": `export const StatusCard = () => null;`,
      "/src/lazy.ts": `export const Lazy = () => import("./StatusCard");`,
    });
    applyRenames(p, buildRenamePlan(["/src/StatusCard.tsx"]).plan);

    expect(p.getSourceFileOrThrow("/src/lazy.ts").getFullText()).toContain(
      `import("./status-card")`,
    );
  });

  it("delegates a case-only rename to gitMove", () => {
    const gitMove = vi.fn();
    const p = project({
      "/src/Pagination.tsx": `export const Pagination = () => null;`,
    });
    applyRenames(p, buildRenamePlan(["/src/Pagination.tsx"]).plan, { gitMove });

    expect(gitMove).toHaveBeenCalledWith(
      "/src/Pagination.tsx",
      "/src/pagination.tsx",
    );
  });

  it("does not delegate a structural rename to gitMove", () => {
    const gitMove = vi.fn();
    const p = project({
      "/src/MSWProvider.tsx": `export const MSWProvider = () => null;`,
    });
    applyRenames(p, buildRenamePlan(["/src/MSWProvider.tsx"]).plan, {
      gitMove,
    });

    expect(gitMove).not.toHaveBeenCalled();
  });

  it("rewrites an import that goes through a @/ path alias", () => {
    const p = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { baseUrl: "/", paths: { "@/*": ["src/*"] } },
    });
    p.createSourceFile(
      "/src/components/StatusCard.tsx",
      `export const StatusCard = () => null;`,
    );
    p.createSourceFile(
      "/src/app/page.tsx",
      `import { StatusCard } from "@/components/StatusCard";\nexport default StatusCard;`,
    );

    applyRenames(p, buildRenamePlan(["/src/components/StatusCard.tsx"]).plan);

    expect(p.getSourceFileOrThrow("/src/app/page.tsx").getFullText()).toContain(
      `from "@/components/status-card"`,
    );
  });

  it("rewrites a test file importing across the src/tests boundary", () => {
    const p = project({
      "/src/LoginForm.tsx": `export const LoginForm = () => null;`,
      "/tests/LoginForm.test.tsx": `import { LoginForm } from "../src/LoginForm";\nit("renders", () => LoginForm());`,
    });
    applyRenames(
      p,
      buildRenamePlan(["/src/LoginForm.tsx", "/tests/LoginForm.test.tsx"]).plan,
    );

    expect(p.getSourceFile("/tests/login-form.test.tsx")).toBeDefined();
    expect(
      p.getSourceFileOrThrow("/tests/login-form.test.tsx").getFullText(),
    ).toContain(`from "../src/login-form"`);
  });

  it("throws when a planned file is not part of the project", () => {
    const p = project({ "/src/a.ts": `export const a = 1;` });
    expect(() =>
      applyRenames(p, [
        { from: "/src/Ghost.ts", to: "/src/ghost.ts", caseOnly: false },
      ]),
    ).toThrow("not in project: /src/Ghost.ts");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run -c vitest.config.scripts.js scripts/__tests__/kebab-rename-engine.test.mjs`
Expected: FAIL — `Failed to load ../lib/kebab-rename-engine.mjs`

- [ ] **Step 3: Write the implementation**

```javascript
// scripts/lib/kebab-rename-engine.mjs
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run -c vitest.config.scripts.js scripts/__tests__/kebab-rename-engine.test.mjs`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/kebab-rename-engine.mjs scripts/__tests__/kebab-rename-engine.test.mjs
git commit -m "feat(scripts): add ts-morph rename engine for the kebab migration"
```

---

### Task 4: Codemod CLI

Wires Tasks 1–3 into one command that operates on a single workspace, with a dry run that prints the plan and refuses to proceed on a collision.

**Files:**

- Create: `scripts/codemod-kebab-filenames.mjs`
- Modify: `package.json` (add the `codemod:kebab` script)
- Test: `scripts/__tests__/codemod-kebab-filenames.test.mjs`

**Interfaces:**

- Consumes: `buildRenamePlan` (Task 1), `auditDynamicImports` (Task 2), `applyRenames` and `gitMoveCaseOnly` (Task 3).
- Produces: `collectFiles(workspaceDir: string, fs?: typeof import("node:fs")) => string[]` — every `.ts`/`.tsx` path under a workspace's `src`, `tests`, `test`, and `e2e` directories, excluding `node_modules`, `.next`, and any `generated` directory.

- [ ] **Step 1: Write the failing test**

```javascript
// scripts/__tests__/codemod-kebab-filenames.test.mjs
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectFiles } from "../codemod-kebab-filenames.mjs";

let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "kebab-"));
  const write = (rel) => {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), "export const x = 1;");
  };
  write("src/LoginForm.tsx");
  write("src/nested/deep/StatusCard.tsx");
  write("tests/LoginForm.test.tsx");
  write("e2e/checkout.spec.ts");
  write("src/generated/Types.ts");
  write("node_modules/pkg/Index.ts");
  write("src/styles.css");
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("collectFiles", () => {
  it("collects ts and tsx under src, tests and e2e", () => {
    const found = collectFiles(root).map((f) =>
      path.relative(root, f).split(path.sep).join("/"),
    );
    expect(found.sort()).toEqual([
      "e2e/checkout.spec.ts",
      "src/LoginForm.tsx",
      "src/nested/deep/StatusCard.tsx",
      "tests/LoginForm.test.tsx",
    ]);
  });

  it("excludes node_modules and generated directories", () => {
    const found = collectFiles(root).join("|");
    expect(found).not.toContain("node_modules");
    expect(found).not.toContain("generated");
  });

  it("excludes non-TypeScript files", () => {
    expect(collectFiles(root).join("|")).not.toContain("styles.css");
  });

  it("returns an empty array for a workspace with no source directories", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "kebab-empty-"));
    expect(collectFiles(empty)).toEqual([]);
    fs.rmSync(empty, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run -c vitest.config.scripts.js scripts/__tests__/codemod-kebab-filenames.test.mjs`
Expected: FAIL — `Failed to load ../codemod-kebab-filenames.mjs`

- [ ] **Step 3: Write the implementation**

```javascript
// scripts/codemod-kebab-filenames.mjs
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
  const { plan, collisions } = buildRenamePlan(
    files.map((f) => f.split(path.sep).join("/")),
  );

  if (collisions.length > 0) {
    console.error(`${collisions.length} collision(s) — refusing to proceed:`);
    for (const { target, sources } of collisions) {
      console.error(`  ${target} <= ${sources.join(", ")}`);
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
      console.warn(`  ${entry.file}:${entry.line}  ${entry.text}`);
    }
  }

  console.log(`${plan.length} file(s) to rename in ${values.workspace}`);
  for (const { from, to, caseOnly } of plan) {
    console.log(`  ${from} -> ${to}${caseOnly ? "  (case-only)" : ""}`);
  }

  if (values["dry-run"]) {
    console.log("dry run — nothing written");
    return;
  }

  applyRenames(project, plan, { gitMove: gitMoveCaseOnly });
  console.log(`renamed ${plan.length} file(s)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run -c vitest.config.scripts.js scripts/__tests__/codemod-kebab-filenames.test.mjs`
Expected: PASS — 4 tests

- [ ] **Step 5: Add the package script**

In `package.json`, alongside the other `scripts` entries:

```json
"codemod:kebab": "node scripts/codemod-kebab-filenames.mjs"
```

- [ ] **Step 6: Verify the dry run works against a real workspace**

Run: `pnpm codemod:kebab --workspace packages/api --dry-run`
Expected: prints exactly 3 renames and `dry run — nothing written`:

```
packages/api/src/graphql/mutator/graphqlFetch.ts -> packages/api/src/graphql/mutator/graphql-fetch.ts
packages/api/src/rest/mutator/customFetch.ts -> packages/api/src/rest/mutator/custom-fetch.ts
packages/api/src/supabase/currentUserId.ts -> packages/api/src/supabase/current-user-id.ts
```

- [ ] **Step 7: Run the whole script suite**

Run: `pnpm test:workflows`
Expected: PASS — all pre-existing script tests plus the 30 new ones

- [ ] **Step 8: Commit**

```bash
git add scripts/codemod-kebab-filenames.mjs scripts/__tests__/codemod-kebab-filenames.test.mjs package.json
git commit -m "feat(scripts): add kebab-filenames codemod CLI"
```

---

### Task 5: Pilot migration — `packages/api`

The smallest workspace (3 files), migrated on its own so the codemod is proven end-to-end against real code before it touches anything larger. This task's review gate is the decision point for the whole migration.

**Files:**

- Modify: 3 files in `packages/api/src` (renamed), plus any file importing them.

**Interfaces:**

- Consumes: `pnpm codemod:kebab` from Task 4.
- Produces: nothing consumed by later tasks — this is a proving run.

- [ ] **Step 1: Branch from develop**

```bash
git checkout develop && git pull
git checkout -b refactor/kebab-packages-api
```

- [ ] **Step 2: Dry run and read the output**

Run: `pnpm codemod:kebab --workspace packages/api --dry-run`
Expected: 3 renames, no collisions, no computed-import warnings.

- [ ] **Step 3: Apply**

Run: `pnpm codemod:kebab --workspace packages/api`
Expected: `renamed 3 file(s)`

- [ ] **Step 4: Confirm git recorded renames rather than delete-plus-add**

Run: `git status --porcelain`
Expected: `R` entries for the three files, plus `M` for any importer.

- [ ] **Step 5: Grep for path references the codemod cannot see**

Run:

```bash
grep -rn "graphqlFetch\|customFetch\|currentUserId" \
  --include="*.json" --include="*.mjs" --include="*.ts" --include="*.yml" \
  --exclude-dir=node_modules . | grep -v "packages/api/src"
```

Expected: no results referring to a file path. Identifier matches are fine — only file paths matter here.

- [ ] **Step 6: Verify**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: all pass. `forceConsistentCasingInFileNames` makes `typecheck` the authoritative gate on missed imports.

- [ ] **Step 7: Commit and open the PR**

```bash
git add -A
git commit -m "refactor(api): rename source files to kebab-case"
git push -u origin refactor/kebab-packages-api
gh pr create --base develop \
  --title "refactor(api): kebab-case filenames" \
  --body "Phase 0 pilot, 3 files. Codemod: \`pnpm codemod:kebab --workspace packages/api\`. Spec: docs/superpowers/specs/2026-09-06-kebab-migration-design.md"
```

- [ ] **Step 8: STOP for review**

Do not begin Task 6 until this PR is reviewed and merged. If the codemod produced anything unexpected, fix it in Tasks 1–4 and re-run the pilot.

---

### Task 6: Remaining ten workspaces

The same procedure per workspace, one PR each, ordered smallest blast radius first so the largest workspaces run last against the most-proven codemod.

**Files:**

- Modify: source, test, and e2e files across the ten remaining workspaces.

**Interfaces:**

- Consumes: `pnpm codemod:kebab` (Task 4), the procedure validated in Task 5.
- Produces: a fully compliant repository, which Task 7 then locks down.

For **each** workspace in this order, run the full step sequence below before moving to the next:

| #   | Workspace                 | `src` renames |
| --- | ------------------------- | ------------- |
| 1   | `packages/ui`             | 10            |
| 2   | `packages/auth`           | 10            |
| 3   | `packages/app-components` | 12            |
| 4   | `apps/landing`            | 11            |
| 5   | `apps/auth`               | 13            |
| 6   | `packages/shared`         | 29            |
| 7   | `apps/store`              | 58            |
| 8   | `apps/studio`             | 64            |
| 9   | `apps/admin`              | 89            |
| 10  | `apps/payments`           | 97            |

Counts are `src` only; each run also covers that workspace's `tests`, `test`, and `e2e` directories, which hold a further 298 renames in total.

Per workspace, substituting `<workspace>` (e.g. `packages/ui`) and `<slug>` (e.g. `packages-ui`):

- [ ] **Step 1: Branch**

```bash
git checkout develop && git pull
git checkout -b refactor/kebab-<slug>
```

- [ ] **Step 2: Dry run**

Run: `pnpm codemod:kebab --workspace <workspace> --dry-run`
Expected: a rename list, zero collisions. Stop and investigate if any collision appears — none exist as of 2026-09-06, so one means the tree has changed.

- [ ] **Step 3: Review every warning the dry run prints**

The dry run prints four things that need a human, none of which `pnpm typecheck` can catch:

1. **computed `import()` calls** — a template literal or identifier specifier. Open each at
   the reported line and confirm whether it resolves to a renamed file.
2. **non-relative dynamic `import()` specifiers** — path-aliased dynamic imports and
   `import("...")` type nodes. The codemod does not rewrite these (resolving them needs
   guesswork; `MSWProvider.tsx` exists in five workspaces). Twelve aliased dynamic imports
   and one aliased import-type node exist repo-wide as of 2026-09-06.
3. **`vi.mock` / `require` specifiers that would be rewritten** — a count. Sanity-check it
   against `grep -rc "vi\.mock" <workspace>`.
4. **`vi.mock` specifiers needing manual attention** — every one the codemod could not
   resolve. These are the dangerous ones: vitest treats a mock path that resolves to
   nothing as a **silent no-op**, so the suite stays green while exercising the real module.
   There is no compiler backstop — the argument is a `string`. Fix each by hand.

Note each in the PR description.

- [ ] **Step 4: Apply**

Run: `pnpm codemod:kebab --workspace <workspace>`

- [ ] **Step 5: Confirm git recorded renames**

Run: `git status --porcelain | grep -c "^R"`
Expected: a count matching the rename total from Step 2.

For `apps/admin` specifically, confirm **both** case-only renames landed:

```bash
git status --porcelain | grep -i pagination
```

Expected: two `R` entries — `src/features/users/presentation/components/Pagination.tsx -> .../pagination.tsx`
and `tests/Pagination.test.tsx -> tests/pagination.test.tsx`. Fewer than two means the two-step
`git mv` failed for one of them and must be fixed before committing.

- [ ] **Step 6: Grep for non-TypeScript path references**

```bash
grep -rn "<workspace>" --include="*.json" --include="*.mjs" --include="*.yml" \
  --include="Dockerfile*" --exclude-dir=node_modules . \
  | grep -iE "[A-Z][a-z]+\.tsx?"
```

Expected: no results. Any hit is a hardcoded path to a renamed file in a config, Docker file, or package script.

- [ ] **Step 6a: Fix stale config globs the codemod cannot see**

The codemod only rewrites TypeScript module specifiers. Two config files match source
files by **path glob**, and a glob that no longer matches fails **silently** — coverage
exclusions lapse (thresholds may then fail, or worse, quietly pass on newly-included
files) and per-file lint exemptions vanish, re-enabling rules that were deliberately
switched off.

1. `apps/{studio,payments,admin,auth,store}/vitest.config.mts` — the `coverage.exclude`
   arrays reference roughly 30 PascalCase/camelCase paths, e.g.
   `**/auth/application/hooks/useSupabaseAuth.ts`,
   `**/auth/presentation/components/ProtectedRoute.tsx`,
   `**/payment-methods/presentation/components/BlockEditor.tsx`,
   `**/shared/infrastructure/receiptActions.ts`, `**/domain/searchParams.ts`.
2. `eslint.config.mjs` — per-file overrides keyed on a path, notably
   `packages/shared/src/components/ThemeScript.tsx` (line ~1597),
   `${APP_SRC}/shared/infrastructure/providers/MSWProvider.tsx` (line ~1611),
   `${APP_SRC}/shared/application/utils/exportUtils.ts` (line ~1002), plus the
   `**/…/MSWProvider.tsx`, `**/…/exportUtils.ts` and `**/…/chartColors.ts` entries
   around line 1122.

Find every stale glob for the workspace being migrated by taking the old stem of each
rename git recorded and grepping the config files for it:

```bash
git status --porcelain |
  sed -n 's#^R[ M]* \(.*\) -> .*#\1#p' |
  xargs -n1 basename | cut -d. -f1 | sort -u |
  while read -r stem; do
    grep -rn "/$stem\." --include="*.mts" --include="*.mjs" --include="*.json" \
      --exclude-dir=node_modules apps packages eslint.config.mjs
  done
```

Update every hit by hand in the same PR. Expected after the edits: no hit refers to a
name that no longer exists on disk.

- [ ] **Step 6b (`packages/shared` only): update the `exports` map in `packages/shared/package.json`**

`packages/shared/package.json` hard-codes five subpath targets the codemod renames, and the
codemod never touches `package.json`:

| Subpath key                     | Current target                         | New target                                |
| ------------------------------- | -------------------------------------- | ----------------------------------------- |
| `./app-root-layout`             | `./src/components/AppRootLayout.tsx`   | `./src/components/app-root-layout.tsx`    |
| `./i18n/createAppI18n`          | `./src/i18n/createAppI18n.ts`          | `./src/i18n/create-app-i18n.ts`           |
| `./i18n/createAppRouting`       | `./src/i18n/createAppRouting.ts`       | `./src/i18n/create-app-routing.ts`        |
| `./i18n/createAppRequestConfig` | `./src/i18n/createAppRequestConfig.ts` | `./src/i18n/create-app-request-config.ts` |
| `./i18n/createIntlProxy`        | `./src/i18n/createIntlProxy.ts`        | `./src/i18n/create-intl-proxy.ts`         |

This **must** be done by hand in the `packages/shared` PR. Node resolves these paths
case-insensitively on Windows, so a local `pnpm build` will keep passing while Linux CI
and every Docker image break. Change only the target paths; leaving the subpath **keys**
alone keeps every existing `shared/i18n/createAppI18n` importer resolving through the
exports map.

- [ ] **Step 7: Verify**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: all pass.

- [ ] **Step 8: Run e2e where the workspace has it**

For `apps/store`, `apps/admin`, `apps/auth`, `apps/landing`, `apps/payments`:

Run: `pnpm e2e:ci`
Expected: pass.

- [ ] **Step 9: Commit and open the PR**

```bash
git add -A
git commit -m "refactor(<slug>): rename source files to kebab-case"
git push -u origin refactor/kebab-<slug>
gh pr create --base develop \
  --title "refactor(<slug>): kebab-case filenames" \
  --body "Phase 0. Codemod: \`pnpm codemod:kebab --workspace <workspace>\`. Spec: docs/superpowers/specs/2026-09-06-kebab-migration-design.md"
```

- [ ] **Step 10: Merge before starting the next workspace**

Sequential merges keep each diff reviewable against a clean `develop` and avoid rename-versus-rename conflicts between open branches.

#### Expected cross-workspace breakage in the `packages/shared` PR

The codemod builds its `ts-morph` project from **one** workspace's `tsconfig.json`, so deep
imports living in _other_ workspaces are invisible to it and are never rewritten. Measured
2026-09-06: **44** such sites, all of them pointing into `packages/shared`, all from
`apps/*/src`.

| Target (after rename)                                                    | Sites  |
| ------------------------------------------------------------------------ | ------ |
| `createIntlProxy` → `create-intl-proxy`                                  | 7      |
| `AppRootLayout` → `app-root-layout` (via the `exports` map, see Step 6b) | 7      |
| `appUrls` → `app-urls`                                                   | 7      |
| `createAppI18n` → `create-app-i18n`                                      | 7      |
| `createAppRequestConfig` → `create-app-request-config`                   | 7      |
| `createAppRouting` → `create-app-routing`                                | 7      |
| `receiptPath` → `receipt-path`                                           | 2      |
| **Total**                                                                | **44** |

The earlier figure of 37 omitted the seven `shared/app-root-layout` sites, which resolve
through `packages/shared/package.json`'s `exports` map rather than a tsconfig path alias.

This is **not** silent: Step 7's repo-wide `pnpm typecheck` enumerates every broken site by
file and line. Fix them in the same PR. `packages/ui`, `packages/api` and `packages/auth`
are unaffected — their cross-package imports are either barrel-only or already kebab-case.

#### Cross-app relative import

`apps/admin/e2e/reports.spec.ts` imports `../../auth/e2e/helpers/receiptFixtures`, which
lives in the **`apps/auth`** rename plan, not `apps/admin`'s. Whichever of the two PRs runs
second must fix this by hand — the `apps/auth` run cannot see the admin importer, and the
`apps/admin` run cannot see the auth file. `pnpm typecheck` catches it.

---

### Task 7: Enforcement

Lands only after all eleven workspaces are merged and the repository is at zero violations. Turning any of this on earlier reddens CI for the duration of the migration.

**Files:**

- Modify: `eslint.config.mjs:916`
- Modify: `.ls-lint.yml`
- Modify: `.claude/rules/naming-conventions.md`

**Interfaces:**

- Consumes: a fully migrated repository (Tasks 5–6).
- Produces: nothing consumed by later tasks. This is the terminal task of Phase 0.

- [ ] **Step 1: Confirm the repository is actually at zero violations**

```bash
node -e '
const fs=require("fs"),p=require("path");
const kebab=s=>s.replace(/([a-z0-9])([A-Z])/g,"$1-$2").replace(/([A-Z]+)([A-Z][a-z])/g,"$1-$2").toLowerCase();
const files=[];const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);
if(e.isDirectory()){if(!/node_modules|\.next|generated/.test(e.name))walk(f);}else if(/\.tsx?$/.test(e.name))files.push(f);}};
for(const g of ["apps","packages"])for(const w of fs.readdirSync(g))for(const s of ["src","tests","test","e2e"]){const d=p.join(g,w,s);if(fs.existsSync(d))walk(d);}
const bad=files.filter(f=>{const b=p.basename(f),st=b.slice(0,b.indexOf(".",1));return kebab(st)!==st;});
console.log("scanned",files.length,"violations",bad.length);bad.slice(0,20).forEach(f=>console.log("  "+f));
'
```

Expected: `scanned 1067 violations 0` (file count may differ if the tree changed since 2026-09-06).

- [ ] **Step 2: Branch**

```bash
git checkout develop && git pull
git checkout -b chore/kebab-enforcement
```

- [ ] **Step 3: Turn on the ESLint rule**

In `eslint.config.mjs`, in the block commented `// Unicorn overrides for existing code patterns` (line 916), replace:

```js
      "unicorn/filename-case": "off",
```

with:

```js
      "unicorn/filename-case": ["error", { case: "kebabCase" }],
```

Leave the four sibling `unicorn/*` overrides unchanged.

- [ ] **Step 4: Verify the rule fires and the repo is clean**

Run: `pnpm lint`
Expected: PASS with zero `unicorn/filename-case` errors.

Then prove the rule is live rather than silently inert:

```bash
cp packages/ui/src/components/info-badge.tsx packages/ui/src/components/TempCheck.tsx
pnpm lint 2>&1 | grep "filename-case"
rm packages/ui/src/components/TempCheck.tsx
```

Expected: the grep prints a `filename-case` error for `TempCheck.tsx`. If it prints nothing, the rule is not being applied to that path and the config change is wrong.

- [ ] **Step 5: Replace the ls-lint rules**

Replace the whole `ls:` block in `.ls-lint.yml` with:

```yaml
ls:
  apps/*/src:
    .ts: kebab-case
    .tsx: kebab-case
    .js: kebab-case
    .css: kebab-case
    .json: kebab-case

  apps/*/tests:
    .ts: kebab-case
    .tsx: kebab-case

  apps/*/test:
    .ts: kebab-case
    .tsx: kebab-case

  apps/*/e2e:
    .ts: kebab-case
    .spec.ts: kebab-case

  packages/*/src:
    .ts: kebab-case
    .tsx: kebab-case

  packages/*/tests:
    .ts: kebab-case
    .tsx: kebab-case
```

Leave the `ignore:` block unchanged. Replace the file's leading comment block — which currently documents the camelCase and PascalCase allowances — with:

```yaml
# ls-lint configuration
# Enforces kebab-case file naming across the monorepo.
# Rationale and alternatives considered: orrery/docs/decisions/0001-file-naming.md
```

- [ ] **Step 6: Verify ls-lint passes with the extended coverage**

Run: `pnpm ls-lint`
Expected: PASS. This is the first time `apps/*/tests`, `apps/*/test`, and `packages/*/tests` have ever been checked for naming.

- [ ] **Step 7: Rewrite the naming-conventions rule document**

In `.claude/rules/naming-conventions.md`, replace the `### Files` table (lines 13–26, ending with the shadcn/ui exception paragraph) with:

```markdown
### Files

All files are **kebab-case**, without exception.

| Type             | Example                  |
| ---------------- | ------------------------ |
| React Components | `login-form.tsx`         |
| Hooks            | `use-auth.ts`            |
| Utilities        | `format-date.ts`         |
| Types/Interfaces | `user-types.ts`          |
| Constants        | `api-endpoints.ts`       |
| Services         | `auth-service.ts`        |
| Repositories     | `user-repository.ts`     |
| Test files       | Same as source + `.test` |

Acronyms are split like any other word boundary: `MSWProvider` becomes
`msw-provider`, `useAIData` becomes `use-ai-data`.

Enforced by `unicorn/filename-case` in `eslint.config.mjs` and by `.ls-lint.yml`.
Reasoning and the alternatives considered:
`orrery/docs/decisions/0001-file-naming.md`.
```

Leave the **Folders** table and every identifier-casing section (variables, functions, constants, enum-like objects) unchanged — those are out of scope.

- [ ] **Step 8: Full verification**

```bash
pnpm lint
pnpm ls-lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:tools
```

Expected: all pass.

- [ ] **Step 9: Commit and open the PR**

```bash
git add eslint.config.mjs .ls-lint.yml .claude/rules/naming-conventions.md
git commit -m "chore: enforce kebab-case filenames

Turns on unicorn/filename-case, replaces the permissive ls-lint regexes,
and extends ls-lint coverage to apps/*/tests, apps/*/test and
packages/*/tests, which were previously unchecked for naming.

Ref: orrery/docs/decisions/0001-file-naming.md"
git push -u origin chore/kebab-enforcement
gh pr create --base develop \
  --title "chore: enforce kebab-case filenames" \
  --body "Phase 0 final. Closes the enforcement gap that allowed 694 files to drift. Spec: docs/superpowers/specs/2026-09-06-kebab-migration-design.md"
```

---

## Done when

- `pnpm ls-lint` passes with coverage over `apps/*/{src,tests,test,e2e}` and `packages/*/{src,tests}`.
- `pnpm lint` passes with `unicorn/filename-case` set to `error`.
- A deliberately mis-named file causes `pnpm lint` to fail (verified in Task 7, Step 4).
- `.claude/rules/naming-conventions.md` documents one rule, and the shadcn/ui exception is gone.
- `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm e2e:ci` all pass on `develop`.

## Next

Phase 1 (aeleos: add `forceConsistentCasingInFileNames`, zero renames) and Phase 2 (build orrery) are separate plans. Phase 2 begins with `orrery diff-eslint`, because it sizes the reconciliation work.
