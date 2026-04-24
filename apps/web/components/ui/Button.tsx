import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../../lib/design/classes";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export function Button({
  children,
  className,
  icon,
  size = "md",
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button className={cx("ui-button", `ui-button--${variant}`, `ui-button--${size}`, className)} type={type} {...props}>
      {icon ? <span className="ui-button__icon" aria-hidden="true">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}
