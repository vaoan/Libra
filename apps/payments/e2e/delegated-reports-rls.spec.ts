import { expect, test } from "../../auth/e2e/fixtures/autoCleanup";
import {
  SELLER_PERMISSIONS,
  SUPABASE_ANON_KEY,
  adminDelete,
  adminInsert,
  createTestUser,
  type TestUser,
} from "../../auth/e2e/helpers/session";

// ─── RLS boundary coverage for order_items_delegate_read ───────────
//
// This spec uses NO browser page/context. It seeds data with the
// service-role helpers, then issues raw PostgREST requests carrying
// a real user's own access token (so RLS is enforced exactly as it
// would be for the delegated-reports client query), and asserts the
// `order_items_delegate_read` policy DENIES reads for:
//   - a non-delegated product on the SAME order (product-scoping)
//   - another seller's order entirely (cross-seller isolation)
//   - a user who is neither buyer, seller, nor delegate (outsider)
//
// A positive control (test 1) proves the delegate CAN read the row
// for the product actually delegated to them — without it, a broken
// seed could make every "denied" assertion vacuously true.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;

/**
 * Read PostgREST AS a given user (their JWT drives RLS). `apikey` stays the
 * project's anon key — a Clerk JWT is not a valid `apikey` value, only a
 * valid `Authorization` bearer token (Supabase verifies it against Clerk's
 * JWKS under Third-Party Auth) — matching how
 * `createServerSupabaseClient` (packages/api/src/supabase/server.ts)
 * authenticates real requests.
 */
async function readAsUser(
  user: TestUser,
  pathAndQuery: string,
): Promise<unknown[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${user.accessToken}`,
    },
  });
  if (!res.ok) {
    throw new Error(`read failed ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as unknown[];
}

test.describe.serial("order_items_delegate_read RLS policy", () => {
  let sellerUser: TestUser;
  let delegateUser: TestUser;
  let buyerUser: TestUser;
  let outsiderUser: TestUser;
  let seller2User: TestUser;

  let product1Id: string;
  let product2Id: string;
  let product3Id: string;
  let order1Id: string;
  let order2Id: string;
  let delegationId: string;

  test.beforeAll(async () => {
    sellerUser = await createTestUser("rls-seller", SELLER_PERMISSIONS);
    delegateUser = await createTestUser("rls-delegate", []);
    buyerUser = await createTestUser("rls-buyer", []);
    outsiderUser = await createTestUser("rls-outsider", []);
    seller2User = await createTestUser("rls-seller2", SELLER_PERMISSIONS);

    const product1 = await adminInsert("products", {
      slug: `e2e-rls-p1-${Date.now()}`,
      name_en: "RLS Delegated Product",
      name_es: "Producto Delegado RLS",
      description_en: "Delegated",
      description_es: "Delegado",
      type: "merch",
      price: 25000,
      currency: "COP",
      max_quantity: 5,
      seller_id: sellerUser.userId,
    });
    product1Id = product1.id as string;

    const product2 = await adminInsert("products", {
      slug: `e2e-rls-p2-${Date.now()}`,
      name_en: "RLS Non-Delegated Product",
      name_es: "Producto No Delegado RLS",
      description_en: "Not delegated",
      description_es: "No delegado",
      type: "merch",
      price: 15000,
      currency: "COP",
      max_quantity: 5,
      seller_id: sellerUser.userId,
    });
    product2Id = product2.id as string;

    const product3 = await adminInsert("products", {
      slug: `e2e-rls-p3-${Date.now()}`,
      name_en: "RLS Other Seller Product",
      name_es: "Producto de Otro Vendedor RLS",
      description_en: "Owned by seller2",
      description_es: "Propiedad de seller2",
      type: "merch",
      price: 20000,
      currency: "COP",
      max_quantity: 5,
      seller_id: seller2User.userId,
    });
    product3Id = product3.id as string;

    const order1 = await adminInsert("orders", {
      seller_id: sellerUser.userId,
      user_id: buyerUser.userId,
      payment_status: "approved",
      total: 80000,
      currency: "COP",
    });
    order1Id = order1.id as string;

    await adminInsert("order_items", {
      order_id: order1Id,
      product_id: product1Id,
      quantity: 2,
      unit_price: 25000,
      currency: "COP",
    });
    await adminInsert("order_items", {
      order_id: order1Id,
      product_id: product2Id,
      quantity: 2,
      unit_price: 15000,
      currency: "COP",
    });

    const order2 = await adminInsert("orders", {
      seller_id: seller2User.userId,
      user_id: buyerUser.userId,
      payment_status: "approved",
      total: 20000,
      currency: "COP",
    });
    order2Id = order2.id as string;

    await adminInsert("order_items", {
      order_id: order2Id,
      product_id: product3Id,
      quantity: 1,
      unit_price: 20000,
      currency: "COP",
    });

    const delegation = await adminInsert("seller_admins", {
      seller_id: sellerUser.userId,
      admin_user_id: delegateUser.userId,
      product_id: product1Id,
      permissions: ["reports.read", "reports.export"],
    });
    delegationId = delegation.id as string;
  });

  test.afterAll(async () => {
    await adminDelete("seller_admins", `id=eq.${delegationId}`).catch(() => {});
    await adminDelete("order_items", `order_id=eq.${order1Id}`).catch(() => {});
    await adminDelete("order_items", `order_id=eq.${order2Id}`).catch(() => {});
    await adminDelete("orders", `id=eq.${order1Id}`).catch(() => {});
    await adminDelete("orders", `id=eq.${order2Id}`).catch(() => {});
    await adminDelete("products", `id=eq.${product1Id}`).catch(() => {});
    await adminDelete("products", `id=eq.${product2Id}`).catch(() => {});
    await adminDelete("products", `id=eq.${product3Id}`).catch(() => {});
  });

  test("positive control: delegate can read the delegated product's line item", async () => {
    const rows = await readAsUser(
      delegateUser,
      `order_items?order_id=eq.${order1Id}&product_id=eq.${product1Id}&select=id`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  test("denies a non-delegated product on the same order", async () => {
    const rows = await readAsUser(
      delegateUser,
      `order_items?order_id=eq.${order1Id}&product_id=eq.${product2Id}&select=id`,
    );
    expect(rows).toHaveLength(0);
  });

  test("denies another seller's order_items entirely", async () => {
    const rows = await readAsUser(
      delegateUser,
      `order_items?order_id=eq.${order2Id}&select=id`,
    );
    expect(rows).toHaveLength(0);
  });

  test("denies an outsider who is neither buyer, seller, nor delegate", async () => {
    const rows = await readAsUser(
      outsiderUser,
      `order_items?order_id=eq.${order1Id}&select=id`,
    );
    expect(rows).toHaveLength(0);
  });
});
