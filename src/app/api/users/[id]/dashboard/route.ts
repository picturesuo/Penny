import { NextResponse } from "next/server";
import { computeHomeDashboard } from "@/lib/home-dashboard";
import { listMarginFragments, listSessions } from "@/server/penny";
import { listThoughtMaps } from "@/server/thought-map";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [maps, sessions, fragments] = await Promise.all([
    listThoughtMaps(),
    listSessions(id),
    listMarginFragments(id),
  ]);

  const dashboard = computeHomeDashboard(id, {
    userId: id,
    maps: maps.filter((map) => map.userId === id),
    sessions,
    fragments,
  });

  return NextResponse.json({ dashboard });
}
