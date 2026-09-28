"use client";

import type { DraggableProvided } from "@hello-pangea/dnd";
import { GripVertical, Pencil, Trash2, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { formatPrice, getCoverImageUrl, i18nField, tid } from "shared";
import type { ProductCategory, ProductType } from "shared/types";
import { Badge, Button, cn } from "ui";

import {
  CATEGORY_COLOR_MAP,
  TYPE_COLOR_MAP,
} from "@/features/products/domain/constants";
import type { Product } from "@/features/products/domain/types";
import { Link } from "@/shared/infrastructure/i18n";

const STATUS_ON = "on";
const STATUS_OFF = "off";

interface ProductTableRowProps {
  product: Product;
  isOddRow: boolean;
  canReorder: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canManageDelegates: boolean;
  dragProvided: DraggableProvided;
  isDragging: boolean;
  delegateCount?: number;
  onToggle: (
    id: string,
    field: "is_active" | "featured",
    value: boolean,
  ) => void;
  onDelete: (id: string) => void;
  isMutating?: boolean;
}

function renderReadOnlyState(value: boolean) {
  return (
    <span className="font-mono text-xs">{value ? STATUS_ON : STATUS_OFF}</span>
  );
}

export function ProductTableRow({
  product,
  isOddRow,
  canReorder,
  canUpdate,
  canDelete,
  canManageDelegates,
  dragProvided,
  isDragging,
  delegateCount,
  onToggle,
  onDelete,
  isMutating = false,
}: ProductTableRowProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [isConfirming, setIsConfirming] = useState(false);

  const imageUrl = getCoverImageUrl(product.images);
  const name = i18nField(
    product as unknown as Record<string, unknown>,
    "name",
    locale,
  );

  const handleToggle = useCallback(
    (field: "is_active" | "featured", currentValue: boolean) => {
      onToggle(product.id, field, !currentValue);
    },
    [onToggle, product.id],
  );

  const handleDelete = useCallback(() => {
    setIsConfirming(true);
  }, []);

  const confirmDelete = useCallback(() => {
    onDelete(product.id);
    setIsConfirming(false);
  }, [onDelete, product.id]);

  const getToggleClass = (isActive: boolean, activeClass: string) =>
    cn(
      "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-border transition-colors",
      isActive ? activeClass : "bg-muted",
    );

  const getToggleThumbClass = (isActive: boolean) =>
    cn(
      "pointer-events-none block size-4 rounded-full border border-border bg-background transition-transform",
      isActive ? "translate-x-5" : "translate-x-0.5",
    );

  let actionControls: ReactNode = null;
  if (canDelete && isConfirming) {
    actionControls = (
      <div className="flex items-center gap-1">
        <Button
          variant="destructive"
          size="sm"
          className="border-2 border-border text-xs"
          onClick={confirmDelete}
          disabled={isMutating}
          {...tid(`confirm-delete-${product.id}`)}
        >
          {t("common.confirm")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-2 border-border text-xs"
          onClick={() => setIsConfirming(false)}
          {...tid(`cancel-delete-${product.id}`)}
        >
          {t("common.cancel")}
        </Button>
      </div>
    );
  } else if (canDelete) {
    actionControls = (
      <Button
        variant="outline"
        size="sm"
        className="border-2 border-border text-destructive hover:bg-destructive/10"
        onClick={handleDelete}
        {...tid(`delete-product-${product.id}`)}
      >
        <Trash2 className="size-3.5" />
        <span className="sr-only">{t("common.delete")}</span>
      </Button>
    );
  }

  return (
    <tr
      ref={dragProvided.innerRef}
      {...dragProvided.draggableProps}
      className={cn(
        "border-b border-border/50 transition-colors hover:bg-muted/30",
        isOddRow && "bg-muted/10",
        isDragging && "bg-muted shadow-lg",
      )}
      data-dragging={isDragging}
      {...tid(`product-row-${product.id}`)}
    >
      {canReorder && (
        <td className="w-10 px-4 py-3">
          <div
            {...dragProvided.dragHandleProps}
            className="cursor-grab text-muted-foreground hover:text-foreground"
            aria-label={t("products.dragToReorder")}
          >
            <GripVertical className="size-4" />
          </div>
        </td>
      )}

      <td className="px-4 py-3">
        <div className="size-10 overflow-hidden rounded-lg border-2 border-border bg-muted">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-provided image URLs can come from arbitrary hosts
            <img
              src={imageUrl}
              alt={name}
              className="size-full object-cover"
              loading="lazy"
              decoding="async"
              data-testid="product-image"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
              {"--"}
            </div>
          )}
        </div>
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-table-cell font-medium">{name}</span>
          {canManageDelegates && !!delegateCount && delegateCount > 0 && (
            <Users
              className="size-3.5 text-muted-foreground"
              aria-label={t("products.hasDelegates")}
            />
          )}
        </div>
      </td>

      <td className="px-4 py-3">
        <Badge
          variant="outline"
          className="border-2 font-bold uppercase"
          style={TYPE_COLOR_MAP[product.type as ProductType]}
        >
          {t(`productTypes.${product.type}`)}
        </Badge>
      </td>

      <td className="px-4 py-3">
        <Badge
          variant="outline"
          className="border-2 font-bold uppercase"
          style={CATEGORY_COLOR_MAP[product.category as ProductCategory]}
        >
          {t(`categories.${product.category}`)}
        </Badge>
      </td>

      <td className="px-4 py-3 text-right">
        <span className="text-table-cell font-bold tabular-nums">
          {formatPrice(product.price, product.currency)}
        </span>
      </td>

      <td className="px-4 py-3 text-center">
        {canUpdate ? (
          <button
            type="button"
            onClick={() => handleToggle("is_active", product.is_active)}
            disabled={isMutating}
            className={getToggleClass(product.is_active, "bg-success")}
            role="switch"
            aria-checked={product.is_active}
            {...tid(`toggle-active-${product.id}`)}
          >
            <span className={getToggleThumbClass(product.is_active)} />
          </button>
        ) : (
          renderReadOnlyState(product.is_active)
        )}
      </td>

      <td className="px-4 py-3 text-center">
        {canUpdate ? (
          <button
            type="button"
            onClick={() => handleToggle("featured", product.featured)}
            disabled={isMutating}
            className={getToggleClass(product.featured, "bg-brand")}
            role="switch"
            aria-checked={product.featured}
            {...tid(`toggle-featured-${product.id}`)}
          >
            <span className={getToggleThumbClass(product.featured)} />
          </button>
        ) : (
          renderReadOnlyState(product.featured)
        )}
      </td>

      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          {canManageDelegates && (
            <Link href={`/products/${product.id}/delegates`}>
              <Button
                variant="outline"
                size="sm"
                className="border-2 border-border"
                {...tid(`manage-delegates-${product.id}`)}
              >
                <Users className="size-3.5" />
                <span className="sr-only">{t("products.manageDelegates")}</span>
              </Button>
            </Link>
          )}
          {canUpdate && (
            <Link href={`/products/${product.id}`}>
              <Button
                variant="outline"
                size="sm"
                className="border-2 border-border"
                {...tid(`edit-product-${product.id}`)}
              >
                <Pencil className="size-3.5" />
                <span className="sr-only">{t("common.edit")}</span>
              </Button>
            </Link>
          )}
          {actionControls}
        </div>
      </td>
    </tr>
  );
}
