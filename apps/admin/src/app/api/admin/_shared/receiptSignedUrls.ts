/* eslint-disable i18next/no-literal-string -- server file: Supabase API paths and bucket names are SQL/REST identifiers, not user-facing text */
import {
  RECEIPTS_BUCKET,
  RECEIPT_URL_TTL_SECONDS,
} from "shared/constants/receipts";
import { toSafeReceiptPath } from "shared/utils/receiptPath";

// Browser-accessible host. Must be used when building the URL returned to
// the client; SUPABASE_URL_INTERNAL is only reachable from inside Docker.
const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

// Prefer the internal URL when available so the server-to-Supabase signing
// hop stays fast inside Docker networking.
const SIGNING_SUPABASE_URL =
  process.env["SUPABASE_URL_INTERNAL"] || PUBLIC_SUPABASE_URL;

// Read service role at module load (matches the other URL constants).
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface BulkSignedUrlEntry {
  error: string | null;
  path: string;
  signedURL: string | null;
}

/** Storage signs any number of paths in one call; keep requests bounded anyway. */
const SIGN_BATCH_SIZE = 100;

/**
 * Convert Supabase Storage paths (e.g. `"orderId/receipt.png"`) into
 * browser-accessible signed URLs using the service role, in one storage call
 * per 100 paths instead of one per path. The reports route used to fire one
 * request per order in parallel: 143 at once on production data, which is
 * how the report table blew its 10 s budget in CI production run
 * e2e-20260928-0535-a808.
 *
 * The result maps every input path (including `null` and unsafe ones) to a
 * URL or `null`. `null` when the path is missing or unsafe, when the service
 * role is not configured, when storage reports an error for that path, or
 * when the call itself fails. Admins viewing reports may need receipts from
 * any seller, so this bypasses RLS by design.
 */
export async function signReceiptPaths(
  storagePaths: ReadonlyArray<string | null>,
): Promise<Map<string | null, string | null>> {
  const urls = new Map<string | null, string | null>();
  const safeByInput = new Map<string, string>();
  for (const input of storagePaths) {
    urls.set(input, null);
    const safe = input ? toSafeReceiptPath(input) : null;
    if (safe) safeByInput.set(input as string, safe);
  }
  if (safeByInput.size === 0) return urls;
  if (!SERVICE_ROLE_KEY || !SIGNING_SUPABASE_URL || !PUBLIC_SUPABASE_URL) {
    return urls;
  }

  const safePaths = [...new Set(safeByInput.values())];
  const signedBySafe = new Map<string, string>();
  for (let i = 0; i < safePaths.length; i += SIGN_BATCH_SIZE) {
    const batch = safePaths.slice(i, i + SIGN_BATCH_SIZE);
    for (const [safe, url] of await signBatch(batch)) {
      signedBySafe.set(safe, url);
    }
  }

  for (const [input, safe] of safeByInput) {
    urls.set(input, signedBySafe.get(safe) ?? null);
  }
  return urls;
}

/** One storage call for one batch; a failed call yields an empty map. */
async function signBatch(batch: string[]): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  try {
    const response = await fetch(
      `${SIGNING_SUPABASE_URL}/storage/v1/object/sign/${RECEIPTS_BUCKET}`,
      {
        method: "POST",
        headers: {
          apikey: SERVICE_ROLE_KEY as string,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expiresIn: RECEIPT_URL_TTL_SECONDS,
          paths: batch,
        }),
        cache: "no-store",
      },
    );
    if (!response.ok) return signed;
    const entries = (await response.json()) as BulkSignedUrlEntry[];
    for (const entry of entries) {
      if (entry.error || !entry.signedURL) continue;
      // signedURL is a relative path like "/object/sign/receipts/<path>?token=...".
      // Return the URL with the public host so the browser can resolve it.
      signed.set(
        entry.path,
        `${PUBLIC_SUPABASE_URL}/storage/v1${entry.signedURL}`,
      );
    }
  } catch {
    // the whole batch stays null
  }
  return signed;
}
