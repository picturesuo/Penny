"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { searchApiClient, type CommandResult } from "../../lib/api/search";

export type CommandPaletteItemType = "thought" | "map" | "claim" | "session";

export type { CommandResult };

export type CommandPaletteItem = CommandResult & {
  keywords?: string[];
  disabled?: boolean;
  shouldNavigateAfterSelect?: boolean;
  onSelect: () => void | Promise<void>;
};

type UseCommandPaletteInput = {
  items: CommandPaletteItem[];
  enableBackendSearch?: boolean;
  onClearSelection?: () => boolean;
  onFocusContextInput?: () => boolean;
  onSelectBackendResult?: (result: CommandResult) => void | Promise<void>;
  onSwitchMode?: (mode: "brain" | "challenge" | "learn") => void | Promise<void>;
};

type BackendSearchStatus = "idle" | "loading" | "available" | "unavailable" | "error";

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function itemSearchText(item: CommandPaletteItem) {
  return normalizeSearchText(
    [item.type, item.title, item.subtitle, item.confidence == null ? null : String(item.confidence), ...(item.keywords ?? [])]
      .filter(Boolean)
      .join(" "),
  );
}

function backendResultToCommandItem(
  result: CommandResult,
  onSelectBackendResult?: (result: CommandResult) => void | Promise<void>,
): CommandPaletteItem {
  return {
    ...result,
    id: `backend:${result.type}:${result.id}`,
    href: onSelectBackendResult ? null : result.href,
    shouldNavigateAfterSelect: !onSelectBackendResult,
    title: result.title,
    onSelect: () => onSelectBackendResult?.(result),
  };
}

function createSearchTodoItem(): CommandPaletteItem {
  return {
    id: "todo:global-search-backend",
    type: "session",
    title: "Search is temporarily unavailable",
    subtitle: "Showing local workspace commands until backend search responds.",
    confidence: null,
    href: null,
    disabled: true,
    keywords: ["search", "backend", "unavailable"],
    onSelect: () => undefined,
  };
}

export function useCommandPalette({
  enableBackendSearch = true,
  items,
  onClearSelection,
  onFocusContextInput,
  onSelectBackendResult,
  onSwitchMode,
}: UseCommandPaletteInput) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [backendResults, setBackendResults] = useState<CommandPaletteItem[] | null>(null);
  const [backendSearchStatus, setBackendSearchStatus] = useState<BackendSearchStatus>("idle");

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((current) => !current);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.isComposing) {
        return;
      }

      const targetIsEditable = isEditableTarget(event.target);
      const key = event.key.toLowerCase();
      const isCommandK = key === "k" && (event.metaKey || event.ctrlKey) && !event.altKey;

      if (isCommandK && !targetIsEditable) {
        event.preventDefault();
        open();
        return;
      }

      if (event.key === "Escape") {
        if (isOpen) {
          event.preventDefault();
          close();
          return;
        }

        if (!targetIsEditable && onClearSelection?.()) {
          event.preventDefault();
        }

        return;
      }

      if (targetIsEditable || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === "/") {
        event.preventDefault();

        if (!onFocusContextInput?.()) {
          open();
        }

        return;
      }

      const modeByKey = {
        b: "brain",
        c: "challenge",
        l: "learn",
      } as const;
      const nextMode = modeByKey[key as keyof typeof modeByKey];

      if (nextMode) {
        event.preventDefault();
        void onSwitchMode?.(nextMode);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, isOpen, onClearSelection, onFocusContextInput, onSwitchMode, open]);

  useEffect(() => {
    const normalizedQuery = normalizeSearchText(query);

    if (!enableBackendSearch || !normalizedQuery) {
      setBackendResults(null);
      setBackendSearchStatus("idle");
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setBackendSearchStatus("loading");

      searchApiClient
        .search(normalizedQuery, { signal: controller.signal })
        .then((results) => {
          if (controller.signal.aborted) {
            return;
          }

          if (results === null) {
            setBackendResults(null);
            setBackendSearchStatus("unavailable");
            return;
          }

          setBackendResults(results.map((result) => backendResultToCommandItem(result, onSelectBackendResult)));
          setBackendSearchStatus("available");
        })
        .catch(() => {
          if (controller.signal.aborted) {
            return;
          }

          setBackendResults(null);
          setBackendSearchStatus("error");
        });
    }, 160);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [enableBackendSearch, onSelectBackendResult, query]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);

    if (!normalizedQuery) {
      return items;
    }

    if (backendResults) {
      return backendResults;
    }

    const localResults = items.filter((item) => itemSearchText(item).includes(normalizedQuery));

    if (backendSearchStatus === "unavailable") {
      return [...localResults, createSearchTodoItem()];
    }

    return localResults;
  }, [backendResults, backendSearchStatus, items, query]);

  const selectItem = useCallback(
    async (item: CommandPaletteItem) => {
      if (item.disabled) {
        return;
      }

      await item.onSelect();

      if (item.href && item.shouldNavigateAfterSelect) {
        window.location.assign(item.href);
      }

      close();
    },
    [close],
  );

  return {
    close,
    backendSearchStatus,
    filteredItems,
    isOpen,
    open,
    query,
    selectItem,
    setQuery,
    toggle,
  };
}
