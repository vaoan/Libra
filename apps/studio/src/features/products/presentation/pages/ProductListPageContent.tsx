"use client";

import { Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryStates } from "nuqs";
import { tid } from "shared";
import { Button } from "ui";

import { useProducts } from "@/features/products/application/hooks/useProducts";
import { productsSearchParams } from "@/features/products/domain/searchParams";
import { ProductFilters } from "@/features/products/presentation/components/ProductFilters";
import { ProductTable } from "@/features/products/presentation/components/ProductTable";
import { appUrls } from "@/shared/infrastructure/config";
import { Link } from "@/shared/infrastructure/i18n";

interface ProductListPageContentProps {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canManageDelegates: boolean;
  pendingCount?: number;
  delegateCounts: Record<string, number>;
}

export function ProductListPageContent({
  canCreate,
  canUpdate,
  canDelete,
  canManageDelegates,
  pendingCount,
  delegateCounts,
}: ProductListPageContentProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [filters] = useQueryStates(productsSearchParams);
  const { data: products, isLoading } = useProducts(filters);
  const isFiltered = !!(filters.type || filters.category || filters.q);

  return (
    <main
      className="flex flex-1 flex-col surface-grid-dots"
      {...tid("product-list-page")}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8">
        <header className="flex items-center justify-between">
          <div>
            <h1
              className="font-display text-4xl font-extrabold uppercase tracking-tight"
              {...tid("products-title")}
            >
              {t("products.title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("products.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!!pendingCount && pendingCount > 0 && (
              // Received orders live in the payments app (/sales); studio has
              // no orders route. Cross-app, so a plain anchor, not the i18n Link.
              <a
                href={`${appUrls.payments}/${locale}/sales`}
                className="flex items-center gap-2 rounded-sm border-2 border-warning bg-warning/10 px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wider text-warning transition-colors hover:bg-warning/20"
                {...tid("pending-orders-badge")}
              >
                <span className="flex size-5 items-center justify-center rounded-full bg-warning text-ui-xs font-extrabold text-background">
                  {pendingCount}
                </span>
                {t("orders.pendingOrders", { count: pendingCount })}
              </a>
            )}
            {canCreate && (
              <Link href="/products/new">
                <Button
                  className="button-brutal button-press-sm rounded-xl border-strong bg-brand px-6 py-3 text-brand-foreground shadow-brutal-md hover:bg-brand-hover"
                  {...tid("new-product-button")}
                >
                  <Plus className="size-5" />
                  {t("products.newProduct")}
                </Button>
              </Link>
            )}
          </div>
        </header>

        <ProductFilters />

        <ProductTable
          products={products ?? []}
          isLoading={isLoading}
          isFiltered={isFiltered}
          canUpdate={canUpdate}
          canDelete={canDelete}
          canManageDelegates={canManageDelegates}
          delegateCounts={delegateCounts}
        />
      </div>
    </main>
  );
}
