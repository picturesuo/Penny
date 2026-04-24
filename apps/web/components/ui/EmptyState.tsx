import type { ReactNode } from "react";
import { cx } from "../../lib/design/classes";
import { Button } from "./Button";

type EmptyStateProps = {
  actionLabel?: string;
  body: string;
  className?: string;
  icon?: ReactNode;
  onAction?: () => void;
  title: string;
};

export function EmptyState({ actionLabel, body, className, icon, onAction, title }: EmptyStateProps) {
  return (
    <div className={cx("ui-state ui-state--empty", className)}>
      {icon ? <div className="ui-state__icon" aria-hidden="true">{icon}</div> : null}
      <h3>{title}</h3>
      <p>{body}</p>
      {actionLabel ? <Button variant="secondary" onClick={onAction}>{actionLabel}</Button> : null}
    </div>
  );
}
