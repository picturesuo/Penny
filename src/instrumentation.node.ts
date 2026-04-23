import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";

declare global {
  var __pennyLangfuseNodeSdk: NodeSDK | undefined;
  var __pennyLangfuseNodeSdkStarted: boolean | undefined;
}

function isLangfuseTracingConfigured() {
  return Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);
}

export async function startLangfuseNodeSdk() {
  if (!isLangfuseTracingConfigured()) {
    return;
  }

  if (globalThis.__pennyLangfuseNodeSdkStarted) {
    return;
  }

  const sdk = new NodeSDK({
    spanProcessors: [new LangfuseSpanProcessor()],
  });

  await Promise.resolve(sdk.start());

  globalThis.__pennyLangfuseNodeSdk = sdk;
  globalThis.__pennyLangfuseNodeSdkStarted = true;
}
