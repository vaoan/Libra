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
