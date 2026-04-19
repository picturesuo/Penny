import type { Instrumentation } from "next";
import { reportError, getRequestUserId, normalizeError } from "@/lib/error-reporting";

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const normalizedError = normalizeError(error);

  reportError(normalizedError, {
    userId: getRequestUserId({ path: request.path, headers: request.headers }),
    requestPath: request.path,
    requestMethod: request.method,
    featureId: context.routePath,
    additionalData: {
      routerKind: context.routerKind,
      routeType: context.routeType,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason ?? null,
      digest: (error as Error & { digest?: string }).digest ?? null,
    },
  });
};
