import { cx } from "../../lib/design/classes";

type LoadingStateProps = {
  className?: string;
  label?: string;
};

export function LoadingState({ className, label = "Loading workspace" }: LoadingStateProps) {
  return (
    <div className={cx("ui-state ui-state--loading", className)} role="status">
      <span className="ui-spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}
