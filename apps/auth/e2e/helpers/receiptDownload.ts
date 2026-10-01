import { createHash } from "node:crypto";

/** Bounded retry for the provider: three tries, two seconds apart. */
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_DELAY_MS = 2_000;

export interface DownloadedReceipt {
  bytes: Uint8Array;
  contentType: string;
}

/** The slice of `Response` the download reads; lets tests pass a plain fake. */
export type ReceiptResponse = Pick<
  Response,
  "ok" | "status" | "headers" | "arrayBuffer"
>;

interface DownloadOptions {
  fetchImpl?: (url: string) => Promise<ReceiptResponse>;
  attempts?: number;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The signed URL without its token, safe for an error message. */
function withoutToken(url: string): string {
  return url.split("?")[0] ?? url;
}

/**
 * Download the bytes a receipt's signed URL serves, from Node rather than
 * the browser, so the retry lives in one testable place.
 *
 * Supabase Storage sits behind its own Cloudflare and answered 502 after
 * 28 s for a freshly signed receipt during a Supabase incident (CI production
 * run e2e-20260928-0848-27f4); the same bucket answered 200 in 500 ms right
 * after. A 5xx or a network error is therefore retried a bounded number of
 * times and, if it persists, reported as the provider's answer. A 4xx is not
 * retried: a wrong path or an expired token is our defect and fails at once.
 */
export async function downloadReceipt(
  url: string,
  {
    fetchImpl = fetch,
    attempts = DEFAULT_ATTEMPTS,
    delayMs = DEFAULT_DELAY_MS,
    sleep = defaultSleep,
  }: DownloadOptions = {},
): Promise<DownloadedReceipt> {
  let lastStatus: number | string = "no response";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (attempt > 1) await sleep(delayMs);
    try {
      const response = await fetchImpl(url);
      if (response.ok) {
        return {
          bytes: new Uint8Array(await response.arrayBuffer()),
          contentType: response.headers.get("content-type") ?? "",
        };
      }
      if (response.status < 500) {
        throw new Error(`Receipt fetch failed: ${response.status}`);
      }
      lastStatus = response.status;
    } catch (error) {
      if (
        error instanceof Error &&
        /^Receipt fetch failed/.test(error.message)
      ) {
        throw error;
      }
      lastStatus = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(
    `Supabase Storage answered ${lastStatus} on ${attempts} attempts for ${withoutToken(url)}`,
  );
}

/** Hex SHA-256 of the downloaded bytes, comparable with a fixture's digest. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
