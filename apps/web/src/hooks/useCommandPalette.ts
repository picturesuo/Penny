"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { searchApiClient, type CommandResult } from "../../lib/api/search";

export type CommandPaletteItemType = "thought" | "map" | "claim" | "session";

export type { CommandResult };

export type CommandPaletteItem = CommandResult & {
  keywords?: string[];
  disabled?: boolean;
  onSelect: () => void | Promise<void>;
};

type UseCommandPaletteInput = {
  items: CommandPaletteItem[];
  enableBackendSearch?: boolean;
};

type BackendSearchStatus = "idle" | "loading" | "available" | "unavailable" | "error";

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

function itemSearchText(item: CommandPaletteItem) {
  return normalizeSearchText(
    [item.type, item.title, item.subtitle, item.confidence == null ? null : String(item.confidence), ...(item.keywords ?? [])]
      .filter(Boolean)
      .join(" "),
  );
}

function backendResultToCommandItem(result: CommandResult): CommandPaletteItem {
  return {
    ...result,
    id: `backend:${result.type}:${result.id}`,
    title: result.title,
    onSelect: () => undefined,
  };
}

function createSearchTodoItem(): CommandPaletteItem {
  return {
    id: "todo:global-search-backend",
    type: "session",
    title: "TODO: Connect backend global search",
    subtitle: "Using frontend-only placeholder results until /api/search exists.",
    disabled: true,
    keywords: ["todo", "search", "backend", "placeholder"],
    onSelect: () => undefined,
  };
}

export function useCommandPalette({ enableBackendSearch = true, items }: UseCommandPaletteInput) {
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

      const isCommandK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);

      if (!isCommandK) {
        return;
      }

      event.preventDefault();
      toggle();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [toggle]);

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

          setBackendResults(results.map(backendResultToCommandItem));
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
  }, [enableBackendSearch, query]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);

    if (!normalizedQuery) {
      return items;
    }

    if (backendResults) {
      return backendResults;
    }

    const localResults = items.filter((item) => itemSearchText(item).includes(normalizedQuery));

    // TODO: Replace these frontend-only placeholder results once /api/search is implemented.
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

      if (item.href) {
        window.location.assign(item.href);
        close();
        return;
      }

      await item.onSelect();
      console.info("Selected command result", {
        id: item.id,
        type: item.type,
        title: item.title,
        subtitle: item.subtitle,
        confidence: item.confidence,
        href: item.href,
      } satisfies CommandResult);
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
