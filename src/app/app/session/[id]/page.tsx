import { notFound } from "next/navigation";
import { SessionWorkspace } from "@/components/penny/session-workspace";
import { getSession, listMarginFragments } from "@/server/penny";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession(id);
  const fragments = await listMarginFragments();

  if (!session) {
    notFound();
  }

  return <SessionWorkspace session={session} initialFragments={fragments} />;
}
