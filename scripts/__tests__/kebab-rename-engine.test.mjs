import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Project } from "ts-morph";
import { buildRenamePlan } from "../lib/kebab-rename-plan.mjs";
import {
  applyRenames,
  gitMoveCaseOnly,
  recordImportSpecifiers,
} from "../lib/kebab-rename-engine.mjs";

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

  it("leaves a relative dynamic import to ts-morph, without double-handling it", () => {
    const p = project({
      "/src/StatusCard.tsx": `export const StatusCard = () => null;`,
      "/src/lazy.ts": `export const Lazy = () => import("./StatusCard");`,
    });
    const report = applyRenames(
      p,
      buildRenamePlan(["/src/StatusCard.tsx"]).plan,
    );

    expect(report.dynamicRewrites).toBe(0);
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

  it("leaves alias imports of non-renamed files completely unchanged", () => {
    const p = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { baseUrl: "/", paths: { "@/*": ["src/*"] } },
    });
    p.createSourceFile(
      "/src/components/Button.tsx",
      `export const Button = () => null;`,
    );
    p.createSourceFile(
      "/src/components/StatusCard.tsx",
      `export const StatusCard = () => null;`,
    );
    p.createSourceFile(
      "/src/app/page.tsx",
      `import { Button } from "@/components/Button";\nimport { StatusCard } from "@/components/StatusCard";\nexport default () => (Button(), StatusCard());`,
    );

    // Only rename StatusCard, not Button
    applyRenames(p, buildRenamePlan(["/src/components/StatusCard.tsx"]).plan);

    const pageText = p.getSourceFileOrThrow("/src/app/page.tsx").getFullText();
    // Button import should not be changed (it's not in the plan)
    expect(pageText).toContain(`from "@/components/Button"`);
    // StatusCard import should be updated to the kebab-case name
    expect(pageText).toContain(`from "@/components/status-card"`);
  });
});

describe("recordImportSpecifiers", () => {
  it("records a RELATIVE specifier whose target is a case-only rename", () => {
    const p = project({
      "/src/Pagination.tsx": `export const Pagination = () => null;`,
      "/src/page.tsx": `import { Pagination } from "./Pagination";\nexport default Pagination;`,
    });
    const { plan } = buildRenamePlan(["/src/Pagination.tsx"]);
    const records = recordImportSpecifiers(p, plan);

    expect(records).toHaveLength(1);
    expect(records[0].relative).toBe(true);
    expect(records[0].specifier).toBe("./Pagination");
    expect(records[0].resolvedPath).toBe("/src/Pagination.tsx");
  });

  it("records a relative re-export of a case-only rename too", () => {
    const p = project({
      "/src/Pagination.tsx": `export const Pagination = () => null;`,
      "/src/index.ts": `export { Pagination } from "./Pagination";`,
    });
    const { plan } = buildRenamePlan(["/src/Pagination.tsx"]);

    expect(recordImportSpecifiers(p, plan).map((r) => r.specifier)).toEqual([
      "./Pagination",
    ]);
  });

  it("does NOT record a relative specifier for a structural rename", () => {
    const p = project({
      "/src/LoginForm.tsx": `export const LoginForm = () => null;`,
      "/src/page.tsx": `import { LoginForm } from "./LoginForm";\nexport default LoginForm;`,
    });
    const { plan } = buildRenamePlan(["/src/LoginForm.tsx"]);

    // ts-morph's move rewrites these on its own.
    expect(recordImportSpecifiers(p, plan)).toEqual([]);
  });

  it("still records non-relative specifiers", () => {
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
    const { plan } = buildRenamePlan(["/src/components/StatusCard.tsx"]);
    const records = recordImportSpecifiers(p, plan);

    expect(records).toHaveLength(1);
    expect(records[0].relative).toBe(false);
    expect(records[0].specifier).toBe("@/components/StatusCard");
  });
});

describe("applyRenames on a case-INSENSITIVE (real) filesystem", () => {
  let directory;

  afterEach(() => {
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
    directory = null;
  });

  it("rewrites a relative importer of a case-only rename", () => {
    directory = fs
      .mkdtempSync(path.join(os.tmpdir(), "kebab-caseonly-"))
      .split(path.sep)
      .join("/");
    fs.mkdirSync(`${directory}/src`, { recursive: true });
    fs.writeFileSync(
      `${directory}/src/Pagination.tsx`,
      "export const Pagination = () => null;\n",
    );
    fs.writeFileSync(
      `${directory}/src/page.tsx`,
      'import { Pagination } from "./Pagination";\nexport default Pagination;\n',
    );

    const p = new Project({
      compilerOptions: { baseUrl: directory, jsx: 4 },
      skipAddingFilesFromTsConfig: true,
    });
    p.addSourceFilesAtPaths(`${directory}/src/**/*.tsx`);

    const { plan } = buildRenamePlan([`${directory}/src/Pagination.tsx`]);
    expect(plan[0].caseOnly).toBe(true);

    applyRenames(p, plan);

    const page = fs.readFileSync(`${directory}/src/page.tsx`, "utf8");
    expect(page).toContain('from "./pagination"');
    expect(page).not.toContain('from "./Pagination"');
  });
});

describe("vi.mock specifier rewriting", () => {
  it("rewrites a relative vi.mock target", () => {
    const p = project({
      "/src/LoginForm.tsx": `export const LoginForm = () => null;`,
      "/src/login.test.ts": `import { vi } from "vitest";\nvi.mock("./LoginForm");`,
    });
    const report = applyRenames(
      p,
      buildRenamePlan(["/src/LoginForm.tsx"]).plan,
    );

    expect(report.mockRewrites).toBe(1);
    expect(
      p.getSourceFileOrThrow("/src/login.test.ts").getFullText(),
    ).toContain(`vi.mock("./login-form")`);
  });

  it("rewrites an aliased vi.mock target", () => {
    const p = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { baseUrl: "/", paths: { "@/*": ["src/*"] } },
    });
    p.createSourceFile(
      "/src/components/StatusCard.tsx",
      `export const StatusCard = () => null;`,
    );
    p.createSourceFile(
      "/tests/status.test.ts",
      `import { vi } from "vitest";\nvi.mock("@/components/StatusCard");\nvi.doMock("@/components/StatusCard");`,
    );

    const report = applyRenames(
      p,
      buildRenamePlan(["/src/components/StatusCard.tsx"]).plan,
    );

    expect(report.mockRewrites).toBe(2);
    const text = p.getSourceFileOrThrow("/tests/status.test.ts").getFullText();
    expect(text).toContain(`vi.mock("@/components/status-card")`);
    expect(text).toContain(`vi.doMock("@/components/status-card")`);
  });

  it("rewrites vi.importActual and require targets", () => {
    const p = project({
      "/src/MSWProvider.tsx": `export const MSWProvider = () => null;`,
      "/src/setup.ts": `import { vi } from "vitest";\nvi.importActual("./MSWProvider");\nconst m = require("./MSWProvider");`,
    });
    const report = applyRenames(
      p,
      buildRenamePlan(["/src/MSWProvider.tsx"]).plan,
    );

    expect(report.mockRewrites).toBe(2);
    const text = p.getSourceFileOrThrow("/src/setup.ts").getFullText();
    expect(text).toContain(`vi.importActual("./msw-provider")`);
    expect(text).toContain(`require("./msw-provider")`);
  });

  it("leaves a mock of a non-renamed module untouched", () => {
    const p = project({
      "/src/LoginForm.tsx": `export const LoginForm = () => null;`,
      "/src/login.test.ts": `import { vi } from "vitest";\nvi.mock("next/navigation");`,
    });
    const report = applyRenames(
      p,
      buildRenamePlan(["/src/LoginForm.tsx"]).plan,
    );

    expect(report.mockRewrites).toBe(0);
    expect(
      p.getSourceFileOrThrow("/src/login.test.ts").getFullText(),
    ).toContain(`vi.mock("next/navigation")`);
  });

  it("reports an unresolvable non-kebab mock target for manual attention", () => {
    const p = project({
      "/src/LoginForm.tsx": `export const LoginForm = () => null;`,
      "/src/login.test.ts": `import { vi } from "vitest";\nvi.mock("@/nowhere/GhostModule");`,
    });
    const report = applyRenames(
      p,
      buildRenamePlan(["/src/LoginForm.tsx"]).plan,
    );

    expect(report.mockManual).toHaveLength(1);
    expect(report.mockManual[0].specifier).toBe("@/nowhere/GhostModule");
    expect(report.mockManual[0].line).toBe(2);
  });

  it("reports a computed vi.mock target for manual attention", () => {
    const p = project({
      "/src/LoginForm.tsx": `export const LoginForm = () => null;`,
      "/src/login.test.ts":
        'import { vi } from "vitest";\nconst n = "LoginForm";\nvi.mock(`./${n}`);',
    });
    const report = applyRenames(
      p,
      buildRenamePlan(["/src/LoginForm.tsx"]).plan,
    );

    expect(report.mockManual).toHaveLength(1);
    expect(report.mockManual[0].reason).toMatch(/computed/);
  });
});

describe("last-segment guard", () => {
  it("skips and reports a specifier whose last segment does not name the file", () => {
    const p = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        baseUrl: "/",
        paths: { "shared/app-root-layout": ["src/AppRootLayout"] },
      },
    });
    p.createSourceFile(
      "/src/AppRootLayout.tsx",
      `export const AppRootLayout = () => null;`,
    );
    p.createSourceFile(
      "/app/page.tsx",
      `import { AppRootLayout } from "shared/app-root-layout";\nexport default AppRootLayout;`,
    );

    const report = applyRenames(
      p,
      buildRenamePlan(["/src/AppRootLayout.tsx"]).plan,
    );

    expect(report.specifierMismatches).toHaveLength(1);
    expect(report.specifierMismatches[0].specifier).toBe(
      "shared/app-root-layout",
    );
    // Left exactly as it was, rather than rewritten to a path that resolves
    // to nothing.
    expect(p.getSourceFileOrThrow("/app/page.tsx").getFullText()).toContain(
      `from "shared/app-root-layout"`,
    );
  });

  it("reports a refused mock specifier once, not under two headings", () => {
    const p = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        baseUrl: "/",
        paths: { "shared/app-root-layout": ["src/AppRootLayout"] },
      },
    });
    p.createSourceFile(
      "/src/AppRootLayout.tsx",
      `export const AppRootLayout = () => null;`,
    );
    p.createSourceFile(
      "/tests/layout.test.ts",
      `import { vi } from "vitest";\nvi.mock("shared/app-root-layout");`,
    );

    const report = applyRenames(
      p,
      buildRenamePlan(["/src/AppRootLayout.tsx"]).plan,
    );

    expect(report.specifierMismatches).toHaveLength(1);
    expect(report.mockManual).toEqual([]);
  });
});

describe("report counters", () => {
  it("counts only import specifiers it actually changed", () => {
    const p = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { baseUrl: "/", paths: { "@/*": ["src/*"] } },
    });
    p.createSourceFile(
      "/src/components/StatusCard.tsx",
      `export const StatusCard = () => null;`,
    );
    p.createSourceFile(
      "/src/components/Button.tsx",
      `export const Button = () => null;`,
    );
    p.createSourceFile(
      "/src/app/page.tsx",
      `import { StatusCard } from "@/components/StatusCard";\nimport { Button } from "@/components/Button";\nexport default () => (StatusCard(), Button());`,
    );

    const report = applyRenames(
      p,
      buildRenamePlan(["/src/components/StatusCard.tsx"]).plan,
    );

    // One planned rename, one aliased importer of it — and nothing else.
    expect(report.importRewrites).toBe(1);
  });
});

describe("aliased dynamic import() and import-type rewriting", () => {
  const aliasProject = () =>
    new Project({
      useInMemoryFileSystem: true,
      compilerOptions: { baseUrl: "/", paths: { "@/*": ["src/*"] } },
    });

  it("rewrites an aliased dynamic import()", () => {
    const p = aliasProject();
    p.createSourceFile(
      "/src/shared/auditLog.ts",
      `export const insertAuditLog = () => null;`,
    );
    p.createSourceFile(
      "/src/app/route.ts",
      `export const load = async () => await import("@/shared/auditLog");`,
    );

    const report = applyRenames(
      p,
      buildRenamePlan(["/src/shared/auditLog.ts"]).plan,
    );

    expect(report.dynamicRewrites).toBe(1);
    expect(p.getSourceFileOrThrow("/src/app/route.ts").getFullText()).toContain(
      `import("@/shared/audit-log")`,
    );
  });

  it("rewrites an aliased typeof import(...) type node", () => {
    const p = aliasProject();
    p.createSourceFile(
      "/src/shared/auditLog.ts",
      `export const insertAuditLog = () => null;`,
    );
    p.createSourceFile(
      "/tests/audit.test.ts",
      `type Insert = typeof import("@/shared/auditLog").insertAuditLog;\nexport type { Insert };`,
    );

    const report = applyRenames(
      p,
      buildRenamePlan(["/src/shared/auditLog.ts"]).plan,
    );

    expect(report.dynamicRewrites).toBe(1);
    expect(
      p.getSourceFileOrThrow("/tests/audit.test.ts").getFullText(),
    ).toContain(`typeof import("@/shared/audit-log").insertAuditLog`);
  });

  it("leaves an aliased dynamic import of a NON-renamed file untouched", () => {
    const p = aliasProject();
    p.createSourceFile(
      "/src/shared/utils.ts",
      `export const noop = () => null;`,
    );
    p.createSourceFile(
      "/src/shared/auditLog.ts",
      `export const insertAuditLog = () => null;`,
    );
    p.createSourceFile(
      "/src/app/route.ts",
      `export const load = async () => await import("@/shared/utils");`,
    );

    // Only auditLog is planned; utils is already kebab-case.
    const report = applyRenames(
      p,
      buildRenamePlan(["/src/shared/auditLog.ts"]).plan,
    );

    expect(report.dynamicRewrites).toBe(0);
    expect(report.specifierMismatches).toEqual([]);
    expect(p.getSourceFileOrThrow("/src/app/route.ts").getFullText()).toContain(
      `import("@/shared/utils")`,
    );
  });

  it("reports, and does not rewrite, a dynamic import whose last segment does not name the file", () => {
    const p = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        baseUrl: "/",
        paths: { "shared/app-root-layout": ["src/AppRootLayout"] },
      },
    });
    p.createSourceFile(
      "/src/AppRootLayout.tsx",
      `export const AppRootLayout = () => null;`,
    );
    p.createSourceFile(
      "/src/app/route.ts",
      `export const load = async () => await import("shared/app-root-layout");`,
    );

    const report = applyRenames(
      p,
      buildRenamePlan(["/src/AppRootLayout.tsx"]).plan,
    );

    expect(report.dynamicRewrites).toBe(0);
    expect(report.specifierMismatches).toHaveLength(1);
    expect(report.specifierMismatches[0].specifier).toBe(
      "shared/app-root-layout",
    );
    expect(p.getSourceFileOrThrow("/src/app/route.ts").getFullText()).toContain(
      `import("shared/app-root-layout")`,
    );
  });
});

describe("gitMoveCaseOnly", () => {
  it("moves through a temporary name", () => {
    const run = vi.fn();
    gitMoveCaseOnly("/a/Pagination.tsx", "/a/pagination.tsx", { run });

    expect(run.mock.calls.map((call) => call[1])).toEqual([
      ["mv", "/a/Pagination.tsx", "/a/Pagination.tsx.casetmp"],
      ["mv", "/a/Pagination.tsx.casetmp", "/a/pagination.tsx"],
    ]);
  });

  it("surfaces git's stderr as text, not as a decimal byte dump", () => {
    const run = vi.fn(() => {
      const error = new Error("Command failed");
      error.stderr = Buffer.from("fatal: bad source, source=Pagination.tsx\n");
      throw error;
    });

    expect(() =>
      gitMoveCaseOnly("/a/Pagination.tsx", "/a/pagination.tsx", { run }),
    ).toThrow(/fatal: bad source, source=Pagination\.tsx/);
  });

  it("restores the .casetmp file when the second move fails", () => {
    const run = vi.fn((_command, args) => {
      if (args[2] === "/a/pagination.tsx") {
        const error = new Error("Command failed");
        error.stderr = Buffer.from("fatal: destination exists\n");
        throw error;
      }
    });

    expect(() =>
      gitMoveCaseOnly("/a/Pagination.tsx", "/a/pagination.tsx", { run }),
    ).toThrow(/restored/);

    expect(run.mock.calls[2][1]).toEqual([
      "mv",
      "/a/Pagination.tsx.casetmp",
      "/a/Pagination.tsx",
    ]);
  });

  it("falls back to a filesystem rename when git cannot restore the temp file", () => {
    const run = vi.fn((_command, args) => {
      if (args[1].endsWith(".casetmp")) {
        const error = new Error("Command failed");
        error.stderr = Buffer.from("fatal: not under version control\n");
        throw error;
      }
    });
    const rename = vi.fn();

    expect(() =>
      gitMoveCaseOnly("/a/Pagination.tsx", "/a/pagination.tsx", {
        run,
        rename,
      }),
    ).toThrow(/restored/);

    expect(rename).toHaveBeenCalledWith(
      "/a/Pagination.tsx.casetmp",
      "/a/Pagination.tsx",
    );
  });

  it("warns instead of hiding the failure when cleanup is impossible", () => {
    const run = vi.fn((_command, args) => {
      if (args[1].endsWith(".casetmp")) throw new Error("git exploded");
    });
    const rename = vi.fn(() => {
      throw new Error("EPERM");
    });

    expect(() =>
      gitMoveCaseOnly("/a/Pagination.tsx", "/a/pagination.tsx", {
        run,
        rename,
      }),
    ).toThrow(/could not clean up/);
  });
});
