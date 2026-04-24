import type { ReactNode } from "react";
import { InspectorRail } from "./InspectorRail";

type WorkspaceLayoutProps = {
  children: ReactNode;
  inspector?: ReactNode;
};

export function WorkspaceLayout({ children, inspector }: WorkspaceLayoutProps) {
  return (
    <div className="workspace-layout">
      <main className="workspace-layout__main">{children}</main>
      <InspectorRail>{inspector}</InspectorRail>
    </div>
  );
}
