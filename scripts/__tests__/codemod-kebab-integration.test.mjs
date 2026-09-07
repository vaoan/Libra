import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

let fixtureDir;

afterEach(() => {
  if (fixtureDir) {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    fixtureDir = null;
  }
});

describe("codemod CLI integration", () => {
  it("renames files and updates imports without creating nested directories", () => {
    // Create temp fixture
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "kebab-integration-"));

    // Write tsconfig.json
    fs.writeFileSync(
      path.join(fixtureDir, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: {
            "@/*": ["./src/*"],
          },
        },
      }),
    );

    // Create directory structure
    fs.mkdirSync(path.join(fixtureDir, "src", "components"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(fixtureDir, "src", "app"), { recursive: true });

    // Write source files
    fs.writeFileSync(
      path.join(fixtureDir, "src", "components", "StatusCard.tsx"),
      "export function StatusCard() { return null; }",
    );

    fs.writeFileSync(
      path.join(fixtureDir, "src", "index.ts"),
      'export { StatusCard } from "./components/StatusCard";',
    );

    fs.writeFileSync(
      path.join(fixtureDir, "src", "app", "page.tsx"),
      'import { StatusCard } from "@/components/StatusCard";\nexport default StatusCard;',
    );

    // Run the CLI as a child process from a different directory
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "kebab-run-"));
    try {
      const codemodScript = path.resolve(
        ".",
        "scripts",
        "codemod-kebab-filenames.mjs",
      );

      execFileSync("node", [codemodScript, "--workspace", fixtureDir], {
        cwd: runDir,
        stdio: "pipe",
      });
    } finally {
      fs.rmSync(runDir, { recursive: true, force: true });
    }

    // Verify: StatusCard was renamed
    expect(
      fs.existsSync(
        path.join(fixtureDir, "src", "components", "status-card.tsx"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(fixtureDir, "src", "components", "StatusCard.tsx"),
      ),
    ).toBe(false);

    // Verify: no nested directory was created
    expect(
      fs.existsSync(path.join(fixtureDir, "src", "components", "src")),
    ).toBe(false);
    expect(fs.existsSync(path.join(fixtureDir, "src", "src"))).toBe(false);

    // Verify: relative re-export was updated
    const indexContent = fs.readFileSync(
      path.join(fixtureDir, "src", "index.ts"),
      "utf-8",
    );
    expect(indexContent).toContain("./components/status-card");
    expect(indexContent).not.toContain("./components/StatusCard");

    // Verify: alias import was updated
    const pageContent = fs.readFileSync(
      path.join(fixtureDir, "src", "app", "page.tsx"),
      "utf-8",
    );
    expect(pageContent).toContain("@/components/status-card");
    expect(pageContent).not.toContain("@/components/StatusCard");
  });
});
