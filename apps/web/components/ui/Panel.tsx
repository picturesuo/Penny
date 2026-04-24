import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "../../lib/design/classes";

type PanelProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  title?: string;
  eyebrow?: string;
};

export function Panel({ children, className, eyebrow, title, ...props }: PanelProps) {
  return (
    <section className={cx("ui-panel", className)} {...props}>
      {eyebrow || title ? (
        <header className="ui-panel__header">
          {eyebrow ? <p className="ui-eyebrow">{eyebrow}</p> : null}
          {title ? <h2>{title}</h2> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
