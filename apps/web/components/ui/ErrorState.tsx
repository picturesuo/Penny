import { Button } from "./Button";

type ErrorStateProps = {
  actionLabel?: string;
  message: string;
  title?: string;
};

export function ErrorState({ actionLabel, message, title = "Something needs attention" }: ErrorStateProps) {
  return (
    <div className="ui-state ui-state--error" role="alert">
      <h3>{title}</h3>
      <p>{message}</p>
      {actionLabel ? <Button variant="secondary">{actionLabel}</Button> : null}
    </div>
  );
}
