import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { handleArtifactRequest, handleSessionArtifactRequest } from "./artifact-route.ts";
import { handleAssumptionResponseRequest } from "./assumption-response-route.ts";
import { handleAutopilotTickRequest, handleManualNodeSelectedRequest } from "./autopilot-route.ts";
import { handleBrainDocumentsRequest } from "./brain-documents-route.ts";
import {
  handleBrainDemoFixtureRequest,
  handleBrainImportJobRequest,
  handleBrainImportRequest,
  handleBrainMemoryProfileRequest,
  handleBrainMemoryReviewRequest,
  handleBrainRetrieveRequest,
  handleBrainSourceDeleteRequest,
} from "./brain-memory-route.ts";
import {
  handleBrainRecentRequest,
  handleBrainObjectsRequest,
  handleBrainRecentsRequest,
  handleSaveBrainObjectRequest,
  handleSessionNotesRequest,
} from "./brain-objects-route.ts";
import { handleBrainSearchRequest } from "./brain-search-route.ts";
import { handleBrainSeedRequest } from "./brain-seed-route.ts";
import { handleChallengeRequest, handleChallengeRespondRequest } from "./challenge-route.ts";
import {
  handleCodebaseAuditRequest,
  handleCodebaseContextRequest,
  handleCodebaseIngestRequest,
  handleCodebaseScanRequest,
  handleCodebaseSearchRequest,
} from "./codebase-route.ts";
import { handleChallengeBriefRequest } from "./routes/challenge-brief-routes.ts";
import { handleClaimDetailRequest } from "./claim-detail-route.ts";
import {
  handleCreateCompareRequest,
  handleCreateExportFeedbackRequest,
  handleCreateNextRequest,
  handleExportCodingPromptRequest,
} from "./create-route.ts";
import {
  handleContextArtifactsRequest,
  handleContextConnectorConnectRequest,
  handleContextConnectorFetchRequest,
  handleContextConnectorRefreshRequest,
  handleContextConnectorRevokeRequest,
  handleContextConnectorSyncRequest,
  handleContextConsentRequest,
  handleContextDashboardRequest,
  handleContextImportRequest,
  handleContextMemoryCorrectRequest,
  handleContextMemoryDeleteRequest,
  handleContextMemoryReviewRequest,
  handleContextOAuthCallbackRequest,
  handleContextOAuthStartRequest,
  handleContextRetrievalRequest,
  handleContextTrainingConsentDeleteRequest,
} from "./context-layer-route.ts";
import { createPennySql, type PennySqlClient } from "./db/client.ts";
import * as schema from "./db/schema.ts";
import {
  handleGoogleConnectorCallbackRequest,
  handleGoogleConnectorConnectSessionRequest,
  handleGoogleConnectorCredentialsRequest,
  handleGoogleConnectorListConnectionsRequest,
  handleGoogleConnectorNangoWebhookRequest,
  handleGoogleConnectorProviderRequest,
  handleGoogleConnectorRefreshRequest,
  handleGoogleConnectorRevokeRequest,
  handleGoogleConnectorSourceDeleteRequest,
  handleGoogleConnectorSyncCompleteRequest,
  handleGoogleConnectorSyncNowRequest,
  handleGoogleConnectorSyncStatusRequest,
} from "./google-connector-route.ts";
import {
  handleGoogleGmailConnectRequest,
  handleGoogleGmailRevokeRequest,
  handleGoogleGmailSearchRequest,
  handleGoogleGmailSemanticSearchRequest,
  handleGoogleGmailStatusRequest,
  handleGoogleGmailSyncRequest,
} from "./gmail-connector-route.ts";
import { handleAskPennyRequest, handleInlineLearnRequest, handleInlineLearnSaveRequest } from "./inline-learn-route.ts";
import { handleLearnSessionRequest } from "./learn-session-route.ts";
import { emitPennyLog } from "./observability.ts";
import { handleSessionCanvasRequest } from "./session-canvas-route.ts";
import { handleSessionGraphRequest } from "./session-graph-route.ts";
import { handleSessionMovesRequest } from "./session-moves-route.ts";
import {
  handleSessionAutopilotStateRequest,
  handleSessionAutopilotTickRequest,
  handleSessionCockpitRequest,
  handleSessionManualFocusRequest,
  handleSessionStartNextMoveCandidateRequest,
} from "./routes/session-cockpit-routes.ts";
import { handleBrainStreamRequest } from "./stream-route.ts";
import {
  handleChallengeRoundRespondRequest,
  handleIssueChallengeFromCandidateRequest,
  handleManualFocusRequest,
  handleSessionIssueChallengeFromCandidateRequest,
  handleStartNextMoveCandidateRequest,
  handleThinkingModeStateRequest,
  handleThinkingModeTickRequest,
} from "./routes/thinking-mode-routes.ts";
import { handleVerifyConfidenceRequest, handleVerifyRequest } from "./verify-route.ts";
import { handleSessionWikiRequest } from "./wiki-route.ts";

export type AuthMode = "dev" | "token";

export type ServerScope = {
  userId: string;
  workspaceId: string;
  projectId: string;
  sphereId: string;
};

export type ApiAuthResult = {
  identityKey: string;
  mode: AuthMode;
  scope: ServerScope;
};

export type ApiGuardResult = {
  request: Request;
  headers: Headers;
  response?: Response;
};

export type RateLimitResult = {
  allowed: boolean;
  headers: Headers;
  retryAfterSeconds?: number;
};

export type PennyDeployTarget = "local" | "development" | "staging" | "production" | "private-alpha";

export type PennyEnvironmentValidationIssue = {
  code: string;
  message: string;
};

export type PennyEnvironmentValidationResult = {
  deployTarget: PennyDeployTarget;
  strict: boolean;
  issues: PennyEnvironmentValidationIssue[];
  warnings: PennyEnvironmentValidationIssue[];
};

type PennySchemaTableRow = {
  table_name: string;
};

export const requiredPennySchemaTables = [
  "sessions",
  "sources",
  "claims",
  "claim_versions",
  "claim_edges",
  "source_spans",
  "moves",
  "brain_runs",
  "artifacts",
  "brain_memory_sources",
  "brain_memory_source_chunks",
  "brain_memory_nodes",
  "brain_memory_edges",
  "brain_memory_profile_signals",
  "brain_memory_ingestion_jobs",
  "brain_memory_retrieval_events",
  "create_export_feedback",
  "connector_connections",
  "connector_sync_cursors",
  "connector_sync_runs",
  "connector_source_refs",
  "connector_permission_audits",
  "command_idempotency_keys",
  "codebase_scan_runs",
  "code_files",
  "code_chunks",
  "code_symbols",
  "code_imports",
  "code_routes",
  "code_tests",
  "code_docs",
  "code_findings",
  "code_memory_notes",
] as const;

loadPennyEnv();

const port = parsePort(process.env.PORT);
const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const migrationsDir = fileURLToPath(new URL("../../../drizzle", import.meta.url));
const apiRateLimiter = createApiRateLimiter();
const authFailureRateLimiter = createKeyedRateLimiter({
  maxEnv: "PENNY_AUTH_FAILURE_RATE_LIMIT_MAX",
  windowEnv: "PENNY_AUTH_FAILURE_RATE_LIMIT_WINDOW_MS",
  fallbackMax: 20,
  fallbackWindowMs: 60_000,
});
const sessionCookieName = "__Host-penny_session";

export function createPennyServer(): ReturnType<typeof createServer> {
  return createServer(async (incoming, outgoing) => {
    try {
      let request = await toWebRequest(incoming);
      const url = new URL(request.url);

      if (url.pathname === "/penny/login") {
        await writeWebResponse(outgoing, await handleLoginRequest(request));
        return;
      }

      if (url.pathname === "/penny/logout") {
        await writeWebResponse(outgoing, logoutResponse());
        return;
      }

      const guard = guardApiRequest(request, url);

      applyResponseHeaders(outgoing, guard.headers);

      if (guard.response) {
        await writeWebResponse(outgoing, guard.response);
        return;
      }

      request = guard.request;

    if (url.pathname === "/brain/seed") {
      await writeWebResponse(outgoing, await handleBrainSeedRequest(request));
      return;
    }

    if (url.pathname === "/api/context/dashboard") {
      await writeWebResponse(outgoing, await handleContextDashboardRequest(request));
      return;
    }

    if (url.pathname === "/api/context/artifacts") {
      await writeWebResponse(outgoing, await handleContextArtifactsRequest(request));
      return;
    }

    if (url.pathname === "/api/context/import") {
      await writeWebResponse(outgoing, await handleContextImportRequest(request));
      return;
    }

    if (url.pathname === "/api/context/connectors") {
      await writeWebResponse(outgoing, await handleContextConnectorConnectRequest(request));
      return;
    }

    if (url.pathname === "/api/context/oauth/start") {
      await writeWebResponse(outgoing, await handleContextOAuthStartRequest(request));
      return;
    }

    if (url.pathname === "/api/context/oauth/callback") {
      await writeWebResponse(outgoing, await handleContextOAuthCallbackRequest(request));
      return;
    }

    if (url.pathname === "/api/context/consent") {
      await writeWebResponse(outgoing, await handleContextConsentRequest(request));
      return;
    }

    if (url.pathname === "/api/context/training-consent") {
      await writeWebResponse(outgoing, await handleContextTrainingConsentDeleteRequest(request));
      return;
    }

    if (url.pathname === "/api/context/retrieve") {
      await writeWebResponse(outgoing, await handleContextRetrievalRequest(request));
      return;
    }

    if (url.pathname === "/api/connectors/google") {
      await writeWebResponse(outgoing, await handleGoogleConnectorProviderRequest(request));
      return;
    }

    if (url.pathname === "/api/connectors/google/connect-session") {
      await writeWebResponse(outgoing, await handleGoogleConnectorConnectSessionRequest(request));
      return;
    }

    if (url.pathname === "/api/connectors/google/callback") {
      await writeWebResponse(outgoing, await handleGoogleConnectorCallbackRequest(request));
      return;
    }

    if (url.pathname === "/api/connectors/google/nango-webhook") {
      await writeWebResponse(outgoing, await handleGoogleConnectorNangoWebhookRequest(request));
      return;
    }

    if (url.pathname === "/api/connectors/google/connections") {
      await writeWebResponse(outgoing, await handleGoogleConnectorListConnectionsRequest(request));
      return;
    }

    if (url.pathname === "/api/connectors/google/credentials") {
      await writeWebResponse(outgoing, await handleGoogleConnectorCredentialsRequest(request));
      return;
    }

    if (url.pathname === "/api/connectors/google/sync-now") {
      await writeWebResponse(outgoing, await handleGoogleConnectorSyncNowRequest(request));
      return;
    }

    if (url.pathname === "/api/connectors/google/sync-complete") {
      await writeWebResponse(outgoing, await handleGoogleConnectorSyncCompleteRequest(request));
      return;
    }

    if (url.pathname === "/api/connectors/google/source-delete") {
      await writeWebResponse(outgoing, await handleGoogleConnectorSourceDeleteRequest(request));
      return;
    }

    if (url.pathname === "/api/connectors/google/sync-status") {
      await writeWebResponse(outgoing, await handleGoogleConnectorSyncStatusRequest(request));
      return;
    }

    if (url.pathname === "/api/connectors/google/refresh") {
      await writeWebResponse(outgoing, await handleGoogleConnectorRefreshRequest(request));
      return;
    }

    if (url.pathname === "/api/connectors/google/revoke") {
      await writeWebResponse(outgoing, await handleGoogleConnectorRevokeRequest(request));
      return;
    }

    if (url.pathname === "/api/connectors/google/gmail/connect") {
      await writeWebResponse(outgoing, await handleGoogleGmailConnectRequest(request));
      return;
    }

    if (url.pathname === "/api/connectors/google/gmail/status") {
      await writeWebResponse(outgoing, await handleGoogleGmailStatusRequest(request));
      return;
    }

    if (url.pathname === "/api/connectors/google/gmail/sync") {
      await writeWebResponse(outgoing, await handleGoogleGmailSyncRequest(request));
      return;
    }

    if (url.pathname === "/api/connectors/google/gmail/search") {
      await writeWebResponse(outgoing, await handleGoogleGmailSearchRequest(request));
      return;
    }

    if (url.pathname === "/api/connectors/google/gmail/semantic-search") {
      await writeWebResponse(outgoing, await handleGoogleGmailSemanticSearchRequest(request));
      return;
    }

    if (url.pathname === "/api/connectors/google/gmail/revoke") {
      await writeWebResponse(outgoing, await handleGoogleGmailRevokeRequest(request));
      return;
    }

    const contextConnectorSyncMatch = /^\/api\/context\/connectors\/([^/]+)\/sync$/.exec(url.pathname);

    if (contextConnectorSyncMatch) {
      await writeWebResponse(
        outgoing,
        await handleContextConnectorSyncRequest(request, decodeURIComponent(contextConnectorSyncMatch[1] ?? "")),
      );
      return;
    }

    const contextConnectorFetchMatch = /^\/api\/context\/connectors\/([^/]+)\/fetch$/.exec(url.pathname);

    if (contextConnectorFetchMatch) {
      await writeWebResponse(
        outgoing,
        await handleContextConnectorFetchRequest(request, decodeURIComponent(contextConnectorFetchMatch[1] ?? "")),
      );
      return;
    }

    const contextConnectorRefreshMatch = /^\/api\/context\/connectors\/([^/]+)\/refresh$/.exec(url.pathname);

    if (contextConnectorRefreshMatch) {
      await writeWebResponse(
        outgoing,
        await handleContextConnectorRefreshRequest(request, decodeURIComponent(contextConnectorRefreshMatch[1] ?? "")),
      );
      return;
    }

    const contextMemoryReviewMatch = /^\/api\/context\/memories\/([^/]+)\/review$/.exec(url.pathname);

    if (contextMemoryReviewMatch) {
      await writeWebResponse(
        outgoing,
        await handleContextMemoryReviewRequest(request, decodeURIComponent(contextMemoryReviewMatch[1] ?? "")),
      );
      return;
    }

    const contextMemoryCorrectMatch = /^\/api\/context\/memories\/([^/]+)\/correct$/.exec(url.pathname);

    if (contextMemoryCorrectMatch) {
      await writeWebResponse(
        outgoing,
        await handleContextMemoryCorrectRequest(request, decodeURIComponent(contextMemoryCorrectMatch[1] ?? "")),
      );
      return;
    }

    const contextMemoryDeleteMatch = /^\/api\/context\/memories\/([^/]+)$/.exec(url.pathname);

    if (contextMemoryDeleteMatch) {
      await writeWebResponse(
        outgoing,
        await handleContextMemoryDeleteRequest(request, decodeURIComponent(contextMemoryDeleteMatch[1] ?? "")),
      );
      return;
    }

    const contextConnectorRevokeMatch = /^\/api\/context\/connectors\/([^/]+)\/revoke$/.exec(url.pathname);

    if (contextConnectorRevokeMatch) {
      await writeWebResponse(
        outgoing,
        await handleContextConnectorRevokeRequest(request, decodeURIComponent(contextConnectorRevokeMatch[1] ?? "")),
      );
      return;
    }

    if (url.pathname === "/api/brain/documents") {
      await writeWebResponse(outgoing, await handleBrainDocumentsRequest(request));
      return;
    }

    if (url.pathname === "/api/brain/import") {
      await writeWebResponse(outgoing, await handleBrainImportRequest(request));
      return;
    }

    if (url.pathname === "/api/brain/demo-fixture/penny") {
      await writeWebResponse(outgoing, await handleBrainDemoFixtureRequest(request));
      return;
    }

    const brainImportJobMatch = /^\/api\/brain\/import\/([^/]+)$/.exec(url.pathname);

    if (brainImportJobMatch) {
      await writeWebResponse(outgoing, await handleBrainImportJobRequest(request, decodeURIComponent(brainImportJobMatch[1] ?? "")));
      return;
    }

    if (url.pathname === "/api/brain/memory/profile") {
      await writeWebResponse(outgoing, await handleBrainMemoryProfileRequest(request));
      return;
    }

    if (url.pathname === "/api/brain/retrieve") {
      await writeWebResponse(outgoing, await handleBrainRetrieveRequest(request));
      return;
    }

    const brainMemoryReviewMatch = /^\/api\/brain\/memories\/([^/]+)\/review$/.exec(url.pathname);

    if (brainMemoryReviewMatch) {
      await writeWebResponse(outgoing, await handleBrainMemoryReviewRequest(request, decodeURIComponent(brainMemoryReviewMatch[1] ?? "")));
      return;
    }

    const brainSourceDeleteMatch = /^\/api\/brain\/sources\/([^/]+)$/.exec(url.pathname);

    if (brainSourceDeleteMatch) {
      await writeWebResponse(outgoing, await handleBrainSourceDeleteRequest(request, decodeURIComponent(brainSourceDeleteMatch[1] ?? "")));
      return;
    }

    if (url.pathname === "/api/brain/objects") {
      await writeWebResponse(outgoing, await handleBrainObjectsRequest(request));
      return;
    }

    if (url.pathname === "/api/brain/objects/save") {
      await writeWebResponse(outgoing, await handleSaveBrainObjectRequest(request));
      return;
    }

    if (url.pathname === "/api/brain/recents") {
      await writeWebResponse(outgoing, await handleBrainRecentsRequest(request));
      return;
    }

    const brainRecentMatch = /^\/api\/brain\/recents\/([^/]+)$/.exec(url.pathname);
    if (brainRecentMatch) {
      await writeWebResponse(outgoing, await handleBrainRecentRequest(request, decodeURIComponent(brainRecentMatch[1] ?? "")));
      return;
    }

    if (url.pathname === "/api/brain/search") {
      await writeWebResponse(outgoing, await handleBrainSearchRequest(request));
      return;
    }

    if (url.pathname === "/api/codebase/ingest") {
      await writeWebResponse(outgoing, await handleCodebaseIngestRequest(request));
      return;
    }

    if (url.pathname === "/api/codebase/search") {
      await writeWebResponse(outgoing, await handleCodebaseSearchRequest(request));
      return;
    }

    if (url.pathname === "/api/codebase/context") {
      await writeWebResponse(outgoing, await handleCodebaseContextRequest(request));
      return;
    }

    if (url.pathname === "/api/codebase/audit") {
      await writeWebResponse(outgoing, await handleCodebaseAuditRequest(request));
      return;
    }

    const codebaseScanMatch = /^\/api\/codebase\/scan\/([^/]+)$/.exec(url.pathname);

    if (codebaseScanMatch) {
      await writeWebResponse(outgoing, await handleCodebaseScanRequest(request, decodeURIComponent(codebaseScanMatch[1] ?? "")));
      return;
    }

    if (url.pathname === "/api/learn/session") {
      await writeWebResponse(outgoing, await handleLearnSessionRequest(request));
      return;
    }

    if (url.pathname === "/api/create/next") {
      await writeWebResponse(outgoing, await handleCreateNextRequest(request));
      return;
    }

    if (url.pathname === "/api/create/compare") {
      await writeWebResponse(outgoing, await handleCreateCompareRequest(request));
      return;
    }

    if (url.pathname === "/api/create/export-coding-prompt") {
      await writeWebResponse(outgoing, await handleExportCodingPromptRequest(request));
      return;
    }

    if (url.pathname === "/api/create/export-feedback") {
      await writeWebResponse(outgoing, await handleCreateExportFeedbackRequest(request));
      return;
    }

    if (url.pathname === "/autopilot/tick") {
      await writeWebResponse(outgoing, await handleAutopilotTickRequest(request));
      return;
    }

    if (url.pathname === "/autopilot/select-node") {
      await writeWebResponse(outgoing, await handleManualNodeSelectedRequest(request));
      return;
    }

    const thinkingModeStateMatch = /^\/api\/brains\/([^/]+)\/autopilot\/state$/.exec(url.pathname);

    if (thinkingModeStateMatch) {
      const brainId = thinkingModeStateMatch[1];

      if (!brainId) {
        await writeWebResponse(outgoing, invalidPathResponse("invalid_brain_id", "Autopilot state requires a brain id."));
        return;
      }

      await writeWebResponse(outgoing, await handleThinkingModeStateRequest(request, decodeURIComponent(brainId)));
      return;
    }

    const thinkingModeTickMatch = /^\/api\/brains\/([^/]+)\/autopilot\/tick$/.exec(url.pathname);

    if (thinkingModeTickMatch) {
      const brainId = thinkingModeTickMatch[1];

      if (!brainId) {
        await writeWebResponse(outgoing, invalidPathResponse("invalid_brain_id", "Autopilot tick requires a brain id."));
        return;
      }

      await writeWebResponse(outgoing, await handleThinkingModeTickRequest(request, decodeURIComponent(brainId)));
      return;
    }

    const startNextMoveCandidateMatch = /^\/api\/next-move-candidates\/([^/]+)\/start$/.exec(url.pathname);

    if (startNextMoveCandidateMatch) {
      const candidateId = startNextMoveCandidateMatch[1];

      if (!candidateId) {
        await writeWebResponse(
          outgoing,
          invalidPathResponse("invalid_candidate_id", "Starting a next move requires a candidate id."),
        );
        return;
      }

      await writeWebResponse(outgoing, await handleStartNextMoveCandidateRequest(request, decodeURIComponent(candidateId)));
      return;
    }

    const challengeNextMoveCandidateMatch = /^\/api\/next-move-candidates\/([^/]+)\/challenge$/.exec(url.pathname);

    if (challengeNextMoveCandidateMatch) {
      const candidateId = challengeNextMoveCandidateMatch[1];

      if (!candidateId) {
        await writeWebResponse(
          outgoing,
          invalidPathResponse("invalid_candidate_id", "Issuing a challenge requires a candidate id."),
        );
        return;
      }

      await writeWebResponse(
        outgoing,
        await handleIssueChallengeFromCandidateRequest(request, decodeURIComponent(candidateId)),
      );
      return;
    }

    const manualFocusMatch = /^\/api\/brains\/([^/]+)\/focus\/manual$/.exec(url.pathname);

    if (manualFocusMatch) {
      const brainId = manualFocusMatch[1];

      if (!brainId) {
        await writeWebResponse(outgoing, invalidPathResponse("invalid_brain_id", "Manual focus requires a brain id."));
        return;
      }

      await writeWebResponse(outgoing, await handleManualFocusRequest(request, decodeURIComponent(brainId)));
      return;
    }

    const challengeRoundRespondMatch = /^\/api\/challenges\/([^/]+)\/respond$/.exec(url.pathname);

    if (challengeRoundRespondMatch) {
      const challengeId = challengeRoundRespondMatch[1];

      if (!challengeId) {
        await writeWebResponse(
          outgoing,
          invalidPathResponse("invalid_challenge_id", "Challenge response requires a challenge id."),
        );
        return;
      }

      await writeWebResponse(outgoing, await handleChallengeRoundRespondRequest(request, decodeURIComponent(challengeId)));
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

    const sessionCanvasMatch = /^\/api\/sessions\/([^/]+)\/canvas$/.exec(url.pathname);

    if (sessionCanvasMatch) {
      const sessionId = sessionCanvasMatch[1];

      if (!sessionId) {
        await writeWebResponse(outgoing, invalidPathResponse("invalid_session_id", "Session canvas requires a session id."));
        return;
      }

      await writeWebResponse(outgoing, await handleSessionCanvasRequest(request, decodeURIComponent(sessionId)));
      return;
    }

    const sessionCockpitMatch = /^\/api\/sessions\/([^/]+)\/cockpit$/.exec(url.pathname);

    if (sessionCockpitMatch) {
      const sessionId = sessionCockpitMatch[1];

      if (!sessionId) {
        await writeWebResponse(
          outgoing,
          invalidPathResponse("invalid_session_id", "Session cockpit requires a session id."),
        );
        return;
      }

      await writeWebResponse(outgoing, await handleSessionCockpitRequest(request, decodeURIComponent(sessionId)));
      return;
    }

    const sessionNotesMatch = /^\/api\/sessions\/([^/]+)\/notes$/.exec(url.pathname);

    if (sessionNotesMatch) {
      const sessionId = sessionNotesMatch[1];

      if (!sessionId) {
        await writeWebResponse(outgoing, invalidPathResponse("invalid_session_id", "Session notes require a session id."));
        return;
      }

      await writeWebResponse(outgoing, await handleSessionNotesRequest(request, decodeURIComponent(sessionId)));
      return;
    }

    const sessionAutopilotStateMatch = /^\/api\/sessions\/([^/]+)\/autopilot\/state$/.exec(url.pathname);

    if (sessionAutopilotStateMatch) {
      const sessionId = sessionAutopilotStateMatch[1];

      if (!sessionId) {
        await writeWebResponse(
          outgoing,
          invalidPathResponse("invalid_session_id", "Session Autopilot state requires a session id."),
        );
        return;
      }

      await writeWebResponse(outgoing, await handleSessionAutopilotStateRequest(request, decodeURIComponent(sessionId)));
      return;
    }

    const sessionAutopilotTickMatch = /^\/api\/sessions\/([^/]+)\/autopilot\/tick$/.exec(url.pathname);

    if (sessionAutopilotTickMatch) {
      const sessionId = sessionAutopilotTickMatch[1];

      if (!sessionId) {
        await writeWebResponse(
          outgoing,
          invalidPathResponse("invalid_session_id", "Session Autopilot tick requires a session id."),
        );
        return;
      }

      await writeWebResponse(outgoing, await handleSessionAutopilotTickRequest(request, decodeURIComponent(sessionId)));
      return;
    }

    const sessionStartNextMoveMatch = /^\/api\/sessions\/([^/]+)\/next-move-candidates\/([^/]+)\/start$/.exec(
      url.pathname,
    );

    if (sessionStartNextMoveMatch) {
      const sessionId = sessionStartNextMoveMatch[1];
      const candidateId = sessionStartNextMoveMatch[2];

      if (!sessionId || !candidateId) {
        await writeWebResponse(
          outgoing,
          invalidPathResponse("invalid_candidate_id", "Starting a session next move requires session and candidate ids."),
        );
        return;
      }

      await writeWebResponse(
        outgoing,
        await handleSessionStartNextMoveCandidateRequest(
          request,
          decodeURIComponent(sessionId),
          decodeURIComponent(candidateId),
        ),
      );
      return;
    }

    const sessionChallengeNextMoveMatch = /^\/api\/sessions\/([^/]+)\/next-move-candidates\/([^/]+)\/challenge$/.exec(
      url.pathname,
    );

    if (sessionChallengeNextMoveMatch) {
      const sessionId = sessionChallengeNextMoveMatch[1];
      const candidateId = sessionChallengeNextMoveMatch[2];

      if (!sessionId || !candidateId) {
        await writeWebResponse(
          outgoing,
          invalidPathResponse("invalid_candidate_id", "Issuing a session challenge requires session and candidate ids."),
        );
        return;
      }

      await writeWebResponse(
        outgoing,
        await handleSessionIssueChallengeFromCandidateRequest(
          request,
          decodeURIComponent(sessionId),
          decodeURIComponent(candidateId),
        ),
      );
      return;
    }

    const sessionManualFocusMatch = /^\/api\/sessions\/([^/]+)\/focus\/manual$/.exec(url.pathname);

    if (sessionManualFocusMatch) {
      const sessionId = sessionManualFocusMatch[1];

      if (!sessionId) {
        await writeWebResponse(
          outgoing,
          invalidPathResponse("invalid_session_id", "Session manual focus requires a session id."),
        );
        return;
      }

      await writeWebResponse(outgoing, await handleSessionManualFocusRequest(request, decodeURIComponent(sessionId)));
      return;
    }

    const apiChallengeBriefMatch = /^\/api\/sessions\/([^/]+)\/challenge-brief$/.exec(url.pathname);

    if (apiChallengeBriefMatch) {
      const sessionId = apiChallengeBriefMatch[1];

      if (!sessionId) {
        await writeWebResponse(
          outgoing,
          invalidPathResponse("invalid_session_id", "Challenge Brief generation requires a session id."),
        );
        return;
      }

      await writeWebResponse(outgoing, await handleChallengeBriefRequest(request, decodeURIComponent(sessionId)));
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

    if (url.pathname === "/brain/learn/ask") {
      await writeWebResponse(outgoing, await handleAskPennyRequest(request));
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

    if (requiresFrontendSession(request, url)) {
      await writeWebResponse(outgoing, loginPageResponse());
      return;
    }

    const staticResponse = await readStaticAsset(url.pathname, request.method);

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
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];

  return !!entrypoint && fileURLToPath(import.meta.url) === entrypoint;
}

function parsePort(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "3000", 10);

  if (Number.isInteger(parsed) && parsed > 0 && parsed < 65_536) {
    return parsed;
  }

  return 3000;
}

export class PennyEnvironmentValidationError extends Error {
  readonly issues: PennyEnvironmentValidationIssue[];

  constructor(result: PennyEnvironmentValidationResult) {
    super(`Unsafe Penny startup configuration: ${result.issues.map((issue) => issue.message).join(" ")}`);
    this.name = "PennyEnvironmentValidationError";
    this.issues = result.issues;
  }
}

export function assertValidPennyStartupEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): PennyEnvironmentValidationResult {
  const result = validatePennyStartupEnvironment(env);

  if (result.issues.length) {
    throw new PennyEnvironmentValidationError(result);
  }

  return result;
}

export const server = createPennyServer();

if (isMainModule()) {
  try {
    assertValidPennyStartupEnvironment();
    await prepareDatabase();
    server.listen(port, () => {
      console.log(`Penny cockpit listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export function validatePennyStartupEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): PennyEnvironmentValidationResult {
  const deployTarget = pennyDeployTarget(env);
  const strict = isStrictDeployTarget(deployTarget) || env.NODE_ENV?.trim() === "production";
  const issues: PennyEnvironmentValidationIssue[] = [];
  const warnings: PennyEnvironmentValidationIssue[] = [];
  const databaseUrl = env.DATABASE_URL?.trim() ?? "";
  const configuredAuthMode = env.PENNY_AUTH_MODE?.trim().toLowerCase() ?? "";
  const authMode = (configuredAuthMode === "strict" ? "token" : configuredAuthMode || (env.PENNY_API_TOKEN?.trim() || strict ? "token" : "dev")) as AuthMode;
  const apiToken = env.PENNY_API_TOKEN?.trim() ?? "";
  const corsOrigins = env.PENNY_CORS_ORIGINS?.trim() ?? "";
  const modelBackedValue = env.PENNY_CREATE_MODEL_BACKED?.trim().toLowerCase();
  const skipDatabasePrep = readEnvFlagFrom(env, "PENNY_SKIP_DATABASE_PREP", false);

  if (!databaseUrl) {
    if (strict || !skipDatabasePrep) {
      issues.push({
        code: "database_url_required",
        message: "DATABASE_URL is required before starting Penny.",
      });
    } else {
      warnings.push({
        code: "database_url_missing_dev_fallback",
        message: "DATABASE_URL is not set; local dev will use in-memory services where available.",
      });
    }
  } else if (!isPostgresDatabaseUrl(databaseUrl)) {
    issues.push({
      code: "database_url_invalid",
      message: "DATABASE_URL must be a valid postgres:// or postgresql:// URL.",
    });
  } else if (strict && isLocalDatabaseUrl(databaseUrl)) {
    issues.push({
      code: "database_url_local_in_strict_deploy",
      message: "Strict deployments must not point DATABASE_URL at localhost or loopback Postgres.",
    });
  }

  if (configuredAuthMode && !["dev", "token", "strict"].includes(configuredAuthMode)) {
    issues.push({
      code: "auth_mode_invalid",
      message: "PENNY_AUTH_MODE must be dev or token.",
    });
  }

  if (strict && authMode !== "token") {
    issues.push({
      code: "auth_mode_token_required",
      message: "Strict deployments must use PENNY_AUTH_MODE=token.",
    });
  }

  if (authMode === "token") {
    if (!apiToken) {
      issues.push({
        code: "api_token_required",
        message: "PENNY_API_TOKEN is required when token auth is enabled.",
      });
    } else if (strict && apiToken.length < 32) {
      issues.push({
        code: "api_token_too_short",
        message: "Strict deployments require a PENNY_API_TOKEN of at least 32 characters.",
      });
    }
  } else if (strict && apiToken && apiToken.length < 32) {
    issues.push({
      code: "api_token_too_short",
      message: "Strict deployments require a PENNY_API_TOKEN of at least 32 characters.",
    });
  }

  if (strict) {
    const sessionSecret = env.PENNY_SESSION_SECRET?.trim() ?? "";

    if (sessionSecret.length < 32) {
      issues.push({
        code: "session_secret_required",
        message: "Strict deployments require PENNY_SESSION_SECRET of at least 32 characters.",
      });
    }

    if (!corsOrigins) {
      issues.push({
        code: "cors_origins_required",
        message: "Strict deployments require PENNY_CORS_ORIGINS with the exact frontend origin.",
      });
    } else if (corsOrigins.split(",").some((origin) => origin.trim() === "*")) {
      issues.push({
        code: "cors_wildcard_forbidden",
        message: "Strict deployments must not use PENNY_CORS_ORIGINS=*.",
      });
    }

    if (readEnvFlagFrom(env, "PENNY_TRUST_AUTH_HEADERS", false)) {
      issues.push({
        code: "trust_auth_headers_forbidden",
        message: "Strict deployments must not trust caller scope headers unless a reviewed reverse-proxy integration is added.",
      });
    }

    if (skipDatabasePrep) {
      issues.push({
        code: "database_prep_skip_forbidden",
        message: "Strict deployments must not set PENNY_SKIP_DATABASE_PREP=true; run migrations and let startup verify the schema.",
      });
    }

    if (parsePositiveInteger(env.PENNY_RATE_LIMIT_MAX, 120) <= 0) {
      issues.push({
        code: "rate_limit_required",
        message: "Strict deployments must keep PENNY_RATE_LIMIT_MAX above zero.",
      });
    }
  } else if (authMode === "dev") {
    warnings.push({
      code: "dev_auth_enabled",
      message: "Development auth trusts caller scope headers and is not safe for staging or production.",
    });
  }

  if (modelBackedValue && !["0", "1", "true", "false", "yes", "no", "on", "off"].includes(modelBackedValue)) {
    issues.push({
      code: "model_backed_flag_invalid",
      message: "PENNY_CREATE_MODEL_BACKED must be true or false.",
    });
  }

  if (readEnvFlagFrom(env, "PENNY_CREATE_MODEL_BACKED", false) && !env.XAI_API_KEY?.trim()) {
    issues.push({
      code: "model_backed_missing_key",
      message: "PENNY_CREATE_MODEL_BACKED=true requires XAI_API_KEY.",
    });
  }

  return { deployTarget, strict, issues, warnings };
}

function pennyDeployTarget(env: NodeJS.ProcessEnv): PennyDeployTarget {
  const configured = env.PENNY_DEPLOY_ENV?.trim().toLowerCase() ?? "";

  switch (configured) {
    case "production":
    case "prod":
      return "production";
    case "staging":
    case "stage":
      return "staging";
    case "private-alpha":
    case "private_alpha":
    case "alpha":
      return "private-alpha";
    case "development":
    case "dev":
      return "development";
    case "local":
    case "":
      return env.NODE_ENV?.trim() === "production" ? "production" : "local";
    default:
      return env.NODE_ENV?.trim() === "production" ? "production" : "local";
  }
}

function isStrictDeployTarget(target: PennyDeployTarget): boolean {
  return target === "production" || target === "staging" || target === "private-alpha";
}

function isPostgresDatabaseUrl(value: string): boolean {
  try {
    const parsed = new URL(value);

    return parsed.protocol === "postgres:" || parsed.protocol === "postgresql:";
  } catch {
    return false;
  }
}

function isLocalDatabaseUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();

    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
  } catch {
    return false;
  }
}

export function guardApiRequest(request: Request, url: URL): ApiGuardResult {
  const cors = corsHeadersForRequest(request);
  const apiPath = isApiPath(url.pathname);

  if (!apiPath) {
    return {
      request,
      headers: cors.allowed ? cors.headers : new Headers(),
    };
  }

  if (!cors.allowed) {
    emitAuthFailureLog(request, "cors_origin_not_allowed", 403);
    return {
      request,
      headers: cors.headers,
      response: jsonErrorResponse(403, "cors_origin_not_allowed", "This origin is not allowed for Penny API requests."),
    };
  }

  if (request.method === "OPTIONS") {
    return {
      request,
      headers: preflightHeaders(cors.headers),
      response: new Response(null, { status: 204 }),
    };
  }

  const auth = authenticateApiRequest(request);

  if (!auth.ok) {
    return {
      request,
      headers: cors.headers,
      response: auth.response,
    };
  }

  const rateLimit = apiRateLimiter.check(auth.value);
  mergeHeaders(cors.headers, rateLimit.headers);

  if (!rateLimit.allowed) {
    emitAuthFailureLog(request, "rate_limited", 429, auth.value.mode);
    return {
      request,
      headers: cors.headers,
      response: jsonErrorResponse(429, "rate_limited", "Too many Penny API requests. Try again shortly.", {
        "retry-after": String(rateLimit.retryAfterSeconds ?? 60),
      }),
    };
  }

  return {
    request: requestWithServerScope(request, auth.value.scope),
    headers: cors.headers,
  };
}

function authenticateApiRequest(request: Request): { ok: true; value: ApiAuthResult } | { ok: false; response: Response } {
  const mode = resolveAuthMode();

  if (mode === "token") {
    const expectedToken = process.env.PENNY_API_TOKEN?.trim();

    if (!expectedToken) {
      emitAuthFailureLog(request, "auth_not_configured", 500, mode);
      return {
        ok: false,
        response: jsonErrorResponse(
          500,
          "auth_not_configured",
          "PENNY_API_TOKEN is required when Penny token auth is enabled.",
        ),
      };
    }

    const presentedToken = requestBearerToken(request) ?? request.headers.get("x-penny-api-key")?.trim();
    const session = authenticateSessionCookie(request);

    if ((!presentedToken || !safeTokenEquals(presentedToken, expectedToken)) && !session) {
      const rateLimit = authFailureRateLimiter.check(clientRateLimitKey(request));

      if (!rateLimit.allowed) {
        emitAuthFailureLog(request, "auth_rate_limited", 429, mode);
        return {
          ok: false,
          response: jsonErrorResponse(429, "auth_rate_limited", "Too many failed Penny access attempts. Try again shortly.", {
            "retry-after": String(rateLimit.retryAfterSeconds ?? 60),
          }),
        };
      }

      emitAuthFailureLog(request, "unauthorized", 401, mode);
      return {
        ok: false,
        response: jsonErrorResponse(401, "unauthorized", "A valid Penny API token is required.", {
          "www-authenticate": 'Bearer realm="penny"',
        }),
      };
    }
  }

  const scope = scopeForRequest(request, mode);

  return {
    ok: true,
    value: {
      identityKey: `${mode}:${scope.userId}`,
      mode,
      scope,
    },
  };
}

function emitAuthFailureLog(request: Request, reason: string, status: number, mode?: AuthMode): void {
  const url = new URL(request.url);

  emitPennyLog(
    "auth.failure",
    {
      reason,
      status,
      method: request.method,
      path: url.pathname,
      mode: mode ?? null,
      hasAuthorization: Boolean(request.headers.get("authorization")),
      hasApiKeyHeader: Boolean(request.headers.get("x-penny-api-key")),
      hasSessionCookie: request.headers.get("cookie")?.includes(`${sessionCookieName}=`) ?? false,
    },
    { level: status >= 500 ? "error" : "warn" },
  );
}

function requestWithServerScope(request: Request, scope: ServerScope): Request {
  const headers = new Headers(request.headers);

  headers.set("x-user-id", scope.userId);
  headers.set("x-penny-user-id", scope.userId);
  headers.set("x-workspace-id", scope.workspaceId);
  headers.set("x-penny-workspace-id", scope.workspaceId);
  headers.set("x-project-id", scope.projectId);
  headers.set("x-penny-project-id", scope.projectId);
  headers.set("x-sphere-id", scope.sphereId);
  headers.set("x-penny-sphere-id", scope.sphereId);

  return new Request(request, { headers });
}

function resolveAuthMode(): AuthMode {
  const configured = process.env.PENNY_AUTH_MODE?.trim().toLowerCase();

  if (configured === "token" || configured === "strict") {
    return "token";
  }

  if (configured === "dev") {
    return "dev";
  }

  return process.env.NODE_ENV === "production" || !!process.env.PENNY_API_TOKEN?.trim() ? "token" : "dev";
}

function scopeForRequest(request: Request, mode: AuthMode): ServerScope {
  const trustHeaders = mode === "dev" || readEnvFlag("PENNY_TRUST_AUTH_HEADERS", false);

  return {
    userId: scopeValue(
      trustHeaders ? firstPresentHeader(request, ["x-user-id", "x-penny-user-id"]) : undefined,
      ["PENNY_AUTH_USER_ID", "PENNY_USER_ID", "PENNY_DEFAULT_USER_ID", "PENNY_SEED_USER_ID"],
      mode === "dev" ? "dev-user" : "api-user",
    ),
    workspaceId: scopeValue(
      trustHeaders ? firstPresentHeader(request, ["x-workspace-id", "x-penny-workspace-id"]) : undefined,
      ["PENNY_AUTH_WORKSPACE_ID", "PENNY_WORKSPACE_ID", "PENNY_DEFAULT_WORKSPACE_ID"],
      mode === "dev" ? "dev-workspace" : "api-workspace",
    ),
    projectId: scopeValue(
      trustHeaders ? firstPresentHeader(request, ["x-project-id", "x-penny-project-id"]) : undefined,
      ["PENNY_AUTH_PROJECT_ID", "PENNY_PROJECT_ID", "PENNY_DEFAULT_PROJECT_ID"],
      mode === "dev" ? "dev-project" : "api-project",
    ),
    sphereId: scopeValue(
      trustHeaders ? firstPresentHeader(request, ["x-sphere-id", "x-penny-sphere-id"]) : undefined,
      ["PENNY_AUTH_SPHERE_ID", "PENNY_SPHERE_ID", "PENNY_DEFAULT_SPHERE_ID"],
      mode === "dev" ? "dev-sphere" : "api-sphere",
    ),
  };
}

function scopeValue(headerValue: string | undefined, envNames: string[], fallback: string): string {
  if (headerValue?.trim()) {
    return headerValue.trim();
  }

  for (const envName of envNames) {
    const value = process.env[envName]?.trim();

    if (value) {
      return value;
    }
  }

  return fallback;
}

function requestBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization")?.trim();

  if (!authorization) {
    return undefined;
  }

  const [scheme, ...rest] = authorization.split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer") {
    return undefined;
  }

  const token = rest.join(" ").trim();
  return token || undefined;
}

async function handleLoginRequest(request: Request): Promise<Response> {
  if (resolveAuthMode() !== "token") {
    return new Response(null, { status: 303, headers: { location: "/" } });
  }

  if (request.method === "GET" || request.method === "HEAD") {
    return loginPageResponse();
  }

  if (request.method !== "POST") {
    return jsonErrorResponse(405, "method_not_allowed", "Penny login only supports GET and POST.");
  }

  const rateLimit = authFailureRateLimiter.check(clientRateLimitKey(request));

  if (!rateLimit.allowed) {
    return loginPageResponse("Too many access attempts. Try again shortly.", 429, {
      "retry-after": String(rateLimit.retryAfterSeconds ?? 60),
    });
  }

  const expectedToken = process.env.PENNY_API_TOKEN?.trim();

  if (!expectedToken) {
    return jsonErrorResponse(500, "auth_not_configured", "PENNY_API_TOKEN is required when Penny token auth is enabled.");
  }

  const token = await loginTokenFromRequest(request);

  if (!token || !safeTokenEquals(token, expectedToken)) {
    return loginPageResponse("Access token was not accepted.", 401);
  }

  const maxAgeSeconds = parsePositiveInteger(process.env.PENNY_SESSION_MAX_AGE_SECONDS, 43_200);
  const headers = new Headers({
    location: "/",
    "set-cookie": serializeSessionCookie(signSessionCookie(Date.now() + maxAgeSeconds * 1000), maxAgeSeconds),
  });

  return new Response(null, { status: 303, headers });
}

async function loginTokenFromRequest(request: Request): Promise<string | undefined> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const text = await request.text();

  if (contentType.includes("application/json")) {
    try {
      const payload = JSON.parse(text) as { token?: unknown };

      return typeof payload.token === "string" ? payload.token.trim() : undefined;
    } catch {
      return undefined;
    }
  }

  const form = new URLSearchParams(text);
  const token = form.get("token")?.trim();

  return token || undefined;
}

function requiresFrontendSession(request: Request, url: URL): boolean {
  return (
    resolveAuthMode() === "token" &&
    !isApiPath(url.pathname) &&
    shouldServeFrontendFallback(url.pathname) &&
    (request.method === "GET" || request.method === "HEAD") &&
    !authenticateSessionCookie(request)
  );
}

function authenticateSessionCookie(request: Request): boolean {
  const cookie = cookieValue(request, sessionCookieName);

  if (!cookie) {
    return false;
  }

  const [encodedPayload, signature] = cookie.split(".");

  if (!encodedPayload || !signature || !safeTokenEquals(signature, hmac(encodedPayload))) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as { exp?: unknown };

    return typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

function signSessionCookie(expiresAt: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: expiresAt, v: 1 })).toString("base64url");

  return `${payload}.${hmac(payload)}`;
}

function serializeSessionCookie(value: string, maxAgeSeconds: number): string {
  return [
    `${sessionCookieName}=${value}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

function logoutResponse(): Response {
  return new Response(null, {
    status: 303,
    headers: {
      location: "/penny/login",
      "set-cookie": `${sessionCookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    },
  });
}

function loginPageResponse(message?: string, status = 200, extraHeaders: Record<string, string> = {}): Response {
  const escapedMessage = message ? escapeHtml(message) : "";

  return new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Penny Access</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f4ef; color: #151515; }
    main { width: min(420px, calc(100vw - 32px)); }
    h1 { margin: 0 0 10px; font-size: 32px; letter-spacing: 0; }
    p { margin: 0 0 22px; color: #55514a; line-height: 1.5; }
    form { display: grid; gap: 14px; }
    label { font-size: 13px; font-weight: 700; color: #3a362f; }
    input { box-sizing: border-box; width: 100%; min-height: 46px; border: 1px solid #b8b0a3; border-radius: 6px; padding: 0 12px; font: inherit; background: #fff; color: #151515; }
    button { min-height: 46px; border: 0; border-radius: 6px; background: #151515; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
    .error { margin: 0 0 14px; color: #a61b1b; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <h1>Penny</h1>
    <p>Enter the private access token to open this workspace.</p>
    ${escapedMessage ? `<p class="error">${escapedMessage}</p>` : ""}
    <form method="post" action="/penny/login">
      <label for="token">Access token</label>
      <input id="token" name="token" type="password" autocomplete="current-password" required autofocus />
      <button type="submit">Enter Penny</button>
    </form>
  </main>
</body>
</html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        ...extraHeaders,
      },
    },
  );
}

function cookieValue(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie");

  if (!cookie) {
    return undefined;
  }

  for (const part of cookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");

    if (rawName === name) {
      return rawValue.join("=");
    }
  }

  return undefined;
}

function hmac(value: string): string {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function sessionSecret(): string {
  return process.env.PENNY_SESSION_SECRET?.trim() || process.env.PENNY_API_TOKEN?.trim() || "penny-dev-session-secret";
}

function safeTokenEquals(presentedToken: string, expectedToken: string): boolean {
  const presented = Buffer.from(presentedToken);
  const expected = Buffer.from(expectedToken);

  if (presented.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(presented, expected);
}

function clientRateLimitKey(request: Request): string {
  return request.headers.get("x-penny-client-ip")?.trim() || "unknown-client";
}

function firstPresentHeader(request: Request, names: string[]): string | undefined {
  for (const name of names) {
    const value = request.headers.get(name)?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

function corsHeadersForRequest(request: Request): { allowed: boolean; headers: Headers } {
  const headers = new Headers();
  const origin = request.headers.get("origin")?.trim();

  if (!origin) {
    return { allowed: true, headers };
  }

  const allowedOrigins = allowedCorsOrigins();

  if (!isAllowedCorsOrigin(origin, allowedOrigins)) {
    return { allowed: false, headers };
  }

  headers.set("vary", "Origin");
  headers.set("access-control-allow-origin", allowedOrigins.includes("*") ? "*" : origin);

  if (!allowedOrigins.includes("*")) {
    headers.set("access-control-allow-credentials", "true");
  }

  return { allowed: true, headers };
}

function allowedCorsOrigins(): string[] {
  const configured = process.env.PENNY_CORS_ORIGINS?.trim();

  if (configured) {
    return configured
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  if (process.env.NODE_ENV !== "production") {
    return ["http://localhost:5173", "http://127.0.0.1:5173"];
  }

  return [];
}

function isAllowedCorsOrigin(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.includes("*") || allowedOrigins.includes(origin) || isDevLoopbackOrigin(origin, allowedOrigins);
}

function isDevLoopbackOrigin(origin: string, allowedOrigins: string[]): boolean {
  if (process.env.NODE_ENV === "production" || allowedOrigins.length === 0) {
    return false;
  }

  try {
    const parsed = new URL(origin);

    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) &&
      parsed.port.length > 0
    );
  } catch {
    return false;
  }
}

function preflightHeaders(headers: Headers): Headers {
  const nextHeaders = new Headers(headers);

  nextHeaders.set("access-control-allow-methods", "GET,HEAD,POST,OPTIONS");
  nextHeaders.set(
    "access-control-allow-headers",
    [
      "authorization",
      "content-type",
      "idempotency-key",
      "x-penny-api-key",
      "x-user-id",
      "x-penny-user-id",
      "x-workspace-id",
      "x-penny-workspace-id",
      "x-project-id",
      "x-penny-project-id",
      "x-sphere-id",
      "x-penny-sphere-id",
    ].join(", "),
  );
  nextHeaders.set("access-control-max-age", "600");

  return nextHeaders;
}

function createApiRateLimiter(): { check: (auth: ApiAuthResult) => RateLimitResult } {
  const limiter = createKeyedRateLimiter({
    maxEnv: "PENNY_RATE_LIMIT_MAX",
    windowEnv: "PENNY_RATE_LIMIT_WINDOW_MS",
    fallbackMax: 120,
    fallbackWindowMs: 60_000,
  });

  return {
    check(auth: ApiAuthResult): RateLimitResult {
      return limiter.check(auth.identityKey);
    },
  };
}

function createKeyedRateLimiter(input: {
  maxEnv: string;
  windowEnv: string;
  fallbackMax: number;
  fallbackWindowMs: number;
}): { check: (key: string) => RateLimitResult } {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key: string): RateLimitResult {
      const max = parsePositiveInteger(process.env[input.maxEnv], input.fallbackMax);

      if (max <= 0) {
        return { allowed: true, headers: new Headers() };
      }

      const windowMs = parsePositiveInteger(process.env[input.windowEnv], input.fallbackWindowMs);
      const now = Date.now();
      const existing = buckets.get(key);
      const bucket = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };

      bucket.count += 1;
      buckets.set(key, bucket);
      pruneRateLimitBuckets(buckets, now);

      const remaining = Math.max(0, max - bucket.count);
      const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      const headers = new Headers({
        "ratelimit-limit": String(max),
        "ratelimit-remaining": String(remaining),
        "ratelimit-reset": String(resetSeconds),
      });

      if (bucket.count > max) {
        return {
          allowed: false,
          headers,
          retryAfterSeconds: resetSeconds,
        };
      }

      return { allowed: true, headers };
    },
  };
}

function pruneRateLimitBuckets(buckets: Map<string, { count: number; resetAt: number }>, now: number): void {
  if (buckets.size < 1_000) {
    return;
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);

  if (Number.isInteger(parsed) && parsed >= 0) {
    return parsed;
  }

  return fallback;
}

async function prepareDatabase(): Promise<void> {
  if (readEnvFlag("PENNY_SKIP_DATABASE_PREP", false)) {
    return;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required to start the Penny API. Add it to .env.local or export it before running pnpm dev:api.",
    );
  }

  const autoMigrate = readEnvFlag("PENNY_AUTO_MIGRATE", process.env.NODE_ENV !== "production");
  const sql = createPennySql(databaseUrl);

  try {
    if (autoMigrate) {
      await migrate(drizzle(sql, { schema }), { migrationsFolder: migrationsDir });
    }

    await assertPennyDatabaseSchemaReady(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

export function missingPennySchemaTables(existingTables: Iterable<string>): string[] {
  const existing = new Set(Array.from(existingTables, (table) => table.trim().toLowerCase()).filter(Boolean));

  return requiredPennySchemaTables.filter((table) => !existing.has(table));
}

async function assertPennyDatabaseSchemaReady(sql: PennySqlClient): Promise<void> {
  const rows = await sql<PennySchemaTableRow[]>`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
  `;
  const missingTables = missingPennySchemaTables(rows.map((row) => row.table_name));

  if (missingTables.length) {
    throw new Error(
      `Penny database schema is missing required tables: ${missingTables.join(", ")}. Run DATABASE_URL=<postgres-url> pnpm db:migrate before starting the API.`,
    );
  }
}

function loadPennyEnv(): void {
  const loadEnvFile = (process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile;

  if (!loadEnvFile) {
    return;
  }

  for (const path of ["../../../.env.local", "../../../.env"]) {
    const absolutePath = fileURLToPath(new URL(path, import.meta.url));

    if (existsSync(absolutePath)) {
      loadEnvFile(absolutePath);
    }
  }
}

function readEnvFlag(name: string, fallback: boolean): boolean {
  return readEnvFlagFrom(process.env, name, fallback);
}

function readEnvFlagFrom(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const value = env[name]?.trim().toLowerCase();

  if (!value) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }

  return fallback;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function mergeHeaders(target: Headers, source: Headers): void {
  source.forEach((value, key) => {
    target.set(key, value);
  });
}

function applyResponseHeaders(outgoing: ServerResponse, headers: Headers): void {
  headers.forEach((value, key) => {
    outgoing.setHeader(key, value);
  });
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

  const remoteAddress = incoming.socket.remoteAddress?.trim();

  if (remoteAddress) {
    headers.set("x-penny-client-ip", remoteAddress);
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

async function readStaticAsset(pathname: string, method: string): Promise<Response | null> {
  if (method !== "GET" && method !== "HEAD") {
    return null;
  }

  const directAsset = await readStaticFile(pathname === "/" ? "/index.html" : pathname);

  if (directAsset) {
    return directAsset;
  }

  if (!shouldServeFrontendFallback(pathname)) {
    return null;
  }

  return readStaticFile("/index.html");
}

async function readStaticFile(pathname: string): Promise<Response | null> {
  const staticPath = safeStaticPath(pathname);

  if (!staticPath) {
    return null;
  }

  try {
    const file = await stat(staticPath);

    if (!file.isFile()) {
      return null;
    }

    const body = await readFile(staticPath);

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": contentTypeFor(pathname),
      },
    });
  } catch {
    return null;
  }
}

function safeStaticPath(pathname: string): string | null {
  let decodedPath: string;

  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const relativePath = decodedPath.replace(/^\/+/, "");

  if (!relativePath || relativePath.split(/[\\/]/).includes("..")) {
    return null;
  }

  return join(publicDir, relativePath);
}

function shouldServeFrontendFallback(pathname: string): boolean {
  if (isApiPath(pathname)) {
    return false;
  }

  return extname(pathname) === "";
}

function isApiPath(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/brain" ||
    pathname.startsWith("/brain/") ||
    pathname === "/autopilot" ||
    pathname.startsWith("/autopilot/")
  );
}

function contentTypeFor(pathname: string): string {
  switch (extname(pathname).toLowerCase()) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    case ".map":
      return "application/json; charset=utf-8";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function invalidPathResponse(code: string, message: string): Response {
  return jsonErrorResponse(400, code, message);
}

function jsonErrorResponse(status: number, code: string, message: string, headers: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify({
      error: {
        code,
        message,
      },
    }),
    {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        ...headers,
      },
    },
  );
}
