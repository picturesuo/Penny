import type { SeedBrainResponse, SessionMovesResponse } from "../types/brain";

const headers = {
  "content-type": "application/json",
  "x-user-id": "dev-user",
  "x-project-id": "dev-project",
};

export async function seedBrain(rawIdea: string): Promise<SeedBrainResponse> {
  const response = await fetch("/brain/seed", {
    method: "POST",
    headers,
    body: JSON.stringify({ rawIdea }),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /brain/seed failed with ${response.status}.`));
  }

  return payload as SeedBrainResponse;
}

export async function fetchSessionMoves(sessionId: string): Promise<SessionMovesResponse> {
  const response = await fetch(`/brain/session/${encodeURIComponent(sessionId)}/moves`, {
    method: "GET",
    headers,
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `GET /brain/session/${sessionId}/moves failed with ${response.status}.`));
  }

  return payload as SessionMovesResponse;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }

  return fallback;
}
