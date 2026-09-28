import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readSecret } from "../load-env.mjs";

describe("readSecret", () => {
  const dir = mkdtempSync(join(tmpdir(), "load-env-"));
  afterEach(() => {
    delete process.env.LOAD_ENV_SECRETS_PATH;
  });
  it("reads one value from the secrets file without loading an env", () => {
    const file = join(dir, ".secrets");
    writeFileSync(file, "RACKNERD_VPS_IP=203.0.113.9\nOTHER=x\n");
    process.env.LOAD_ENV_SECRETS_PATH = file;
    expect(readSecret("RACKNERD_VPS_IP")).toBe("203.0.113.9");
    expect(readSecret("MISSING")).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });
  it("returns undefined when there is no secrets file", () => {
    process.env.LOAD_ENV_SECRETS_PATH = join(dir, "nope", ".secrets");
    expect(readSecret("RACKNERD_VPS_IP")).toBeUndefined();
  });
});
