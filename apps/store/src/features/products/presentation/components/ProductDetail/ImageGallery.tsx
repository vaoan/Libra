/* eslint-disable sonarjs/no-duplicate-string -- Tailwind classes must stay inline per styling policy */
"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { tid } from "shared";
import { cn } from "ui";

import type { CategoryTheme } from "@/features/products/domain/constants";
import type { Product, ProductImage } from "@/features/products/domain/types";
import { FeaturedRibbon } from "@/features/products/presentation/components/FeaturedRibbon";

const TID_GALLERY = "image-gallery";
const TID_GALLERY_MAIN = "image-gallery-main";
const COUNTER_SEPARATOR = " / ";

interface ImageGalleryProps {
  product: Product;
  theme: CategoryTheme;
}

/** Extract images array from the JSONB field */
function getProductImages(images: unknown): ProductImage[] {
  if (!Array.isArray(images)) return [];
  return images
    .map((img) => {
      if (typeof img === "string") return { url: img };
      if (img && typeof img === "object" && "url" in img)
        return img as ProductImage;
      return null;
    })
    .filter((img): img is ProductImage => img !== null && Boolean(img.url));
}

/**
 * Product image gallery.
 *
 * Desktop: vertical thumbnail strip LEFT + main image RIGHT (Shopify pattern).
 * Mobile: main image on top, horizontal thumbnail row below.
 *
 * When the product has real images, they are displayed.
 * When no images exist, a gradient placeholder with the product type is shown.
 */
export function ImageGallery({ product, theme }: ImageGalleryProps) {
  const tTypes = useTranslations("productTypes");
  const t = useTranslations("products");
  const [activeIndex, setActiveIndex] = useState(0);
  const images = useMemo(
    () => getProductImages(product.images),
    [product.images],
  );
  const activeImage = images[activeIndex];

  const thumbInactive =
    "border-foreground/20 bg-background hover:border-foreground";

  const thumbGridStyle = useMemo(
    // eslint-disable-next-line i18next/no-literal-string -- CSS grid value, not user-facing text
    () => ({ gridTemplateColumns: `repeat(${images.length}, 1fr)` }),
    [images.length],
  );

  // Placeholder for products with no images
  // No active image means there are no images at all, or the selected index is
  // stale after a product change -- both render the same empty state.
  if (!activeImage) {
    return (
      <div
        className="w-full max-w-full shrink-0 lg:w-3/5"
        {...tid(TID_GALLERY)}
      >
        <div
          className="relative flex aspect-square w-full max-w-full items-center justify-center overflow-hidden border-strong border-foreground shadow-brutal-lg"
          style={{ backgroundColor: theme.bg }}
          {...tid(TID_GALLERY_MAIN)}
        >
          {/*
            Decoration, not content: a watermark at 10% opacity over the
            category colour, filling a box that would otherwise be empty.

            aria-hidden keeps it out of the accessible name -- the product type
            it repeats is already announced by the hero's type badge.

            It does NOT satisfy axe, and axe is right: aria-hidden removes an
            element from the accessibility tree but the text is still on screen,
            so 1.22:1 is still 1.22:1 for a sighted reader with low vision.
            WCAG 1.4.3 exempts pure decoration and this qualifies -- nothing is
            conveyed here that is not conveyed elsewhere -- but that is a
            judgement axe cannot make, so accessibility.spec.ts excludes this
            one element by test id and says why.
          */}
          <span
            aria-hidden="true"
            className="font-display text-4xl font-extrabold uppercase tracking-widest text-foreground/10 select-none"
            {...tid("gallery-placeholder-watermark")}
          >
            {tTypes(product.type)}
          </span>
          {product.featured && (
            <FeaturedRibbon
              label={t("featured")}
              accentVar={theme.accent}
              size="lg"
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full shrink-0 lg:w-3/5" {...tid(TID_GALLERY)}>
      {/* Desktop: thumbnails left + image right */}
      <div className="hidden lg:flex gap-3">
        {/* Vertical thumbnails */}
        {images.length > 1 && (
          <div
            className="flex flex-col gap-2 shrink-0"
            {...tid("image-gallery-thumbs")}
          >
            {images.map((img, idx) => {
              const isActive = idx === activeIndex;
              const activeCls = isActive
                ? "border-foreground shadow-brutal-sm"
                : thumbInactive;
              return (
                <button
                  type="button"
                  key={img.url}
                  onClick={() => setActiveIndex(idx)}
                  className={cn(
                    "relative size-16 overflow-hidden border-strong transition-all",
                    activeCls,
                  )}
                  style={isActive ? { backgroundColor: theme.bg } : undefined}
                  aria-label={
                    img.alt ||
                    t("gallery.views.viewImage", { label: String(idx + 1) })
                  }
                  {...tid(`image-gallery-thumb-${String(idx)}`)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- user-provided image URLs can come from arbitrary hosts */}
                  <img
                    src={img.url}
                    alt={img.alt ?? ""}
                    className="absolute inset-0 size-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Main image */}
        <div
          className="relative flex-1 aspect-square overflow-hidden border-strong border-foreground shadow-brutal-lg"
          style={{ backgroundColor: theme.bg }}
          {...tid(TID_GALLERY_MAIN)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- user-provided image URLs can come from arbitrary hosts */}
          <img
            src={activeImage.url}
            alt={activeImage.alt || product.name_en}
            className={cn(
              "absolute inset-0 size-full",
              activeImage.fit === "contain" ? "object-contain" : "object-cover",
            )}
            loading="eager"
            decoding="async"
          />

          {/* Bottom bar: caption + counter */}
          <div className="absolute bottom-0 inset-x-0 flex items-center justify-between bg-foreground/70 px-3 py-1.5 z-10">
            {activeImage.alt ? (
              <span className="text-ui-xs font-bold uppercase tracking-widest text-background truncate">
                {activeImage.alt}
              </span>
            ) : (
              <span />
            )}
            {images.length > 1 && (
              <span className="text-ui-xs font-bold text-background tracking-widest shrink-0 ml-2">
                {activeIndex + 1}
                {COUNTER_SEPARATOR}
                {images.length}
              </span>
            )}
          </div>

          {product.featured && (
            <FeaturedRibbon
              label={t("featured")}
              accentVar={theme.accent}
              size="lg"
            />
          )}
        </div>
      </div>

      {/* Mobile: image on top, thumbnails below */}
      <div className="flex w-full max-w-full flex-col gap-3 overflow-hidden lg:hidden">
        <div
          className="relative aspect-square w-full max-w-full overflow-hidden border-strong border-foreground shadow-brutal-lg"
          style={{ backgroundColor: theme.bg }}
          {...tid("image-gallery-main-mobile")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- user-provided image URLs can come from arbitrary hosts */}
          <img
            src={activeImage.url}
            alt={activeImage.alt || product.name_en}
            className={cn(
              "absolute inset-0 size-full",
              activeImage.fit === "contain" ? "object-contain" : "object-cover",
            )}
            loading="eager"
            decoding="async"
          />

          {/* Bottom bar: caption + counter */}
          <div className="absolute bottom-0 inset-x-0 flex items-center justify-between bg-foreground/70 px-3 py-1.5 z-10">
            {activeImage.alt ? (
              <span className="text-ui-xs font-bold uppercase tracking-widest text-background truncate">
                {activeImage.alt}
              </span>
            ) : (
              <span />
            )}
            {images.length > 1 && (
              <span className="text-ui-xs font-bold text-background tracking-widest shrink-0 ml-2">
                {activeIndex + 1}
                {COUNTER_SEPARATOR}
                {images.length}
              </span>
            )}
          </div>

          {product.featured && (
            <FeaturedRibbon
              label={t("featured")}
              accentVar={theme.accent}
              size="lg"
            />
          )}
        </div>

        {images.length > 1 && (
          <div className="grid w-full max-w-full gap-2" style={thumbGridStyle}>
            {images.map((img, idx) => {
              const isActive = idx === activeIndex;
              const activeCls = isActive
                ? "border-foreground shadow-brutal-sm"
                : thumbInactive;
              return (
                <button
                  type="button"
                  key={img.url}
                  onClick={() => setActiveIndex(idx)}
                  className={cn(
                    "relative h-16 overflow-hidden border-strong py-2 transition-all",
                    activeCls,
                  )}
                  style={isActive ? { backgroundColor: theme.bg } : undefined}
                  aria-label={
                    img.alt ||
                    t("gallery.views.viewImage", { label: String(idx + 1) })
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- user-provided image URLs can come from arbitrary hosts */}
                  <img
                    src={img.url}
                    alt={img.alt ?? ""}
                    className="absolute inset-0 size-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
