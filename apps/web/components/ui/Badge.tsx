import type { HTMLAttributes, ReactNode } from "react";
import type { PennyMode } from "../../lib/design/tokens";
import { cx } from "../../lib/design/classes";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  mode?: PennyMode;
  tone?: "neutral" | "success" | "danger";
};

export function Badge({ children, className, mode, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span className={cx("ui-badge", `ui-badge--${tone}`, mode && `ui-badge--${mode}`, className)} {...props}>
      {children}
    </span>
  );
}
