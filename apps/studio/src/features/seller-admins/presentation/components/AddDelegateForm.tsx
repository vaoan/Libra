"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { tid } from "shared";
import { Button, Input } from "ui";

import { useDelegateSearch } from "@/features/seller-admins/application/hooks/useDelegateSearch";
import type { UserSearchResult } from "@/features/seller-admins/application/hooks/useDelegateSearch";
import { DELEGATE_PERMISSIONS } from "@/features/seller-admins/domain/constants";
import type { DelegatePermission } from "@/features/seller-admins/domain/types";
import { getDisplayName } from "@/features/seller-admins/domain/utils";
import { useCurrentUser } from "@/shared/application/hooks/useCurrentUser";

const MIN_SEARCH_LENGTH = 2;

interface AddDelegateFormProps {
  onAdd: (adminUserId: string, permissions: DelegatePermission[]) => void;
  isAdding?: boolean;
  productId?: string;
}

export function AddDelegateForm({ onAdd, isAdding }: AddDelegateFormProps) {
  const t = useTranslations("sellerAdmins");
  const { user } = useCurrentUser();
  const { search } = useDelegateSearch(user?.id);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<{
    id: string;
    email: string;
    display_name: string | null;
  } | null>(null);
  const [permissions, setPermissions] = useState<Set<DelegatePermission>>(
    new Set(),
  );
  const [isSearching, setIsSearching] = useState(false);

  // The search is driven by state, not by the change event: it runs whenever
  // the query is long enough AND the current user is known. Searching inside
  // onChange bailed out while `useCurrentUser` was still resolving, so an
  // email typed in that window was dropped for good -- no results, no hint,
  // nothing re-ran when the user arrived (production E2E run
  // e2e-20260928-0758-60c6). A selection is not re-searched: picking a user
  // puts their display name in the box, and that must not reopen the list.
  const selectedLabel = selectedUser ? getDisplayName(selectedUser) : null;
  useEffect(() => {
    if (
      !user ||
      query.trim().length < MIN_SEARCH_LENGTH ||
      query === selectedLabel
    ) {
      setResults([]);
      return;
    }
    let isActive = true;
    setIsSearching(true);
    search(query)
      .then((users) => {
        if (isActive) setResults(users);
      })
      .catch(() => {
        if (isActive) setResults([]);
      })
      .finally(() => {
        if (isActive) setIsSearching(false);
      });
    return () => {
      isActive = false;
    };
  }, [query, user, search, selectedLabel]);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
  }, []);

  const handleSelectUser = useCallback(
    (u: { id: string; email: string; display_name: string | null }) => {
      setSelectedUser(u);
      setQuery(getDisplayName(u));
      setResults([]);
    },
    [],
  );

  const togglePermission = useCallback((perm: DelegatePermission) => {
    setPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(perm)) next.delete(perm);
      else next.add(perm);
      return next;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    if (!selectedUser || permissions.size === 0) return;
    onAdd(selectedUser.id, [...permissions]);
    setSelectedUser(null);
    setQuery("");
    setPermissions(new Set());
  }, [selectedUser, permissions, onAdd]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Input
          {...tid("delegate-search-input")}
          placeholder={t("searchPlaceholder")}
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          aria-label={t("searchUsers")}
        />
        {results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
            {results.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => handleSelectUser(u)}
                >
                  <span className="font-medium">{getDisplayName(u)}</span>
                  {u.display_name && (
                    <span className="ml-2 text-muted-foreground">
                      {u.email}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {isSearching && (
          <p className="mt-1 text-xs text-muted-foreground">{t("searching")}</p>
        )}
      </div>

      {selectedUser && (
        <p className="text-sm" {...tid("delegate-selected-user")}>
          {t("selectedUser")}: <strong>{getDisplayName(selectedUser)}</strong>
        </p>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("permissionsLabel")}</legend>
        {DELEGATE_PERMISSIONS.map((perm) => (
          <label key={perm} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...tid(`delegate-permission-${perm}`)}
              checked={permissions.has(perm)}
              onChange={() => togglePermission(perm)}
            />
            {t(`permissions.${perm.replaceAll(".", "_")}`)}
          </label>
        ))}
      </fieldset>

      <Button
        {...tid("delegate-add-submit")}
        onClick={handleSubmit}
        disabled={!selectedUser || permissions.size === 0 || isAdding}
      >
        {isAdding ? t("adding") : t("addDelegate")}
      </Button>
    </div>
  );
}
