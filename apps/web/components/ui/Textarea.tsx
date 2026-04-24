import type { TextareaHTMLAttributes } from "react";
import { cx } from "../../lib/design/classes";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
};

export function Textarea({ className, id, label, ...props }: TextareaProps) {
  const textareaId = id ?? (typeof label === "string" ? label.toLowerCase().replaceAll(" ", "-") : undefined);

  return (
    <label className="ui-field">
      {label ? <span>{label}</span> : null}
      <textarea className={cx("ui-textarea", className)} id={textareaId} {...props} />
    </label>
  );
}
