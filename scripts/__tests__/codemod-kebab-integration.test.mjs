import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CODEMOD_SCRIPT = fileURLToPath(
  new URL("../codemod-kebab-filenames.mjs", import.meta.url),
);

let fixtureDir;

afterEach(() => {
  if (fixtureDir) {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    fixtureDir = null;
  }
});

/** Every file under `root`, as sorted POSIX paths relative to it. */
function listFiles(root) {
  const out = [];
  const walk = (directory, prefix) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(directory, entry.name), relative);
      else out.push(relative);
    }
  };
  walk(root, "");
  return out.sort();
}

function writeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kebab-integration-"));

  // `include` deliberately covers only `src`, exactly like every packages/*
  // tsconfig in this repo. The CLI must add the `tests` files to the project
  // itself or the rename aborts with "not in project".
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } },
      include: ["src/**/*.ts", "src/**/*.tsx"],
    }),
  );

  fs.mkdirSync(path.join(root, "src", "components"), { recursive: true });
  fs.mkdirSync(path.join(root, "src", "app"), { recursive: true });
  fs.mkdirSync(path.join(root, "tests"), { recursive: true });

  fs.writeFileSync(
    path.join(root, "src", "components", "StatusCard.tsx"),
    "export function StatusCard() { return null; }",
  );
  fs.writeFileSync(
    path.join(root, "src", "index.ts"),
    'export { StatusCard } from "./components/StatusCard";',
  );
  fs.writeFileSync(
    path.join(root, "src", "app", "page.tsx"),
    'import { StatusCard } from "@/components/StatusCard";\nexport default StatusCard;',
  );
  // A path-aliased dynamic import and an import-type node: ts-morph's move
  // touches neither, and tsc only catches them after the rename has landed.
  fs.writeFileSync(
    path.join(root, "src", "lazy.ts"),
    [
      'export const load = () => import("@/components/StatusCard");',
      'export type Card = typeof import("@/components/StatusCard").StatusCard;',
      'export const keep = () => import("@/components/StatusCard");',
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(root, "tests", "StatusCard.test.tsx"),
    [
      'import { vi } from "vitest";',
      'import { StatusCard } from "../src/components/StatusCard";',
      'vi.mock("@/components/StatusCard");',
      'vi.mock("../src/components/StatusCard");',
      'it("renders", () => StatusCard());',
    ].join("\n"),
  );

  return root;
}

function runCodemod(workspace, extraArgs = []) {
  // Run from a directory that is neither the repo nor the fixture, so any
  // cwd-relative path handling fails loudly. stdout and stderr are joined
  // because the CLI reports on both — every warning goes to console.warn.
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "kebab-run-"));
  try {
    const result = spawnSync(
      "node",
      [CODEMOD_SCRIPT, "--workspace", workspace, ...extraArgs],
      { cwd: runDir, encoding: "utf8" },
    );
    if (result.error) throw result.error;
    const output = `${result.stdout}${result.stderr}`;
    if (result.status !== 0) {
      throw new Error(`codemod exited ${result.status}\n${output}`);
    }
    return output;
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
}

const read = (...segments) =>
  fs.readFileSync(path.join(fixtureDir, ...segments), "utf-8");

describe("codemod CLI integration", () => {
  it("renames files and updates every kind of specifier", () => {
    fixtureDir = writeFixture();

    const output = runCodemod(fixtureDir);

    // The tree ends up in exactly this shape — no file left behind at its old
    // name, and no directory nested under a source directory.
    expect(listFiles(fixtureDir)).toEqual([
      "src/app/page.tsx",
      "src/components/status-card.tsx",
      "src/index.ts",
      "src/lazy.ts",
      "tests/status-card.test.tsx",
      "tsconfig.json",
    ]);

    // Relative re-export, rewritten by ts-morph's move.
    expect(read("src", "index.ts")).toContain("./components/status-card");

    // Alias import, rewritten by pass 3.
    expect(read("src", "app", "page.tsx")).toContain(
      "@/components/status-card",
    );

    // The test file lives outside the tsconfig `include`, so this only passes
    // because the CLI adds collected files to the project.
    const testFile = read("tests", "status-card.test.tsx");
    expect(testFile).toContain('from "../src/components/status-card"');
    expect(testFile).toContain('vi.mock("@/components/status-card")');
    expect(testFile).toContain('vi.mock("../src/components/status-card")');
    expect(testFile).not.toContain("components/StatusCard");

    expect(output).toContain("rewrote 2 vi.mock/require specifier(s)");

    // Aliased dynamic import() and import-type nodes, rewritten by pass 3.
    const lazy = read("src", "lazy.ts");
    expect(lazy).not.toContain("components/StatusCard");
    expect(lazy).toContain('import("@/components/status-card")');
    expect(lazy).toContain(
      'typeof import("@/components/status-card").StatusCard',
    );
    expect(output).toContain(
      "rewrote 3 aliased dynamic import()/import-type specifier(s)",
    );
  });

  it("previews the mock rewrites in a dry run without writing anything", () => {
    fixtureDir = writeFixture();
    const before = listFiles(fixtureDir).map((f) => [f, read(f)]);

    const output = runCodemod(fixtureDir, ["--dry-run"]);

    expect(output).toContain(
      "2 vi.mock/require specifier(s) would be rewritten",
    );
    expect(output).toContain(
      "3 aliased dynamic import()/import-type specifier(s) would be rewritten",
    );
    // Filtered: the blanket "not rewritten" list is gone.
    expect(output).not.toContain("are NOT rewritten");
    expect(output).toContain("dry run — nothing written");
    expect(before.map(([file]) => [file, read(file)])).toEqual(before);
  });

  it("refuses to apply against a dirty working tree, but still dry-runs", () => {
    fixtureDir = writeFixture();
    // A fresh repo with untracked fixture files is, by definition, dirty.
    execFileSync("git", ["init", "-q"], { cwd: fixtureDir, stdio: "pipe" });

    const dryRun = runCodemod(fixtureDir, ["--dry-run"]);
    expect(dryRun).toContain("dry run — nothing written");
    // `git checkout` neither unstages a `git mv` nor deletes the new untracked
    // kebab-named files, so it must not be the advertised recovery.
    expect(dryRun).not.toContain("`git checkout`");
    expect(dryRun).toContain("`git reset --hard HEAD && git clean -fd`");

    expect(() => runCodemod(fixtureDir)).toThrow();
    expect(
      fs.existsSync(
        path.join(fixtureDir, "src", "components", "StatusCard.tsx"),
      ),
    ).toBe(true);
  });
});
