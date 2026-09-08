import { randomUUID } from "node:crypto";

import { APP_URLS, ELEMENT_TIMEOUT_MS } from "./helpers/constants";
import { expect, test } from "./fixtures/autoCleanup";
import {
  ADMIN_PERMISSIONS,
  adminDelete,
  adminQuery,
  adminInsert,
  createTestUser,
  injectSession,
  supabaseAdmin,
  type TestUser,
} from "./helpers/session";

type DownloadChunk = Uint8Array;

function asBuffer(chunks: DownloadChunk[]): Uint8Array {
  const totalSize = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const merged = new Uint8Array(totalSize);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

function resolveAdminUsersUrl(): string {
  const adminBase = APP_URLS.ADMIN.endsWith("/admin")
    ? APP_URLS.ADMIN
    : `${APP_URLS.ADMIN}/admin`;
  // In dev mode APP_URLS.ADMIN is http://localhost:5002 (no basePath prefix)
  // In Docker/production APP_URLS.ADMIN ends with /admin
  const base = APP_URLS.ADMIN.includes("localhost")
    ? APP_URLS.ADMIN
    : adminBase;
  return `${base}/en/users`;
}

async function ensureUsersExportPermission(): Promise<void> {
  const existing = await adminQuery(
    "permissions",
    "select=id,key&key=eq.users.export",
  );

  let permissionId = existing[0]?.id as string | undefined;

  if (!permissionId) {
    const inserted = await adminInsert("permissions", {
      key: "users.export",
      name_en: "Export Users",
      name_es: "Exportar Usuarios",
      description_en: "Export selected users and receipt backups",
      description_es:
        "Exportar usuarios seleccionados y respaldos de comprobantes",
      depends_on: "user_permissions.read",
    });
    permissionId = inserted.id as string;
  }

  const existingGlobalResourcePermission = await adminQuery(
    "resource_permissions",
    `select=id&permission_id=eq.${permissionId}&resource_type=eq.global`,
  );

  if (existingGlobalResourcePermission.length === 0) {
    await adminInsert("resource_permissions", {
      permission_id: permissionId,
      resource_type: "global",
      resource_id: null,
    });
  }
}

test.describe.serial("admin users export with receipts backup", () => {
  let adminUser: TestUser;
  let buyerUser: TestUser;
  let orderId: string;
  let storagePath: string;
  const receiptPayload = `critical-receipt-backup-${Date.now()}`;
  const expectedReceiptBase64 = Buffer.from(receiptPayload, "utf-8").toString(
    "base64",
  );

  test.beforeAll(async () => {
    await ensureUsersExportPermission();

    adminUser = await createTestUser("admin-export", [
      ...ADMIN_PERMISSIONS,
      "users.export",
    ]);
    buyerUser = await createTestUser("buyer-export", [
      "orders.read",
      "receipts.create",
    ]);

    orderId = randomUUID();
    storagePath = `${orderId}/receipt-e2e.png`;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for e2e upload setup.",
      );
    }

    await adminInsert("orders", {
      id: orderId,
      user_id: buyerUser.userId,
      seller_id: adminUser.userId,
      total: 12345,
      currency: "COP",
      payment_status: "pending_verification",
      receipt_url: null,
      transfer_number: "E2E-TRANSFER-001",
    });

    const uploadResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/receipts/${storagePath}`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "image/png",
          "x-upsert": "true",
        },
        body: receiptPayload,
      },
    );

    if (!uploadResponse.ok) {
      const body = await uploadResponse.text();
      throw new Error(
        `Failed to upload e2e receipt file: ${uploadResponse.status} ${body}`,
      );
    }

    const updateResponse = await fetch(
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

    if (!updateResponse.ok) {
      const body = await updateResponse.text();
      throw new Error(`Failed to update order receipt_url: ${body}`);
    }
  });

  test.afterAll(async () => {
    await adminDelete("orders", `id=eq.${orderId}`).catch(() => {});
    await supabaseAdmin.storage.from("receipts").remove([storagePath]);
  });

  test("downloads excel export with receipt file backup row", async ({
    context,
    page,
  }) => {
    await injectSession(context, adminUser);

    await page.goto(resolveAdminUsersUrl());
    await expect(page.getByTestId("users-page")).toBeVisible({
      timeout: ELEMENT_TIMEOUT_MS,
    });

    const searchInput = page.getByTestId("users-search-input");
    await searchInput.fill(buyerUser.email);

    const targetRow = page.getByTestId(`user-row-${buyerUser.userId}`);
    await expect(targetRow).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    const rowCheckbox = targetRow.locator('input[type="checkbox"]');
    await rowCheckbox.check();

    const exportButton = page.getByTestId("users-export-excel-button");
    await expect(exportButton).toBeVisible({ timeout: ELEMENT_TIMEOUT_MS });

    const downloadPromise = page.waitForEvent("download");
    await exportButton.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^users-export-.*\.xls$/i);

    const stream = await download.createReadStream();
    expect(stream).not.toBeNull();

    const chunks: DownloadChunk[] = [];
    // The assertion above already failed the test if the stream is null; the
    // `!` only tells the compiler that, and is erased at build.
    for await (const chunk of stream!) {
      chunks.push(chunk as DownloadChunk);
    }

    const xml = Buffer.from(asBuffer(chunks)).toString("utf-8");
    expect(xml).toContain('<Worksheet ss:Name="Receipts"><Table>');
    expect(xml).toContain(storagePath);
    expect(xml).toContain(expectedReceiptBase64);
  });
});
