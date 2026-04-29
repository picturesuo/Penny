import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { handleArtifactRequest, handleSessionArtifactRequest } from "./artifact-route.ts";
import { handleAssumptionResponseRequest } from "./assumption-response-route.ts";
import { handleBrainSeedRequest } from "./brain-seed-route.ts";
import { handleChallengeRequest, handleChallengeRespondRequest } from "./challenge-route.ts";
import { handleClaimDetailRequest } from "./claim-detail-route.ts";
import { handleInlineLearnRequest, handleInlineLearnSaveRequest } from "./inline-learn-route.ts";
import { handleSessionGraphRequest } from "./session-graph-route.ts";
import { handleSessionMovesRequest } from "./session-moves-route.ts";
import { handleBrainStreamRequest } from "./stream-route.ts";
import { handleVerifyConfidenceRequest, handleVerifyRequest } from "./verify-route.ts";
import { handleSessionWikiRequest } from "./wiki-route.ts";

const port = parsePort(process.env.PORT);
const publicDir = fileURLToPath(new URL("../public", import.meta.url));

const server = createServer(async (incoming, outgoing) => {
  try {
    const request = await toWebRequest(incoming);
    const url = new URL(request.url);

    if (url.pathname === "/brain/seed") {
      await writeWebResponse(outgoing, await handleBrainSeedRequest(request));
      return;
    }

    if (url.pathname === "/brain/stream") {
      await writeWebResponse(outgoing, await handleBrainStreamRequest(request));
      return;
    }

    if (url.pathname === "/brain/challenge") {
      await writeWebResponse(outgoing, await handleChallengeRequest(request));
      return;
    }

    if (url.pathname === "/brain/challenge/respond") {
      await writeWebResponse(outgoing, await handleChallengeRespondRequest(request));
      return;
    }

    if (url.pathname === "/brain/verify") {
      await writeWebResponse(outgoing, await handleVerifyRequest(request));
      return;
    }

    if (url.pathname === "/brain/verify/confidence") {
      await writeWebResponse(outgoing, await handleVerifyConfidenceRequest(request));
      return;
    }

    if (url.pathname === "/brain/artifact") {
      await writeWebResponse(outgoing, await handleArtifactRequest(request));
      return;
    }

    const sessionArtifactMatch = /^\/brain\/session\/([^/]+)\/artifact$/.exec(url.pathname);

    if (sessionArtifactMatch) {
      const sessionId = sessionArtifactMatch[1];

      if (!sessionId) {
        await writeWebResponse(
          outgoing,
          new Response(
            JSON.stringify({
              error: {
                code: "invalid_session_id",
                message: "Artifact generation requires a session id.",
              },
            }),
            {
              status: 400,
              headers: {
                "content-type": "application/json; charset=utf-8",
              },
            },
          ),
        );
        return;
      }

      await writeWebResponse(outgoing, await handleSessionArtifactRequest(request, decodeURIComponent(sessionId)));
      return;
    }

    const sessionWikiMatch = /^\/brain\/session\/([^/]+)\/wiki$/.exec(url.pathname);

    if (sessionWikiMatch) {
      const sessionId = sessionWikiMatch[1];

      if (!sessionId) {
        await writeWebResponse(
          outgoing,
          new Response(
            JSON.stringify({
              error: {
                code: "invalid_session_id",
                message: "Wiki compilation requires a session id.",
              },
            }),
            {
              status: 400,
              headers: {
                "content-type": "application/json; charset=utf-8",
              },
            },
          ),
        );
        return;
      }

      await writeWebResponse(outgoing, await handleSessionWikiRequest(request, decodeURIComponent(sessionId)));
      return;
    }

    const sessionMovesMatch = /^\/brain\/session\/([^/]+)\/moves$/.exec(url.pathname);

    if (sessionMovesMatch) {
      const sessionId = sessionMovesMatch[1];

      if (!sessionId) {
        await writeWebResponse(
          outgoing,
          new Response(
            JSON.stringify({
              error: {
                code: "invalid_session_id",
                message: "Session moves require a session id.",
              },
            }),
            {
              status: 400,
              headers: {
                "content-type": "application/json; charset=utf-8",
              },
            },
          ),
        );
        return;
      }

      await writeWebResponse(outgoing, await handleSessionMovesRequest(request, decodeURIComponent(sessionId)));
      return;
    }

    const sessionGraphMatch = /^\/brain\/session\/([^/]+)\/graph$/.exec(url.pathname);

    if (sessionGraphMatch) {
      const sessionId = sessionGraphMatch[1];

      if (!sessionId) {
        await writeWebResponse(
          outgoing,
          new Response(
            JSON.stringify({
              error: {
                code: "invalid_session_id",
                message: "Session graph requires a session id.",
              },
            }),
            {
              status: 400,
              headers: {
                "content-type": "application/json; charset=utf-8",
              },
            },
          ),
        );
        return;
      }

      await writeWebResponse(outgoing, await handleSessionGraphRequest(request, decodeURIComponent(sessionId)));
      return;
    }

    if (url.pathname === "/brain/learn/inline") {
      await writeWebResponse(outgoing, await handleInlineLearnRequest(request));
      return;
    }

    if (url.pathname === "/brain/learn/inline/save") {
      await writeWebResponse(outgoing, await handleInlineLearnSaveRequest(request));
      return;
    }

    const claimDetailMatch = /^\/brain\/claims\/([^/]+)\/detail$/.exec(url.pathname);

    if (claimDetailMatch) {
      const claimId = claimDetailMatch[1];

      if (!claimId) {
        await writeWebResponse(
          outgoing,
          new Response(
            JSON.stringify({
              error: {
                code: "invalid_claim_id",
                message: "Claim detail requires a claim id.",
              },
            }),
            {
              status: 400,
              headers: {
                "content-type": "application/json; charset=utf-8",
              },
            },
          ),
        );
        return;
      }

      await writeWebResponse(outgoing, await handleClaimDetailRequest(request, decodeURIComponent(claimId)));
      return;
    }

    const assumptionResponseMatch = /^\/brain\/assumptions\/([^/]+)\/respond$/.exec(url.pathname);

    if (assumptionResponseMatch) {
      const assumptionClaimId = assumptionResponseMatch[1];

      if (!assumptionClaimId) {
        await writeWebResponse(
          outgoing,
          new Response(
            JSON.stringify({
              error: {
                code: "invalid_claim_id",
                message: "Assumption response requires a claim id.",
              },
            }),
            {
              status: 400,
              headers: {
                "content-type": "application/json; charset=utf-8",
              },
            },
          ),
        );
        return;
      }

      await writeWebResponse(
        outgoing,
        await handleAssumptionResponseRequest(request, decodeURIComponent(assumptionClaimId)),
      );
      return;
    }

    const staticResponse = await readStaticAsset(url.pathname);

    if (staticResponse) {
      await writeWebResponse(outgoing, staticResponse);
      return;
    }

    await writeWebResponse(
      outgoing,
      new Response(
        JSON.stringify({
          error: {
            code: "not_found",
            message: "Route not found.",
          },
        }),
        {
          status: 404,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        },
      ),
    );
    return;
  } catch (error) {
    await writeWebResponse(
      outgoing,
      new Response(
        JSON.stringify({
          error: {
            code: "internal_error",
            message: error instanceof Error ? error.message : String(error),
          },
        }),
        {
          status: 500,
          headers: {
            "content-type": "application/json; charset=utf-8",
          },
        },
      ),
    );
  }
});

server.listen(port, () => {
  console.log(`Penny cockpit listening on http://localhost:${port}`);
});

function parsePort(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "3000", 10);

  if (Number.isInteger(parsed) && parsed > 0 && parsed < 65_536) {
    return parsed;
  }

  return 3000;
}

async function toWebRequest(incoming: IncomingMessage): Promise<Request> {
  const headers = new Headers();

  for (const [name, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
      continue;
    }

    if (value !== undefined) {
      headers.set(name, value);
    }
  }

  const body = await readBody(incoming);
  const host = headers.get("host") ?? "localhost";
  const url = new URL(incoming.url ?? "/", `http://${host}`);
  const requestInit: RequestInit = {
    method: incoming.method ?? "GET",
    headers,
  };

  if (body.length > 0) {
    requestInit.body = new Uint8Array(body);
  }

  return new Request(url, requestInit);
}

function readBody(incoming: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    incoming.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    incoming.on("error", reject);
    incoming.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
  });
}

async function writeWebResponse(outgoing: ServerResponse, response: Response): Promise<void> {
  outgoing.statusCode = response.status;
  response.headers.forEach((value, key) => {
    outgoing.setHeader(key, value);
  });

  outgoing.end(Buffer.from(await response.arrayBuffer()));
}

async function readStaticAsset(pathname: string): Promise<Response | null> {
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;

  if (normalizedPath.includes("..")) {
    return null;
  }

  try {
    const body = await readFile(join(publicDir, normalizedPath));

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": contentTypeFor(normalizedPath),
      },
    });
  } catch {
    return null;
  }
}

function contentTypeFor(pathname: string): string {
  switch (extname(pathname)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
