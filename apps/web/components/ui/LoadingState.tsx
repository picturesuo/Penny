type LoadingStateProps = {
  label?: string;
};

export function LoadingState({ label = "Loading workspace" }: LoadingStateProps) {
  return (
    <div className="ui-state ui-state--loading" role="status">
      <span className="ui-spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}
