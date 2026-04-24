import { cx } from "../../lib/design/classes";
import { Button } from "./Button";

type ErrorStateProps = {
  actionLabel?: string;
  className?: string;
  message: string;
  onAction?: () => void;
  technicalDetail?: string | null;
  title?: string;
};

export function ErrorState({
  actionLabel,
  className,
  message,
  onAction,
  technicalDetail,
  title = "Something needs attention",
}: ErrorStateProps) {
  const showTechnicalDetail = process.env.NODE_ENV !== "production" && Boolean(technicalDetail);

  return (
    <div className={cx("ui-state ui-state--error", className)} role="alert">
      <h3>{title}</h3>
      <p>{message}</p>
      {showTechnicalDetail ? (
        <details>
          <summary>Technical detail</summary>
          <p>{technicalDetail}</p>
        </details>
      ) : null}
      {actionLabel ? <Button variant="secondary" onClick={onAction}>{actionLabel}</Button> : null}
    </div>
  );
}
