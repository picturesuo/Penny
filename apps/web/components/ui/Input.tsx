import type { InputHTMLAttributes } from "react";
import { cx } from "../../lib/design/classes";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
};

export function Input({ className, id, label, ...props }: InputProps) {
  const inputId = id ?? (typeof label === "string" ? label.toLowerCase().replaceAll(" ", "-") : undefined);

  return (
    <label className="ui-field">
      {label ? <span>{label}</span> : null}
      <input className={cx("ui-input", className)} id={inputId} {...props} />
    </label>
  );
}
