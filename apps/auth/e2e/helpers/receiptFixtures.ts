import { type Page, expect } from "@playwright/test";

import { ELEMENT_TIMEOUT_MS, MUTATION_WAIT_MS } from "./constants";
import { registerRow } from "./runRegistry";

/**
 * 1x1 transparent PNG. Used as the upload body so a real image streams back
 * when the signed URL resolves (the regression check fetches it and asserts
 * `content-type: image/*`).
 */
export const ONE_PX_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** File name used inside the receipts bucket for e2e uploads. */
export const RECEIPT_FILENAME = "receipt-e2e.png";

/**
 * Upload a fake receipt PNG to the Supabase `receipts` bucket using the
 * service role. The orchestrator handles authorization; the bucket is
 * private, so signed-URL retrieval is exercised on the read side.
 */
export async function uploadTestReceipt(
  storagePath: string,
  pngBase64: string = ONE_PX_PNG_BASE64,
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for e2e receipt upload.",
    );
  }

  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/receipts/${storagePath}`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "image/png",
        "x-upsert": "true",
      },
      body: Buffer.from(pngBase64, "base64"),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to upload e2e receipt file: ${response.status} ${body}`,
    );
  }
  // `storagePath` is `<order_id>/<file>`; prune deletes the whole prefix.
  await registerRow("storage:receipts", storagePath.split("/")[0]);
}

/**
 * PATCH an order's `receipt_url` column via the PostgREST endpoint, using
 * the service role to bypass RLS.
 */
export async function patchOrderReceiptUrl(
  orderId: string,
  storagePath: string,
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for e2e setup.",
    );
  }
  const response = await fetch(
    `${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ receipt_url: storagePath }),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to set order receipt_url: ${body}`);
  }
}

/**
 * Verify that a "receipt" cell on a report row exposes a working signed URL.
 *
 * The cell's test-id varies by app (the admin report uses
 * `report-row-receipt-<orderId>`, the seller report uses
 * `seller-report-row-receipt-<orderId>`), so the caller passes the prefix.
 *
 * Assertions:
 *   1. The cell is visible and contains a link.
 *   2. The link's `href` is a fully-qualified Supabase signed URL pointing
 *      at the order's receipt object, carrying a `token=` query param.
 *   3. Fetching the URL returns 200 with `content-type: image/*` — the
 *      regression guard against the original bug (raw storage path in href).
 */
export async function verifyReceiptLinkResolves(
  page: Page,
  options: { testIdPrefix: string; orderId: string },
): Promise<void> {
  const receiptCell = page.getByTestId(
    `${options.testIdPrefix}-${options.orderId}`,
  );
  await expect(receiptCell).toBeVisible({ timeout: MUTATION_WAIT_MS });

  // Scoped inside a testid-addressed cell, so the selector is already anchored
  // to a stable element; the role lookup only picks the single link within it.
  // eslint-disable-next-line no-restricted-syntax -- see above
  const receiptLink = receiptCell.getByRole("link");
  await expect(receiptLink).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

  const href = await receiptLink.getAttribute("href");
  // eslint-disable-next-line playwright/prefer-web-first-assertions -- compares two values captured at different times, which toHaveAttribute cannot express
  expect(href).toBeTruthy();
  expect(href).toMatch(/^https?:\/\//);
  expect(href).toContain(
    `/storage/v1/object/sign/receipts/${options.orderId}/`,
  );
  expect(href).toContain("token=");

  const fetchedReceipt = await page.request.get(href as string);
  expect(fetchedReceipt.ok()).toBe(true);
  expect(fetchedReceipt.headers()["content-type"]).toContain("image");
}
