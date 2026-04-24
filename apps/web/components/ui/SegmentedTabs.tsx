import type { PennyMode } from "../../lib/design/tokens";
import { cx } from "../../lib/design/classes";

type SegmentedTab = {
  id: PennyMode;
  label: string;
};

type SegmentedTabsProps = {
  active: PennyMode;
  ariaLabel?: string;
  items: SegmentedTab[];
  onSelect?: (id: PennyMode) => void;
};

export function SegmentedTabs({ active, ariaLabel = "Workspace mode", items, onSelect }: SegmentedTabsProps) {
  return (
    <div className="ui-segmented" role="tablist" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          aria-selected={active === item.id}
          className={cx("ui-segmented__tab", active === item.id && `ui-segmented__tab--${item.id}`)}
          key={item.id}
          {...(onSelect ? { onClick: () => onSelect(item.id) } : {})}
          role="tab"
          tabIndex={active === item.id ? 0 : -1}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
