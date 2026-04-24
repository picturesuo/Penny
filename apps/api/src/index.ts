import cors from "@fastify/cors";
import Fastify from "fastify";
import { pathToFileURL } from "node:url";
import type { HealthResponse } from "@penny/shared";

export async function buildServer() {
  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: true,
  });

  app.get("/health", async (): Promise<HealthResponse> => {
    return {
      ok: true,
      service: "penny-api",
    };
  });

  return app;
}

async function start() {
  const app = await buildServer();
  const host = process.env.API_HOST ?? "0.0.0.0";
  const port = Number(process.env.API_PORT ?? "3001");

  await app.listen({ host, port });
}

const isMain = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;

if (isMain) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
