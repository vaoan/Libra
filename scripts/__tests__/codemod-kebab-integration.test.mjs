import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
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
  // cwd-relative path handling fails loudly.
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "kebab-run-"));
  try {
    return execFileSync(
      "node",
      [CODEMOD_SCRIPT, "--workspace", workspace, ...extraArgs],
      { cwd: runDir, stdio: "pipe", encoding: "utf8" },
    );
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
  });

  it("previews the mock rewrites in a dry run without writing anything", () => {
    fixtureDir = writeFixture();
    const before = listFiles(fixtureDir).map((f) => [f, read(f)]);

    const output = runCodemod(fixtureDir, ["--dry-run"]);

    expect(output).toContain(
      "2 vi.mock/require specifier(s) would be rewritten",
    );
    expect(output).toContain("dry run — nothing written");
    expect(before.map(([file]) => [file, read(file)])).toEqual(before);
  });

  it("refuses to apply against a dirty working tree, but still dry-runs", () => {
    fixtureDir = writeFixture();
    // A fresh repo with untracked fixture files is, by definition, dirty.
    execFileSync("git", ["init", "-q"], { cwd: fixtureDir, stdio: "pipe" });

    expect(runCodemod(fixtureDir, ["--dry-run"])).toContain(
      "dry run — nothing written",
    );

    expect(() => runCodemod(fixtureDir)).toThrow();
    expect(
      fs.existsSync(
        path.join(fixtureDir, "src", "components", "StatusCard.tsx"),
      ),
    ).toBe(true);
  });
});
