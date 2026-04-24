"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import { Skeleton } from "../../../components/ui";
import type { CommandPaletteItem } from "../../hooks/useCommandPalette";

type CommandPaletteProps = {
  isOpen: boolean;
  items: CommandPaletteItem[];
  isLoading?: boolean;
  onClose: () => void;
  onSelectItem: (item: CommandPaletteItem) => void | Promise<void>;
  placeholder?: string;
  query: string;
  setQuery: (query: string) => void;
};

const typeLabels: Record<CommandPaletteItem["type"], string> = {
  claim: "Claim",
  map: "Map",
  session: "Session",
  thought: "Thought",
};

const typeOrder: CommandPaletteItem["type"][] = ["thought", "map", "claim", "session"];

const searchSkeletonStyles = {
  list: {
    display: "grid",
    gap: 8,
    padding: "10px 8px 14px",
  },
  row: {
    minHeight: 66,
    display: "grid",
    gridTemplateColumns: "34px minmax(0, 1fr) 70px",
    alignItems: "center",
    gap: 12,
    borderRadius: 8,
    padding: 10,
  },
  copy: {
    display: "grid",
    gap: 8,
  },
} as const;

function formatResultMeta(item: CommandPaletteItem) {
  if (typeof item.confidence !== "number") {
    return item.subtitle;
  }

  const confidenceLabel = `${item.confidence}% confidence`;
  return item.subtitle ? `${item.subtitle} - ${confidenceLabel}` : confidenceLabel;
}

function getNextEnabledIndex(items: CommandPaletteItem[], startIndex: number, direction: 1 | -1) {
  if (!items.length) {
    return -1;
  }

  let nextIndex = startIndex;

  for (let attempts = 0; attempts < items.length; attempts += 1) {
    nextIndex = (nextIndex + direction + items.length) % items.length;

    if (!items[nextIndex]?.disabled) {
      return nextIndex;
    }
  }

  return -1;
}

export function CommandPalette({
  isOpen,
  items,
  isLoading = false,
  onClose,
  onSelectItem,
  placeholder = "Search your brain…",
  query,
  setQuery,
}: CommandPaletteProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const groupedItems = useMemo(
    () =>
      typeOrder
        .map((type) => ({
          type,
          items: items
            .map((item, index) => ({ index, item }))
            .filter((entry) => entry.item.type === type),
        }))
        .filter((group) => group.items.length > 0),
    [items],
  );

  const activeItemId = useMemo(() => {
    if (activeIndex < 0 || !items[activeIndex]) {
      return undefined;
    }

    return `${inputId}-item-${activeIndex}`;
  }, [activeIndex, inputId, items]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const nextIndex = getNextEnabledIndex(items, -1, 1);
    setActiveIndex(nextIndex);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [isOpen, items]);

  if (!isOpen) {
    return null;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => getNextEnabledIndex(items, current, 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => getNextEnabledIndex(items, current, -1));
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const item = items[activeIndex];

      if (item) {
        void onSelectItem(item);
      }
    }
  }

  return (
    <div className="command-palette" role="presentation">
      <button className="command-palette__scrim" type="button" aria-label="Close search" onClick={onClose} />
      <section className="command-palette__dialog" role="dialog" aria-modal="true" aria-labelledby={`${inputId}-title`}>
        <h2 className="ui-sr-only" id={`${inputId}-title`}>
          Search Penny
        </h2>
        <div className="command-palette__search-row">
          <span className="command-palette__search-icon" aria-hidden="true">
            /
          </span>
          <input
            ref={inputRef}
            aria-activedescendant={activeItemId}
            aria-controls={`${inputId}-results`}
            aria-label="Search Penny"
            autoFocus
            autoComplete="off"
            className="command-palette__input"
            id={inputId}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            role="combobox"
            type="search"
            value={query}
          />
          <kbd>Esc</kbd>
        </div>

        <div className="command-palette__results" id={`${inputId}-results`} role="listbox" aria-label="Search results">
          {isLoading ? (
            <SearchResultsSkeleton />
          ) : items.length > 0 ? (
            groupedItems.map((group) => (
              <div key={group.type} className="command-palette__group" role="group" aria-label={typeLabels[group.type]}>
                <div className="command-palette__group-heading">{typeLabels[group.type]}</div>
                {group.items.map(({ index, item }) => (
                  <CommandResultButton
                    key={item.id}
                    active={index === activeIndex}
                    id={`${inputId}-item-${index}`}
                    item={item}
                    onMouseEnter={() => setActiveIndex(index)}
                    onSelect={() => {
                      void onSelectItem(item);
                    }}
                  />
                ))}
              </div>
            ))
          ) : (
            <div className="command-palette__empty" role="status">
              <strong style={{ color: "var(--penny-ink)", display: "block", marginBottom: 6 }}>No search results</strong>
              <span>Try a thought, claim, map title, or session keyword.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SearchResultsSkeleton() {
  return (
    <div style={searchSkeletonStyles.list} role="status" aria-label="Loading search results">
      {Array.from({ length: 4 }).map((_, index) => (
        <div style={searchSkeletonStyles.row} key={index}>
          <Skeleton height={34} label="Loading search result icon" />
          <span style={searchSkeletonStyles.copy}>
            <Skeleton height={14} label="Loading search result title" width="72%" />
            <Skeleton height={12} label="Loading search result subtitle" width="48%" />
          </span>
          <Skeleton height={24} label="Loading search result type" />
        </div>
      ))}
    </div>
  );
}

function CommandResultButton({
  active,
  id,
  item,
  onMouseEnter,
  onSelect,
}: {
  active: boolean;
  id: string;
  item: CommandPaletteItem;
  onMouseEnter: () => void;
  onSelect: () => void;
}) {
  const meta = formatResultMeta(item);

  return (
    <button
      id={id}
      type="button"
      className="command-palette__item"
      data-active={active}
      disabled={item.disabled}
      onMouseEnter={onMouseEnter}
      onClick={onSelect}
      role="option"
      aria-selected={active}
    >
      <span className="command-palette__item-mark" data-type={item.type} aria-hidden="true">
        {typeLabels[item.type].slice(0, 1)}
      </span>
      <span className="command-palette__item-copy">
        <span className="command-palette__item-title">{item.title}</span>
        {meta ? <span className="command-palette__item-subtitle">{meta}</span> : null}
      </span>
      <span className="command-palette__item-type">{typeLabels[item.type]}</span>
    </button>
  );
}
