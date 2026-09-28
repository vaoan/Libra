"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQueryStates } from "nuqs";
import { useCallback, useEffect, useState } from "react";
import { tid } from "shared";
import { cn, Input } from "ui";

import {
  PRODUCT_CATEGORIES,
  PRODUCT_SEARCH_DEBOUNCE_MS,
  PRODUCT_TYPES,
} from "@/features/products/domain/constants";
import { productsSearchParams } from "@/features/products/domain/searchParams";
const I18N_ALL = "common.all";

const getPillClass = (isActive: boolean) =>
  cn(
    "button-brutal rounded-full border-2 px-4 py-1.5 text-sm transition-all",
    isActive
      ? "bg-foreground text-background shadow-brutal-sm"
      : "bg-background hover:bg-muted",
  );

export function ProductFilters() {
  const t = useTranslations();
  const [{ type, category, q }, setParams] =
    useQueryStates(productsSearchParams);

  const [searchInput, setSearchInput] = useState(q);

  // Debounce search input to URL. Never write what the URL already says: on
  // mount this effect fires with the URL's own value, and a needless
  // history.replaceState becomes an ACTION_RESTORE in Next's router, which
  // discards any navigation still in flight -- the "New product" click a few
  // hundred ms after the list rendered silently stayed on the list.
  useEffect(() => {
    if ((searchInput || null) === (q || null)) return;
    const timer = setTimeout(() => {
      setParams({ q: searchInput || null }, { history: "replace" });
    }, PRODUCT_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, q, setParams]);

  // Sync external URL changes back to local state (equality guard breaks debounce→URL→sync cycle)
  useEffect(() => {
    if (q !== searchInput) {
      setSearchInput(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const handleTypeChange = useCallback(
    (value: string) => {
      setParams({ type: value || null }, { history: "push" });
    },
    [setParams],
  );

  const handleCategoryChange = useCallback(
    (value: string) => {
      setParams({ category: value || null }, { history: "push" });
    },
    [setParams],
  );

  return (
    <div className="flex flex-col gap-4" {...tid("product-filters")}>
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("common.search")}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="border-strong border-border pl-10 font-medium"
          {...tid("product-search")}
        />
      </div>

      {/* Type filter pills */}
      <div className="flex flex-wrap gap-2" {...tid("type-filters")}>
        <button
          type="button"
          onClick={() => handleTypeChange("")}
          className={getPillClass(type === "")}
          {...tid("type-filter-all")}
        >
          {t(I18N_ALL)}
        </button>
        {PRODUCT_TYPES.map((pt) => (
          <button
            type="button"
            key={pt}
            onClick={() => handleTypeChange(pt)}
            className={getPillClass(type === pt)}
            {...tid(`type-filter-${pt}`)}
          >
            {t(`productTypes.${pt}`)}
          </button>
        ))}
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2" {...tid("category-filters")}>
        <button
          type="button"
          onClick={() => handleCategoryChange("")}
          className={getPillClass(category === "")}
          {...tid("category-filter-all")}
        >
          {t(I18N_ALL)}
        </button>
        {PRODUCT_CATEGORIES.map((cat) => (
          <button
            type="button"
            key={cat}
            onClick={() => handleCategoryChange(cat)}
            className={getPillClass(category === cat)}
            {...tid(`category-filter-${cat}`)}
          >
            {t(`categories.${cat}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
