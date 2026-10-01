// scripts/__tests__/dynamic-import-audit.test.mjs
import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import {
  auditDynamicImports,
  partitionDynamicImports,
} from "../lib/dynamic-import-audit.mjs";

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

  it("carries the literal specifier value for a static call", () => {
    const found = auditDynamicImports(
      projectWith(`const m = import("@/components/StatusCard");`),
    );
    expect(found[0].specifier).toBe("@/components/StatusCard");
  });

  it("leaves the specifier null for a computed call", () => {
    const found = auditDynamicImports(
      projectWith("const n = 'x';\nconst m = import(`./${n}`);"),
    );
    expect(found[0].specifier).toBeNull();
  });

  it("captures an import() type node", () => {
    const found = auditDynamicImports(
      projectWith(`type T = import("shared/AppRootLayout").Props;`),
    );
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("type");
    expect(found[0].static).toBe(true);
    expect(found[0].specifier).toBe("shared/AppRootLayout");
  });
});

describe("partitionDynamicImports", () => {
  it("separates computed specifiers from aliased ones", () => {
    const entries = auditDynamicImports(
      projectWith(
        [
          `const a = import("./relative-one");`,
          `const b = import("@/components/StatusCard");`,
          `const n = "x";`,
          "const c = import(`./${n}`);",
        ].join("\n"),
      ),
    );

    const { computed, aliased } = partitionDynamicImports(entries);
    expect(computed.map((e) => e.line)).toEqual([4]);
    expect(aliased.map((e) => e.specifier)).toEqual([
      "@/components/StatusCard",
    ]);
  });

  it("does not discard a static-but-aliased specifier the way !static did", () => {
    const entries = auditDynamicImports(
      projectWith(`const b = import("shared/createAppI18n");`),
    );
    expect(entries.filter((e) => !e.static)).toEqual([]);
    expect(partitionDynamicImports(entries).aliased).toHaveLength(1);
  });
});
