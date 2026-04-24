"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

const BACKEND_SEARCH_DEBOUNCE_MS = 220;

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
    title: "Search is not available",
    subtitle: "Local commands are still available.",
    confidence: null,
    href: null,
    disabled: true,
    keywords: ["search", "backend", "unavailable"],
    onSelect: () => undefined,
  };
}

function createSearchErrorItem(): CommandPaletteItem {
  return {
    id: "error:global-search-backend",
    type: "session",
    title: "Search request failed",
    subtitle: "Local commands are still available.",
    confidence: null,
    href: null,
    disabled: true,
    keywords: ["search", "backend", "error"],
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
  const [debouncedBackendQuery, setDebouncedBackendQuery] = useState("");
  const [backendResults, setBackendResults] = useState<CommandPaletteItem[] | null>(null);
  const [backendSearchStatus, setBackendSearchStatus] = useState<BackendSearchStatus>("idle");
  const onSelectBackendResultRef = useRef(onSelectBackendResult);

  useEffect(() => {
    onSelectBackendResultRef.current = onSelectBackendResult;
  }, [onSelectBackendResult]);

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
      setDebouncedBackendQuery("");
      setBackendResults(null);
      setBackendSearchStatus("idle");
      return;
    }

    setBackendResults(null);
    setBackendSearchStatus("loading");
    const timeout = window.setTimeout(() => {
      setDebouncedBackendQuery(normalizedQuery);
    }, BACKEND_SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [enableBackendSearch, query]);

  useEffect(() => {
    if (!enableBackendSearch || !debouncedBackendQuery) {
      return;
    }

    const controller = new AbortController();

    searchApiClient
      .search(debouncedBackendQuery, { signal: controller.signal })
      .then((results) => {
        if (controller.signal.aborted) {
          return;
        }

        if (results === null) {
          setBackendResults(null);
          setBackendSearchStatus("unavailable");
          return;
        }

        setBackendResults(results.map((result) => backendResultToCommandItem(result, onSelectBackendResultRef.current)));
        setBackendSearchStatus("available");
      })
      .catch(() => {
        if (controller.signal.aborted) {
          return;
        }

        setBackendResults(null);
        setBackendSearchStatus("error");
      });

    return () => {
      controller.abort();
    };
  }, [debouncedBackendQuery, enableBackendSearch]);

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

    if (backendSearchStatus === "error") {
      return [...localResults, createSearchErrorItem()];
    }

    return localResults;
  }, [backendResults, backendSearchStatus, items, query]);

  const selectItem = useCallback(
    async (item: CommandPaletteItem) => {
      if (item.disabled) {
        return;
      }

      try {
        await item.onSelect();

        if (item.href && item.shouldNavigateAfterSelect) {
          window.location.assign(item.href);
        }
      } catch {
        setBackendSearchStatus("error");
        return;
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
