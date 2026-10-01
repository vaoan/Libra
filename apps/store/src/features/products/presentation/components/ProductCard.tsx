"use client";

import { ShoppingCart } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { MouseEvent } from "react";
import { formatPrice, i18nField, slugify, tid } from "shared";
import { cn } from "ui";

import { ProductBadges } from "./ProductBadges";
import { ProductCardImage } from "./ProductCardImage";
import { ProductCardMeta } from "./ProductCardMeta";

import { getPendingUrlWrite } from "@/features/products/application/pendingUrlWrite";
import {
  isProductAvailable,
  type Product,
} from "@/features/products/domain/types";
import { useAddToCart } from "@/shared/application/cart";
import {
  getCategoryColor,
  getCategoryTheme,
} from "@/shared/domain/categoryConstants";
import { Link, useRouter } from "@/shared/infrastructure/i18n";

type ProductCardVariant = "default" | "featured";

interface ProductCardProps {
  product: Product;
  variant?: ProductCardVariant;
}

export function ProductCard({
  product,
  variant = "default",
}: ProductCardProps) {
  const t = useTranslations("products");
  const tCategories = useTranslations("categories");
  const tTypes = useTranslations("productTypes");
  const locale = useLocale();
  const router = useRouter();
  const { isAdded, quantityInCart, hasReachedStockLimit, handleAddToCart } =
    useAddToCart(product);

  const categoryTheme = getCategoryTheme(product.category);
  const categoryColor = getCategoryColor(product.category);
  const isFeatured = variant === "featured";
  const addToCartLabel = isAdded ? t("addedToCart") : t("addToCart");
  const isAddToCartDisabled =
    !isProductAvailable(product) || isAdded || hasReachedStockLimit;
  const inCartLabel = t("inCart", { count: quantityInCart });
  const name = i18nField(product, "name", locale);
  const description = i18nField(product, "description", locale);
  const href = `/products/${product.id}/${slugify(name)}`;

  // A search URL write still in flight would discard this navigation when it
  // lands (see pendingUrlWrite), so wait for it and navigate afterwards.
  // Modifier and non-primary clicks open a new tab; the browser handles those.
  const handleLinkClick = (event: MouseEvent<HTMLAnchorElement>) => {
    const pendingWrite = getPendingUrlWrite();
    const isModifiedClick =
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey;
    if (pendingWrite === null || isModifiedClick) return;

    event.preventDefault();
    pendingWrite.then(() => router.push(href));
  };

  return (
    <article
      className={cn(
        "flex border-strong border-foreground shadow-brutal-md bg-background transition-transform hover:-translate-1",
        isFeatured ? "flex-col sm:flex-row" : "flex-col",
      )}
      {...tid("product-card")}
      data-product-id={product.id}
      data-variant={variant}
    >
      <Link
        href={href}
        onClick={handleLinkClick}
        className={cn(
          "flex flex-1 no-underline text-foreground",
          isFeatured ? "flex-col sm:flex-row" : "flex-col",
        )}
        {...tid("product-card-link")}
      >
        <ProductCardImage
          product={product}
          categoryColor={categoryColor}
          categoryForeground={categoryTheme.foreground}
          isFeatured={isFeatured}
          featuredLabel={t("featured")}
          outOfStockLabel={t("outOfStock")}
          typeLabel={tTypes(product.type)}
          quantityInCart={quantityInCart}
          inCartLabel={inCartLabel}
        />

        {/* Content */}
        <div
          className={cn(
            "flex flex-1 flex-col gap-3",
            isFeatured ? "p-5 sm:p-6 justify-center" : "p-4",
          )}
        >
          {/* Badges row */}
          <ProductBadges
            product={product}
            categoryColor={categoryColor}
            categoryForeground={categoryTheme.foreground}
            tCategories={tCategories}
            tTypes={tTypes}
            t={t}
          />

          {/* Name */}
          <h3
            className={cn(
              "font-display font-extrabold",
              isFeatured
                ? "text-xl/tight sm:text-2xl/tight"
                : "text-base/tight",
            )}
            {...tid("product-card-name")}
          >
            {name}
          </h3>

          {/* Description — only on featured */}
          {isFeatured && description && (
            <p
              className="text-sm text-muted-foreground line-clamp-2 sm:line-clamp-3"
              {...tid("product-card-description")}
            >
              {description}
            </p>
          )}

          {/* Type-specific info */}
          <div
            className="text-xs text-muted-foreground"
            {...tid("product-card-meta")}
          >
            <ProductCardMeta product={product} />
          </div>

          {/* Price */}
          <div
            className={cn(
              "mt-auto pt-2",
              isFeatured && "flex flex-col sm:flex-row sm:items-center gap-3",
            )}
          >
            <span
              className={cn(
                "flex min-w-0 items-baseline gap-1 font-display font-extrabold",
                isFeatured ? "text-2xl sm:text-3xl" : "text-xl",
              )}
              {...tid("product-card-price")}
            >
              <span className="min-w-0 break-all">
                {formatPrice(product.price, product.currency)}
              </span>
            </span>

            {isFeatured && (
              <button
                type="button"
                className="sm:ml-auto button-brutal button-press-sm shadow-brutal-md font-display font-extrabold uppercase tracking-widest px-8 py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleAddToCart}
                disabled={isAddToCartDisabled}
                {...tid("product-card-add-to-cart")}
              >
                <ShoppingCart className="size-4" />
                {addToCartLabel}
              </button>
            )}
          </div>
        </div>
      </Link>

      {/* Add to Cart — outside the link (default variant only) */}
      {!isFeatured && (
        <div className="px-4 pb-4">
          <button
            type="button"
            className="w-full justify-center button-brutal button-press-sm shadow-brutal-md font-display text-xs font-extrabold uppercase tracking-widest px-6 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleAddToCart}
            disabled={isAddToCartDisabled}
            {...tid("product-card-add-to-cart")}
          >
            <ShoppingCart className="size-3.5" />
            {addToCartLabel}
          </button>
        </div>
      )}
    </article>
  );
}
