import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createPennyDb } from "./db/client.ts";
import { handleBrainSeedRequest } from "./brain-seed-route.ts";

const port = parsePort(process.env.PORT);
const db = createPennyDb();

const server = createServer(async (incoming, outgoing) => {
  try {
    const request = await toWebRequest(incoming);
    const url = new URL(request.url);

    if (url.pathname !== "/brain/seed") {
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
    }

    await writeWebResponse(outgoing, await handleBrainSeedRequest(request, { db }));
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
  console.log(`Penny API listening on http://localhost:${port}`);
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
