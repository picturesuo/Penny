import type { ReactNode } from "react";
import { Button } from "./Button";

type EmptyStateProps = {
  actionLabel?: string;
  body: string;
  icon?: ReactNode;
  title: string;
};

export function EmptyState({ actionLabel, body, icon, title }: EmptyStateProps) {
  return (
    <div className="ui-state ui-state--empty">
      {icon ? <div className="ui-state__icon" aria-hidden="true">{icon}</div> : null}
      <h3>{title}</h3>
      <p>{body}</p>
      {actionLabel ? <Button variant="secondary">{actionLabel}</Button> : null}
    </div>
  );
}
