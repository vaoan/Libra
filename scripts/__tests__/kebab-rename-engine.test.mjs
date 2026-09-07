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
