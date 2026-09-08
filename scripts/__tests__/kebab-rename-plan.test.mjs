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
