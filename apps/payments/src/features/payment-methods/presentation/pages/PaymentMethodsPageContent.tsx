/* eslint-disable i18next/no-literal-string -- aria-labels and language code labels are UI chrome, not user-facing content */
"use client";

import { useCurrentUser } from "auth/client";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Plus,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { i18nField, tid } from "shared";
import { Button, Switch, cn } from "ui";

import { usePaymentMethodsManager } from "@/features/payment-methods/application/hooks/usePaymentMethodsManager";
import { PaymentMethodEditor } from "@/features/payment-methods/presentation/components/PaymentMethodEditor";

interface PaymentMethodsPageContentProps {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export function PaymentMethodsPageContent({
  canCreate,
  canUpdate,
  canDelete,
}: PaymentMethodsPageContentProps) {
  const t = useTranslations("paymentMethods");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const { user } = useCurrentUser();

  const sellerId = user?.id ?? "";
  const {
    methods,
    isLoading,
    expandedId,
    isCreating,
    handleToggleExpand,
    handleCreate,
    handleDelete,
    handleToggleActive,
    handleMoveUp,
    handleMoveDown,
  } = usePaymentMethodsManager(sellerId);

  if (isLoading) {
    return (
      <main className="flex flex-1 flex-col surface-grid-dots">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8">
          <p className="text-muted-foreground">{tCommon("loading")}</p>
        </div>
      </main>
    );
  }

  return (
    <main
      className="flex flex-1 flex-col surface-grid-dots"
      {...tid("payment-methods-page")}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-4xl font-extrabold uppercase tracking-tight">
              {t("title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
          {canCreate && (
            <Button
              type="button"
              className="button-brutal shadow-brutal-md button-press-sm rounded-xl border-strong bg-brand px-6 py-3 text-brand-foreground hover:bg-brand-hover"
              onClick={handleCreate}
              // Until useCurrentUser resolves there is no seller id to create
              // for; a click then inserts for "" and nothing expands.
              disabled={isCreating || !sellerId}
              {...tid("add-payment-method-button")}
            >
              <Plus className="size-5" />
              {isCreating ? tCommon("loading") : t("addMethod")}
            </Button>
          )}
        </header>

        {/* Empty state */}
        {(!methods || methods.length === 0) && (
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-xl border-strong border-dashed border-border bg-muted/30 py-16"
            {...tid("payment-methods-empty-state")}
          >
            <p className="font-display text-lg font-bold uppercase">
              {t("noMethods")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("noMethodsHint")}
            </p>
          </div>
        )}

        {/* Method list — each item expands inline to show the full builder */}
        {methods && methods.length > 0 && (
          <div className="flex flex-col gap-4">
            {methods.map((method, index) => {
              const isExpanded = expandedId === method.id;

              return (
                <div
                  key={method.id}
                  className={cn(
                    "rounded-xl border-strong border-foreground bg-background shadow-brutal-sm overflow-hidden",
                    isExpanded && "bg-muted/30",
                  )}
                  {...tid("payment-method-row")}
                >
                  {/* Collapsed header row */}
                  <div className="flex items-center gap-3 p-4">
                    {/* Reorder buttons */}
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => handleMoveUp(index)}
                        className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                        aria-label="Move up"
                        {...tid(`payment-method-up-${method.id}`)}
                      >
                        <ChevronUp className="size-4" />
                      </button>
                      <button
                        type="button"
                        disabled={index === (methods?.length ?? 0) - 1}
                        onClick={() => handleMoveDown(index)}
                        className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                        aria-label="Move down"
                        {...tid(`payment-method-down-${method.id}`)}
                      >
                        <ChevronDown className="size-4" />
                      </button>
                    </div>

                    {/* Name — clickable to expand */}
                    <button
                      type="button"
                      className="flex flex-1 min-w-0 items-center gap-2 text-left"
                      onClick={() => handleToggleExpand(method.id)}
                      {...tid("payment-method-name")}
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <p className="font-display text-sm font-bold uppercase tracking-wide truncate">
                        {i18nField(method, "name", locale) || method.name_en}
                      </p>
                    </button>

                    {/* Active toggle */}
                    {canUpdate && (
                      <Switch
                        checked={method.is_active}
                        onCheckedChange={(checked: boolean) =>
                          handleToggleActive(method.id, checked)
                        }
                        {...tid("payment-method-active-toggle")}
                      />
                    )}

                    {/* Delete button */}
                    {canDelete && (
                      <button
                        type="button"
                        className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={t("removeMethod")}
                        onClick={() => handleDelete(method.id)}
                        {...tid("payment-method-delete")}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>

                  {/* Expanded builder */}
                  {isExpanded && (
                    <div className="border-t border-border px-4 pb-4">
                      <PaymentMethodEditor method={method} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
