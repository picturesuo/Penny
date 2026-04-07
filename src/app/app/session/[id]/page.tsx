import { notFound } from "next/navigation";
import { SessionWorkspace } from "@/components/penny/session-workspace";
import { getSession } from "@/server/penny";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession(id);

  if (!session) {
    notFound();
  }

  return <SessionWorkspace session={session} />;
}
