"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQueryState } from "nuqs";
import { useCallback, useEffect, useRef, useState } from "react";
import { tid } from "shared";

import { catalogSearchParams } from "@/features/products/domain/searchParams";

const DEBOUNCE_MS = 300;

export function SearchBar() {
  const t = useTranslations("products");
  const [query, setQuery] = useQueryState("q", catalogSearchParams.q);
  const [localValue, setLocalValue] = useState(query ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local value when URL param changes externally (browser back/forward)
  // Equality guard prevents debounce→URL→sync cycle from overwriting user input mid-type
  useEffect(() => {
    if ((query ?? "") !== localValue) {
      setLocalValue(query ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const commitQuery = useCallback(
    (value: string) => {
      void setQuery(value === "" ? null : value, { history: "replace" });
    },
    [setQuery],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { value } = e.target;
      setLocalValue(value);

      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        commitQuery(value);
      }, DEBOUNCE_MS);
    },
    [commitQuery],
  );

  // Flush a pending debounced write when focus leaves the input. Clicking
  // anywhere else (a product card) blurs the input before the click event, so
  // the URL write lands before the Link navigation starts. Left to the timer,
  // the write could land while that navigation is in flight: Next turns a
  // userland history.replaceState into an ACTION_RESTORE, and a restore
  // discards any pending navigation -- the page silently stays on the catalog.
  const handleBlur = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    commitQuery(localValue);
  }, [commitQuery, localValue]);

  return (
    <div className="relative" {...tid("search-bar")}>
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        size={16}
        aria-hidden="true"
      />
      <input
        type="search"
        value={localValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={t("search")}
        className="w-full border-strong border-foreground bg-background pl-9 pr-4 py-2 text-sm font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground focus:ring-offset-0 rounded-none"
        aria-label={t("search")}
        {...tid("search-bar-input")}
      />
    </div>
  );
}
