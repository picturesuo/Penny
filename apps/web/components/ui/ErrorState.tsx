import { cx } from "../../lib/design/classes";
import { Button } from "./Button";

type ErrorStateProps = {
  actionLabel?: string;
  className?: string;
  message: string;
  onAction?: () => void;
  title?: string;
};

export function ErrorState({ actionLabel, className, message, onAction, title = "Something needs attention" }: ErrorStateProps) {
  return (
    <div className={cx("ui-state ui-state--error", className)} role="alert">
      <h3>{title}</h3>
      <p>{message}</p>
      {actionLabel ? <Button variant="secondary" onClick={onAction}>{actionLabel}</Button> : null}
    </div>
  );
}
