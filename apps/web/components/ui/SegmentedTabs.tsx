import type { PennyMode } from "../../lib/design/tokens";
import { cx } from "../../lib/design/classes";

type SegmentedTab = {
  id: PennyMode;
  label: string;
};

type SegmentedTabsProps = {
  active: PennyMode;
  items: SegmentedTab[];
};

export function SegmentedTabs({ active, items }: SegmentedTabsProps) {
  return (
    <div className="ui-segmented" role="tablist" aria-label="Workspace mode">
      {items.map((item) => (
        <button
          aria-selected={active === item.id}
          className={cx("ui-segmented__tab", active === item.id && `ui-segmented__tab--${item.id}`)}
          key={item.id}
          role="tab"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
