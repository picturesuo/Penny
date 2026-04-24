import { PennyShell } from "../../components/penny-shell";

type WorkspaceMode = "brain" | "challenge" | "learn";

type WorkspacePageProps = {
  searchParams?: Promise<{
    mode?: string | string[];
  }>;
};

const workspaceModes = new Set<WorkspaceMode>(["brain", "challenge", "learn"]);

function parseMode(value: string | string[] | undefined): WorkspaceMode {
  const mode = Array.isArray(value) ? value[0] : value;

  return workspaceModes.has(mode as WorkspaceMode) ? (mode as WorkspaceMode) : "brain";
}

export default async function WorkspacePage({ searchParams }: WorkspacePageProps) {
  const params = await searchParams;
  const mode = parseMode(params?.mode);

  return <PennyShell initialMode={mode} />;
}
