/**
 * Guard: no source file may import `next/font/google`.
 *
 * `next/font/google` downloads font files from Google at build time. On
 * 2026-09-27 that fetch failed three times in local Docker builds and twice
 * in a row on GitHub's runners ("Module not found:
 * '@vercel/turbopack-next/internal/font/google/font'"), blocking the
 * production image. The fonts are vendored under packages/shared/src/fonts
 * and loaded with `next/font/local`, so a build needs no network.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const SOURCE_ROOTS = ["apps", "packages"];
const SKIP = new Set(["node_modules", ".next", "dist", "coverage", "tests"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("fonts are vendored", () => {
  it("no app or package source imports next/font/google", () => {
    const offenders = SOURCE_ROOTS.flatMap((r) => walk(join(ROOT, r))).filter(
      (f) => readFileSync(f, "utf8").includes("next/font/google"),
    );
    expect(offenders.map((f) => f.replace(ROOT, "")).sort()).toEqual([]);
  });

  it("the vendored font files exist", () => {
    for (const name of ["dm-sans-latin-wght.woff2", "syne-latin-wght.woff2"]) {
      const size = statSync(join(ROOT, "packages/shared/src/fonts", name)).size;
      expect(size, name).toBeGreaterThan(10_000);
    }
  });
});
