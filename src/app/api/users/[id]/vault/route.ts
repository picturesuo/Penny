import { NextResponse } from "next/server";
import { z } from "zod";
import { recordVaultEntryRegistration } from "@/server/thought-map";
import { VAULT_ENTRY_TYPES } from "@/types/thought-map";

const vaultRegistrationSchema = z.object({
  mapId: z.string().trim().min(1),
  entryId: z.string().trim().min(1),
  entryType: z.enum(VAULT_ENTRY_TYPES),
  claimId: z.string().trim().min(1).nullable().optional().default(null),
  sessionId: z.string().trim().min(1).nullable().optional().default(null),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: userId } = await context.params;
    const input = vaultRegistrationSchema.parse(await request.json());
    const result = await recordVaultEntryRegistration({
      userId,
      mapId: input.mapId,
      entryId: input.entryId,
      entryType: input.entryType,
      claimId: input.claimId ?? null,
      sessionId: input.sessionId ?? null,
    });

    return NextResponse.json(
      {
        vaultEntry: result.vaultEntry,
        map: result.map,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "invalid_request",
          details: error.flatten(),
        },
        { status: 400 },
      );
    }

    if (error instanceof Error && /not found/i.test(error.message)) {
      return NextResponse.json(
        {
          error: "not_found",
          message: error.message,
        },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        error: "internal_error",
      },
      { status: 500 },
    );
  }
}
