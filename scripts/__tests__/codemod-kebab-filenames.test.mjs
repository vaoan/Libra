import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  collectFiles,
  workingTreeStatus,
} from "../codemod-kebab-filenames.mjs";

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

describe("workingTreeStatus", () => {
  const gitError = (status, stderr) => {
    const error = new Error("Command failed");
    error.status = status;
    error.stderr = Buffer.from(stderr);
    return error;
  };

  it("returns git's porcelain output when git succeeds", () => {
    const run = vi.fn(() => " M src/a.ts\n");
    expect(workingTreeStatus("/repo", { run })).toBe(" M src/a.ts\n");
  });

  it("returns null only when the directory is not a git repository", () => {
    const run = vi.fn(() => {
      throw gitError(
        128,
        "fatal: not a git repository (or any of the parent directories): .git\n",
      );
    });
    expect(workingTreeStatus("/tmp/plain", { run })).toBeNull();
  });

  it("throws, naming the error, when git is missing entirely", () => {
    const run = vi.fn(() => {
      const error = new Error("spawnSync git ENOENT");
      error.code = "ENOENT";
      throw error;
    });

    // The old behaviour returned null here, which the caller reads as "clean"
    // — silently disabling the guard on the destructive path.
    expect(() => workingTreeStatus("/repo", { run })).toThrow(/ENOENT/);
  });

  it("throws rather than proceeding when the index is locked", () => {
    const run = vi.fn(() => {
      throw gitError(
        128,
        "fatal: Unable to create '/repo/.git/index.lock': File exists.\n",
      );
    });
    expect(() => workingTreeStatus("/repo", { run })).toThrow(
      /could not determine the git working tree status/,
    );
  });
});
