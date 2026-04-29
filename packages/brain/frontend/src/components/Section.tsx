import type { ReactNode } from "react";

interface SectionProps {
  title: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}

export function Section({ title, children, className = "", action }: SectionProps) {
  return (
    <section className={className}>
      <div className="section-label-row">
        <h2 className="section-label">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
