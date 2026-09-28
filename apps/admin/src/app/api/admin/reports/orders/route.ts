/* eslint-disable i18next/no-literal-string */
import { NextResponse } from "next/server";

import {
  adminFetch,
  createRestPath,
  FORBIDDEN_ERROR,
  getAuthorizedAdmin,
  INTERNAL_SERVER_ERROR_STATUS,
} from "@/app/api/admin/_shared/adminRest";
import { signReceiptPaths } from "@/app/api/admin/_shared/receiptSignedUrls";
import {
  fetchOrderItems,
  fetchProfileMap,
  type OrderItemRow,
} from "@/app/api/admin/_shared/reportsData";
import { buildAdminOrderFilters } from "@/app/api/admin/_shared/reportsFilters";

const ADMIN_REPORTS = "admin.reports";
const MAX_LIMIT = 10_000;
const ORDERS_SELECT =
  "id,created_at,payment_status,total,currency,transfer_number,receipt_url,user_id,seller_id";

interface OrderRow {
  id: string;
  created_at: string;
  payment_status: string;
  total: number;
  currency: string;
  transfer_number: string | null;
  receipt_url: string | null;
  user_id: string;
  seller_id: string | null;
}

export async function GET(request: Request) {
  const adminUserId = await getAuthorizedAdmin([ADMIN_REPORTS]);
  if (!adminUserId) {
    return NextResponse.json({ error: FORBIDDEN_ERROR }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const filters = buildAdminOrderFilters(searchParams);
    const productId = searchParams.get("productId");

    const ordersResponse = await adminFetch(
      createRestPath("orders", {
        select: ORDERS_SELECT,
        order: "created_at.desc",
        limit: String(MAX_LIMIT),
        ...filters,
      }),
    );
    let orders = (await ordersResponse.json()) as OrderRow[];

    const orderIds = orders.map((o) => o.id);
    if (orderIds.length === 0) {
      return NextResponse.json({ orders: [], total: 0 });
    }

    const allItems = await fetchOrderItems(orderIds, productId);

    if (productId) {
      const orderIdsWithProduct = new Set(
        allItems.map((item) => item.order_id),
      );
      orders = orders.filter((o) => orderIdsWithProduct.has(o.id));
    }

    const userIdSet = new Set<string>();
    for (const order of orders) {
      userIdSet.add(order.user_id);
      if (order.seller_id) userIdSet.add(order.seller_id);
    }
    const profileMap = await fetchProfileMap([...userIdSet]);

    const itemsByOrder = new Map<string, OrderItemRow[]>();
    for (const item of allItems) {
      const existing = itemsByOrder.get(item.order_id) ?? [];
      existing.push(item);
      itemsByOrder.set(item.order_id, existing);
    }

    // One storage call for every receipt instead of one per order.
    const receiptUrls = await signReceiptPaths(
      orders.map((order) => order.receipt_url),
    );
    const result = await Promise.all(
      orders.map(async (order) => {
        const buyer = profileMap.get(order.user_id);
        const seller = order.seller_id
          ? profileMap.get(order.seller_id)
          : undefined;

        return {
          id: order.id,
          created_at: order.created_at,
          payment_status: order.payment_status,
          total: order.total,
          currency: order.currency,
          transfer_number: order.transfer_number,
          receipt_url: receiptUrls.get(order.receipt_url) ?? null,
          buyer_id: order.user_id,
          buyer_email: buyer?.email ?? "",
          buyer_display_name: buyer?.display_name ?? null,
          seller_id: order.seller_id,
          seller_email: seller?.email ?? null,
          seller_display_name: seller?.display_name ?? null,
          items: (itemsByOrder.get(order.id) ?? []).map((item) => ({
            id: item.id,
            product_id: item.product_id,
            product_name: item.products?.name_en ?? "",
            quantity: item.quantity,
            unit_price: item.unit_price,
            currency: item.currency,
          })),
        };
      }),
    );

    return NextResponse.json({ orders: result, total: result.length });
  } catch {
    return NextResponse.json(
      { error: "Failed to load sales report" },
      { status: INTERNAL_SERVER_ERROR_STATUS },
    );
  }
}
