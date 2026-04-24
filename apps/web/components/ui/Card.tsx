import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../lib/design/classes";

type CardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  tone?: "default" | "muted";
};

export function Card({ children, className, tone = "default", ...props }: CardProps) {
  return (
    <article className={cx("ui-card", tone === "muted" && "ui-card--muted", className)} {...props}>
      {children}
    </article>
  );
}
