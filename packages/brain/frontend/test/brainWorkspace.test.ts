import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BrainMemoryPanel,
  BrainWorkspace,
  GmailKeywordResults,
  GmailSemanticResults,
  GoogleConnectorControl,
  isActiveGmailConnection,
  isGmailSearchAvailable,
} from "../src/components/BrainWorkspace";
import type { BrainDocumentsData, BrainMemoryProfileData, BrainRecentIdea } from "../src/types/brain";

test("BrainWorkspace renders persisted quick notes as the first sidebar folder", () => {
  const markup = renderToStaticMarkup(
    createElement(BrainWorkspace, {
      documentsData: emptyDocumentsData(),
      selectedDocument: null,
      data: null,
      moves: [],
      autopilot: null,
      latestArtifact: null,
      focusedClaimId: null,
      canvasOpen: false,
      status: "Ready",
      isThinking: false,
      recents: [quickNote("Persist this note in Brain.")],
      archivedRecents: [],
      onSelectDocument: () => undefined,
      onBackToLibrary: () => undefined,
      onNewThought: () => undefined,
      onSeed: async () => undefined,
      onQuickNoteCreate: async () => undefined,
      onQuickNoteAction: async () => undefined,
      onClaimSelect: () => undefined,
      onReworkDocument: async () => undefined,
      onCanvasOpenChange: () => undefined,
      onCanvasNodeAction: () => undefined,
    }),
  );

  const quickNotesIndex = markup.indexOf("Quick Notes");
  const documentsIndex = markup.indexOf("Documents");

  assert.notEqual(quickNotesIndex, -1);
  assert.notEqual(documentsIndex, -1);
  assert.ok(quickNotesIndex < documentsIndex);
  assert.match(markup, /Persist this note in Brain/);
  assert.doesNotMatch(markup, /No quick notes yet/);
  assert.doesNotMatch(markup, /Capture a quick note/);
  assert.match(markup, /aria-label="Quick notes folder"/);
  assert.match(markup, /aria-label="Send quick note"/);
  assert.match(markup, /class="quick-note-open"/);
});

test("BrainMemoryPanel renders imported sources, profile summary, and recent memory nodes", () => {
  const markup = renderToStaticMarkup(
    createElement(BrainMemoryPanel, {
      profile: memoryProfile(),
      status: "ready",
      error: null,
      notice: "Source deleted. Related chunks and source-backed memories were removed from retrieval and Create.",
      disabled: false,
      onImport: async () => undefined,
      onDemoFixtureImport: async () => undefined,
      onDeleteSource: async () => undefined,
      onStartCreateWithBrain: () => undefined,
      showDemoFixture: true,
    }),
  );

  assert.match(markup, /Second Brain memory/);
  assert.match(markup, /Private context for Create/);
  assert.match(markup, /Import context/);
  assert.match(markup, /Review Brain profile/);
  assert.match(markup, /Confirm\/forget\/boost memories/);
  assert.match(markup, /Start Create with this Brain/);
  assert.match(markup, /Export coding prompt/);
  assert.match(markup, /Load Penny demo fixture/);
  assert.match(markup, /Uploaded sources/);
  assert.match(markup, /Founder workflow notes/);
  assert.match(markup, /Private user memory/);
  assert.match(markup, /no global training/i);
  assert.match(markup, /Penny understood/);
  assert.match(markup, /Small reversible builds/);
  assert.match(markup, /Preference - Small reversible builds/);
  assert.match(markup, /Grounded/);
  assert.match(markup, /90% confidence/);
  assert.match(markup, /chunk brain-ch/);
  assert.match(markup, /Reinforced/);
  assert.match(markup, /Mark Preference - Small reversible builds correct/);
  assert.match(markup, /Supports ChatGPT export ZIPs/i);
  assert.match(markup, /Google/);
  assert.match(markup, /Connect Gmail/);
  assert.match(markup, /Penny reads Gmail only after consent/);
  assert.match(markup, /trainingUse=false/);
  assert.match(markup, /Search email/);
  assert.match(markup, /Semantic search/);
  assert.match(markup, /Sync Gmail first/);
  assert.match(markup, /Sync now/);
  assert.match(markup, /Revoke/);
  assert.match(markup, /Delete Gmail source/);
  assert.match(markup, /Memory updated/);
  assert.match(markup, /Source deleted\. Related chunks and source-backed memories were removed from retrieval and Create/);
  assert.match(markup, /Delete Founder workflow notes/);
  assert.match(markup, /Use this Brain to create something/);
});

test("GoogleConnectorControl renders statuses, scopes, sync counts, and honest gated messaging", () => {
  const markup = renderToStaticMarkup(
    createElement(GoogleConnectorControl, {
      provider: googleProviderView(),
      connectorState: {
        connections: [
          {
            id: "connector-google-1",
            status: "connected",
            surfaces: ["google_drive", "google_calendar"],
            scopes: ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/calendar.readonly"],
            lastSyncedAt: "2026-05-20T12:05:00.000Z",
            nextSyncAt: "2026-05-20T18:05:00.000Z",
            revokedAt: null,
            sourceCounts: { google_doc: 2, google_calendar_event: 1 },
            credential: {
              connectionId: "nango-google-1",
              providerConfigKey: "google",
              accountEmail: "work@example.com",
            },
          },
          {
            id: "connector-google-2",
            status: "connected",
            surfaces: ["google_drive"],
            scopes: ["https://www.googleapis.com/auth/drive.file"],
            lastSyncedAt: "2026-05-20T13:05:00.000Z",
            nextSyncAt: "2026-05-20T19:05:00.000Z",
            revokedAt: null,
            sourceCounts: { google_doc: 1 },
            credential: {
              connectionId: "nango-google-2",
              providerConfigKey: "google",
              accountEmail: "personal@example.com",
            },
          },
        ],
        syncJobs: [
          {
            id: "sync-google-drive-1",
            connectionId: "connector-google-1",
            surface: "google_drive",
            status: "succeeded",
            requestedAt: "2026-05-20T12:01:00.000Z",
            startedAt: "2026-05-20T12:01:05.000Z",
            completedAt: "2026-05-20T12:05:00.000Z",
          },
        ],
        sources: [
          {
            id: "connector-source-1",
            connectionId: "connector-google-1",
            kind: "google_doc",
            label: "Google Create strategy doc",
            sourceUri: "google-drive:file:doc-1",
            brainSourceId: "brain-source-1",
            privacy: {
              retrievalAccess: "enabled",
            },
          },
          {
            id: "connector-source-2",
            connectionId: "connector-google-2",
            kind: "google_doc",
            label: "Personal research doc",
            sourceUri: "google-drive:file:doc-2",
            brainSourceId: "brain-source-2",
            privacy: {
              retrievalAccess: "enabled",
            },
          },
        ],
      },
      status: "ready",
      error: null,
      connectLink: null,
      disabled: false,
      onConnect: async () => undefined,
      onSyncNow: async () => undefined,
      onRevoke: async () => undefined,
      onDeleteSource: async () => undefined,
    }),
  );

  assert.match(markup, /Google/);
  assert.match(markup, /2 active/);
  assert.match(markup, /work@example\.com/);
  assert.match(markup, /personal@example\.com/);
  assert.match(markup, /Add Google account/);
  assert.match(markup, /Google connected/);
  assert.match(markup, /Connected/);
  assert.match(markup, /work@example\.com is selected for Google Drive, Google Calendar/);
  assert.match(markup, /3 sources indexed/);
  assert.match(markup, /Google source coverage/);
  assert.match(markup, /Google Drive Succeeded/);
  assert.match(markup, /Drive/);
  assert.match(markup, /Available · Google Drive File/);
  assert.match(markup, /Scopes: https:\/\/www\.googleapis\.com\/auth\/drive\.file/);
  assert.match(markup, /Gmail/);
  assert.match(markup, /Gated Verification Required/);
  assert.match(markup, /Gated: google\.gmail\.readonly/);
  assert.match(markup, /https:\/\/www\.googleapis\.com\/auth\/gmail\.readonly/);
  assert.match(markup, /private Brain memory/);
  assert.match(markup, /No hidden Gmail import/);
  assert.match(markup, /No modify\/compose\/send mail access/);
  assert.match(markup, /Google Takeout/);
  assert.match(markup, /Manual Import Only/);
  assert.match(markup, /My Activity/);
  assert.match(markup, /No direct Google Search history access/);
  assert.match(markup, /Chrome extension seam/);
  assert.match(markup, /Extension Required/);
  assert.match(markup, /Browser\/search: Extension Required/);
  assert.match(markup, /Sync now/);
  assert.match(markup, /Revoke/);
  assert.match(markup, /Delete Gmail source/);
});

test("GoogleConnectorControl disables Gmail source deletion when only non-Gmail sources exist", () => {
  const markup = renderToStaticMarkup(
    createElement(GoogleConnectorControl, {
      provider: googleProviderView(),
      connectorState: {
        connections: [
          {
            id: "connector-google-1",
            status: "connected",
            surfaces: ["google_drive", "google_gmail"],
            scopes: ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/gmail.readonly"],
            lastSyncedAt: "2026-05-20T12:05:00.000Z",
            nextSyncAt: "2026-05-20T18:05:00.000Z",
            revokedAt: null,
            sourceCounts: { google_doc: 1 },
            credential: {
              connectionId: "nango-google-1",
              providerConfigKey: "google",
              accountEmail: "work@example.com",
            },
          },
        ],
        syncJobs: [],
        sources: [
          {
            id: "connector-source-drive-1",
            connectionId: "connector-google-1",
            kind: "google_doc",
            label: "Drive source that must not be deleted by Gmail control",
            sourceUri: "google-drive:file:doc-1",
            brainSourceId: "brain-source-1",
            privacy: {
              retrievalAccess: "enabled",
            },
          },
        ],
      },
      status: "ready",
      error: null,
      warning: null,
      connectLink: null,
      disabled: false,
      onConnect: async () => undefined,
      onSyncNow: async () => undefined,
      onRevoke: async () => undefined,
      onDeleteSource: async () => undefined,
    }),
  );
  const buttonMarkup = buttonMarkupForLabel(markup, "Delete Gmail source");

  assert.match(buttonMarkup, /disabled=""/);
});

test("GoogleConnectorControl disables Gmail sync and revoke for Drive-only connections", () => {
  const markup = renderToStaticMarkup(
    createElement(GoogleConnectorControl, {
      provider: googleProviderView(),
      connectorState: {
        connections: [
          {
            id: "connector-google-drive-only",
            status: "connected",
            surfaces: ["google_drive"],
            scopes: ["https://www.googleapis.com/auth/drive.file"],
            lastSyncedAt: "2026-05-20T12:05:00.000Z",
            nextSyncAt: "2026-05-20T18:05:00.000Z",
            revokedAt: null,
            sourceCounts: { google_doc: 1 },
            credential: {
              connectionId: "nango-google-drive-only",
              providerConfigKey: "google",
              accountEmail: "drive-only@example.com",
            },
          },
        ],
        syncJobs: [],
        sources: [
          {
            id: "connector-source-drive-only",
            connectionId: "connector-google-drive-only",
            kind: "google_doc",
            label: "Drive source",
            sourceUri: "google-drive:file:doc-1",
            brainSourceId: "brain-source-drive-only",
            privacy: {
              retrievalAccess: "enabled",
            },
          },
        ],
      },
      status: "ready",
      error: null,
      warning: null,
      connectLink: null,
      disabled: false,
      onConnect: async () => undefined,
      onSyncNow: async () => undefined,
      onRevoke: async () => undefined,
      onDeleteSource: async () => undefined,
    }),
  );

  assert.match(markup, /Google connected/);
  assert.match(markup, /drive-only@example\.com is selected for Google Drive/);
  assert.match(buttonMarkupForLabel(markup, "Sync now"), /disabled=""/);
  assert.match(buttonMarkupForLabel(markup, "Revoke"), /disabled=""/);
  assert.match(buttonMarkupForLabel(markup, "Delete Gmail source"), /disabled=""/);
});

test("GoogleConnectorControl renders connected Gmail smoke controls enabled", () => {
  const markup = renderToStaticMarkup(
    createElement(GoogleConnectorControl, {
      provider: googleProviderView(),
      connectorState: {
        connections: [
          {
            id: "connector-gmail-1",
            status: "connected",
            surfaces: ["google_gmail"],
            scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
            lastSyncedAt: "2026-05-22T12:05:00.000Z",
            nextSyncAt: "2026-05-22T18:05:00.000Z",
            revokedAt: null,
            sourceCounts: { google_gmail_message: 1 },
            credential: {
              connectionId: "nango-gmail-1",
              providerConfigKey: "google-gmail",
              accountEmail: "staged-gmail@example.com",
            },
          },
        ],
        syncJobs: [
          {
            id: "sync-gmail-1",
            connectionId: "connector-gmail-1",
            surface: "google_gmail",
            status: "succeeded",
            requestedAt: "2026-05-22T12:00:00.000Z",
            startedAt: "2026-05-22T12:00:01.000Z",
            completedAt: "2026-05-22T12:05:00.000Z",
          },
        ],
        sources: [
          {
            id: "connector-source-gmail-1",
            connectionId: "connector-gmail-1",
            kind: "google_gmail_message",
            label: "Launch partner follow-up",
            sourceUri: "gmail:message:msg-1",
            brainSourceId: "brain-source-gmail-1",
            privacy: {
              retrievalAccess: "enabled",
            },
          },
        ],
      },
      status: "ready",
      error: null,
      warning: null,
      connectLink: null,
      disabled: false,
      onConnect: async () => undefined,
      onSyncNow: async () => undefined,
      onRevoke: async () => undefined,
      onDeleteSource: async () => undefined,
      onKeywordSearch: async () => ({
        sourceOfTruth: "gmail_api_search_via_nango",
        query: "\"launch partner evidence\"",
        stored: false,
        results: [],
      }),
      onSemanticSearch: async () => ({
        sourceOfTruth: "synced_private_gmail_brain_memory",
        contextLight: false,
        results: [],
      }),
    }),
  );

  assert.match(markup, /Gmail connected/);
  assert.match(markup, /data-testid="gmail-connector-card"/);
  assert.match(markup, /data-testid="gmail-connect-button"/);
  assert.match(markup, /data-testid="gmail-privacy-copy"/);
  assert.match(markup, /staged-gmail@example\.com is selected for Google Gmail/);
  assert.match(markup, /1 source indexed/);
  assert.match(markup, /Scopes: https:\/\/www\.googleapis\.com\/auth\/gmail\.readonly/);
  assert.match(markup, /Penny reads Gmail only after consent/);
  assert.match(markup, /trainingUse=false/);
  assert.match(markup, /Google Gmail Succeeded/);
  assert.match(markup, /Google source coverage/);
  assert.match(markup, /data-testid="gmail-sync-button"/);
  assert.match(markup, /data-testid="gmail-revoke-button"/);
  assert.match(markup, /data-testid="gmail-delete-source-button"/);
  assert.doesNotMatch(buttonMarkupForLabel(markup, "Sync now"), /disabled=""/);
  assert.doesNotMatch(buttonMarkupForLabel(markup, "Revoke"), /disabled=""/);
  assert.doesNotMatch(buttonMarkupForLabel(markup, "Delete Gmail source"), /disabled=""/);
});

test("GoogleConnectorControl requires explicit selection when multiple Gmail accounts are active", () => {
  const markup = renderToStaticMarkup(
    createElement(GoogleConnectorControl, {
      provider: googleProviderView(),
      connectorState: {
        connections: [
          {
            id: "connector-gmail-1",
            status: "connected",
            surfaces: ["google_gmail"],
            scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
            lastSyncedAt: "2026-05-22T12:05:00.000Z",
            nextSyncAt: "2026-05-22T18:05:00.000Z",
            revokedAt: null,
            sourceCounts: { google_gmail_message: 1 },
            credential: {
              connectionId: "nango-gmail-1",
              providerConfigKey: "google-gmail",
              accountEmail: "first-staged-gmail@example.com",
            },
          },
          {
            id: "connector-gmail-2",
            status: "connected",
            surfaces: ["google_gmail"],
            scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
            lastSyncedAt: "2026-05-22T12:10:00.000Z",
            nextSyncAt: "2026-05-22T18:10:00.000Z",
            revokedAt: null,
            sourceCounts: { google_gmail_message: 1 },
            credential: {
              connectionId: "nango-gmail-2",
              providerConfigKey: "google-gmail",
              accountEmail: "second-staged-gmail@example.com",
            },
          },
        ],
        syncJobs: [],
        sources: [
          {
            id: "connector-source-gmail-1",
            connectionId: "connector-gmail-1",
            kind: "google_gmail_message",
            label: "First Gmail source",
            sourceUri: "gmail:message:msg-1",
            brainSourceId: "brain-source-gmail-1",
            privacy: {
              retrievalAccess: "enabled",
            },
          },
          {
            id: "connector-source-gmail-2",
            connectionId: "connector-gmail-2",
            kind: "google_gmail_message",
            label: "Second Gmail source",
            sourceUri: "gmail:message:msg-2",
            brainSourceId: "brain-source-gmail-2",
            privacy: {
              retrievalAccess: "enabled",
            },
          },
        ],
      },
      status: "ready",
      error: null,
      warning: null,
      connectLink: null,
      disabled: false,
      onConnect: async () => undefined,
      onSyncNow: async () => undefined,
      onRevoke: async () => undefined,
      onDeleteSource: async () => undefined,
      onKeywordSearch: async () => ({
        sourceOfTruth: "gmail_api_search_via_nango",
        query: "\"launch partner evidence\"",
        stored: false,
        results: [],
      }),
      onSemanticSearch: async () => ({
        sourceOfTruth: "synced_private_gmail_brain_memory",
        contextLight: false,
        results: [],
      }),
    }),
  );

  assert.match(markup, /Select one Gmail account before sync, search, revoke, or delete\./);
  assert.match(markup, /first-staged-gmail@example\.com/);
  assert.match(markup, /second-staged-gmail@example\.com/);
  assert.doesNotMatch(markup, /is selected for Google Gmail/);
  assert.match(buttonMarkupForLabel(markup, "Sync now"), /disabled=""/);
  assert.match(buttonMarkupForLabel(markup, "Revoke"), /disabled=""/);
  assert.match(buttonMarkupForLabel(markup, "Delete Gmail source"), /disabled=""/);
  assert.match(buttonMarkupForLabel(markup, "Search email"), /disabled=""/);
  assert.match(buttonMarkupForLabel(markup, "Semantic search"), /disabled=""/);
});

test("GoogleConnectorControl renders Gmail keyword search filters for staging smoke", () => {
  const markup = renderToStaticMarkup(
    createElement(GoogleConnectorControl, {
      provider: googleProviderView(),
      connectorState: {
        connections: [],
        syncJobs: [],
        sources: [],
      },
      status: "ready",
      error: null,
      warning: null,
      connectLink: null,
      disabled: false,
      onConnect: async () => undefined,
      onSyncNow: async () => undefined,
      onRevoke: async () => undefined,
      onDeleteSource: async () => undefined,
      onKeywordSearch: async () => ({
        sourceOfTruth: "gmail_api_search_via_nango",
        query: "",
        stored: false,
        results: [],
      }),
    }),
  );

  assert.match(markup, /Filters/);
  assert.match(markup, /data-testid="gmail-keyword-search-form"/);
  assert.match(markup, /data-testid="gmail-keyword-filters"/);
  assert.match(markup, /data-testid="gmail-keyword-search-button"/);
  assert.match(markup, /data-testid="gmail-semantic-search-form"/);
  assert.match(markup, /data-testid="gmail-semantic-search-button"/);
  assert.match(markup, /data-testid="gmail-filter-from"/);
  assert.match(markup, /data-testid="gmail-filter-to"/);
  assert.match(markup, /data-testid="gmail-filter-subject"/);
  assert.match(markup, /data-testid="gmail-filter-label"/);
  assert.match(markup, /data-testid="gmail-filter-after"/);
  assert.match(markup, /data-testid="gmail-filter-before"/);
  assert.match(markup, /data-testid="gmail-filter-has-attachment"/);
  assert.match(markup, /From/);
  assert.match(markup, /To/);
  assert.match(markup, /Subject/);
  assert.match(markup, /Label/);
  assert.match(markup, /After/);
  assert.match(markup, /Before/);
  assert.match(markup, /Has attachment/);
});

test("Gmail result rows expose safe refs without raw bodies or scores", () => {
  const keywordMarkup = renderToStaticMarkup(
    createElement(GmailKeywordResults, {
      results: [
        {
          messageId: "msg-1",
          threadId: "thread-1",
          subject: "Launch partner follow-up",
          sender: "Alice <alice@example.com>",
          date: "Fri, 22 May 2026 12:00:00 +0000",
          labels: ["INBOX"],
          snippet: "Safe Gmail snippet for launch partner evidence.",
          sourceRef: {
            providerId: "google",
            surface: "google_gmail",
            externalId: "msg-1",
            sourceUri: "gmail:message:msg-1",
            url: "https://mail.google.com/mail/u/0/#all/thread-1",
          },
          body: "RAW PRIVATE EMAIL BODY",
          score: 0.91,
        } as never,
      ],
    }),
  );
  const semanticMarkup = renderToStaticMarkup(
    createElement(GmailSemanticResults, {
      results: [
        {
          messageId: "msg-1",
          threadId: "thread-1",
          subject: "Launch partner follow-up",
          sender: "Alice <alice@example.com>",
          date: "Fri, 22 May 2026 12:00:00 +0000",
          snippet: "Safe synced-memory excerpt for launch partner evidence.",
          sourceRef: {
            id: "connector-source-gmail-1",
            providerId: "google",
            surface: "google_gmail",
            sourceUri: "gmail:message:msg-1",
            externalId: "msg-1",
            url: "https://mail.google.com/mail/u/0/#all/thread-1",
          },
          memoryRef: {
            id: "memory-gmail-1",
            label: "Launch partner follow-up",
            kind: "brain",
            summary: "Gmail memory summary",
          },
          grounding: "grounded",
          scoreReason: 'grounded match from synced Gmail memory for "Launch partner follow-up" (preference).',
          body: "RAW PRIVATE EMAIL BODY",
          rawScore: 0.91,
        } as never,
      ],
    }),
  );
  const combined = `${keywordMarkup}\n${semanticMarkup}`;

  assert.match(keywordMarkup, /Launch partner follow-up/);
  assert.match(keywordMarkup, /data-testid="gmail-keyword-results"/);
  assert.match(keywordMarkup, /data-testid="gmail-keyword-result"/);
  assert.match(keywordMarkup, /data-gmail-message-id="msg-1"/);
  assert.match(keywordMarkup, /Safe Gmail snippet for launch partner evidence/);
  assert.match(keywordMarkup, /msg-1/);
  assert.match(keywordMarkup, /thread-1/);
  assert.match(keywordMarkup, /gmail:message:msg-1/);
  assert.match(semanticMarkup, /data-testid="gmail-semantic-results"/);
  assert.match(semanticMarkup, /data-testid="gmail-semantic-result"/);
  assert.match(semanticMarkup, /data-gmail-message-id="msg-1"/);
  assert.match(semanticMarkup, /data-brain-memory-id="memory-gmail-1"/);
  assert.match(semanticMarkup, /grounded · Alice &lt;alice@example\.com&gt;/);
  assert.match(semanticMarkup, /Safe synced-memory excerpt for launch partner evidence/);
  assert.match(semanticMarkup, /grounded match from synced Gmail memory/);
  assert.match(semanticMarkup, /memory-gmail-1/);
  assert.match(semanticMarkup, /gmail:message:msg-1/);
  assert.doesNotMatch(combined, /RAW PRIVATE EMAIL BODY|plainTextBody|rawBody|payload|0\.91/);
});

test("Gmail search availability requires an active Gmail connection", () => {
  assert.equal(isActiveGmailConnection({ connection: null }), false);
  assert.equal(isActiveGmailConnection({ connection: { status: "connected", surfaces: ["google_drive"] } }), false);
  assert.equal(isActiveGmailConnection({ connection: { status: "revoked", surfaces: ["google_gmail"] } }), false);
  assert.equal(isActiveGmailConnection({ connection: { status: "connected", surfaces: ["google_gmail"] }, disabled: true }), false);
  assert.equal(isActiveGmailConnection({ connection: { status: "connected", surfaces: ["google_gmail"] } }), true);
  assert.equal(isGmailSearchAvailable({ connection: null }), false);
  assert.equal(isGmailSearchAvailable({ connection: { status: "connected", surfaces: ["google_drive"] } }), false);
  assert.equal(isGmailSearchAvailable({ connection: { status: "revoked", surfaces: ["google_gmail"] } }), false);
  assert.equal(isGmailSearchAvailable({ connection: { status: "connected", surfaces: ["google_gmail"] }, disabled: true }), false);
  assert.equal(isGmailSearchAvailable({ connection: { status: "connected", surfaces: ["google_gmail"] } }), true);
});

function buttonMarkupForLabel(markup: string, label: string): string {
  const labelIndex = markup.indexOf(`<span>${label}</span>`);
  const buttonStart = markup.lastIndexOf("<button", labelIndex);
  const buttonEnd = markup.indexOf("</button>", labelIndex);

  assert.notEqual(labelIndex, -1);
  assert.notEqual(buttonStart, -1);
  assert.notEqual(buttonEnd, -1);

  return markup.slice(buttonStart, buttonEnd);
}

function emptyDocumentsData(): BrainDocumentsData {
  const document = documentSummary();

  return {
    sourceOfTruth: "sessions_sources_claims_claim_versions_edges_moves_artifacts",
    documents: [document],
    hierarchy: [],
    sidebar: {
      quickNotes: [],
      folders: [],
      research: [],
    },
    graph: {
      nodes: [],
      edges: [],
    },
    meta: {
      documentCount: 1,
      claimCount: 0,
      edgeCount: 0,
    },
  };
}

function googleProviderView() {
  const driveScope = {
    id: "google.drive.file",
    surface: "google_drive",
    scope: "https://www.googleapis.com/auth/drive.file",
    sensitivity: "non_sensitive",
    whyPennyNeedsIt: "Let the user choose specific Drive files that Penny may index and resync.",
    userExplanation: "Penny can read only the Drive files you select or share with Penny.",
    gated: false,
    gatedStatus: null,
    productionAllowed: true,
    requiredEnvGate: null,
  };
  const gmailScope = {
    id: "google.gmail.readonly",
    surface: "google_gmail",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    sensitivity: "restricted",
    whyPennyNeedsIt: "read email for private Brain memory and email search.",
    userExplanation: "Penny reads Gmail only after consent, stores it as private Brain memory, and cannot modify, compose, or send mail.",
    gated: true,
    gatedStatus: "gated_verification_required",
    productionAllowed: true,
    requiredEnvGate: "ENABLE_GMAIL_CONNECTOR,ENABLE_RESTRICTED_GOOGLE_SCOPES",
  };

  return {
    id: "google",
    label: "Google",
    adapter: "nango",
    status: "connected",
    configured: true,
    configurationLabel: "configured",
    missingConfig: [],
    surfaces: [
      {
        id: "google_drive",
        providerId: "google",
        label: "Drive",
        status: "available",
        sourceKinds: ["google_drive_file"],
        scopes: [driveScope],
        whyPennyCanUseThis: "Drive files can become private Brain source nodes when the user chooses files.",
        userExplanation: "Connect selected Drive files so Brain can remember what you actually work from.",
        supportedNow: ["Selected-file metadata and source refs"],
        notFaked: ["No account-wide Drive crawl without restricted-scope verification"],
      },
      {
        id: "google_gmail",
        providerId: "google",
        label: "Gmail",
        status: "gated_verification_required",
        sourceKinds: ["google_gmail_message"],
        scopes: [gmailScope],
        whyPennyCanUseThis: "Email can become private Brain memory and searchable context only after explicit user consent.",
        userExplanation: "Gmail is restricted-scope, gated, and private.",
        supportedNow: ["Consent through Nango", "Read-only private Brain memory sync", "Keyword and semantic email search"],
        notFaked: ["No hidden Gmail import", "No unrestricted mailbox scan", "No modify/compose/send mail access", "No global training use"],
      },
      {
        id: "google_takeout",
        providerId: "google",
        label: "Google Takeout",
        status: "manual_import_only",
        sourceKinds: ["google_takeout_import"],
        scopes: [],
        whyPennyCanUseThis: "Takeout is a manual import path for user-provided archives.",
        userExplanation: "Penny can guide a manual import, but it cannot fetch Takeout archives for you.",
        supportedNow: ["Manual import guidance"],
        notFaked: ["No automatic Takeout API access"],
      },
      {
        id: "google_my_activity",
        providerId: "google",
        label: "My Activity",
        status: "manual_import_only",
        sourceKinds: ["google_my_activity_import"],
        scopes: [],
        whyPennyCanUseThis: "My Activity can only enter Penny through an explicit user-provided export.",
        userExplanation: "Penny will not claim direct Google Search history access.",
        supportedNow: ["Manual import guidance"],
        notFaked: ["No direct Google Search history access"],
      },
      {
        id: "chrome_extension_history",
        providerId: "google",
        label: "Chrome extension seam",
        status: "extension_required",
        sourceKinds: ["browser_history_extension"],
        scopes: [],
        whyPennyCanUseThis: "Browser and search history need explicit extension permissions.",
        userExplanation: "Browser history is future extension work, not part of Google OAuth.",
        supportedNow: ["Extension-required status only"],
        notFaked: ["No browser history access from backend OAuth"],
      },
    ],
  };
}

function documentSummary(): BrainDocumentsData["documents"][number] {
  return {
    id: "session-1",
    sessionId: "session-1",
    scope: {},
    title: "Saved document",
    description: "A saved document for the sidebar test.",
    status: "open",
    originalIdea: "A persisted thought.",
    mainClaim: null,
    strongestOptions: [],
    rejectedOptions: [],
    todoLaterIdeas: [],
    finalRecommendations: [],
    nextActions: [],
    counts: {
      claims: 0,
      edges: 0,
      moves: 0,
      artifacts: 0,
      versions: 0,
    },
    latestArtifact: null,
    lastMove: null,
    createdAt: "2026-05-02T12:00:00.000Z",
    updatedAt: "2026-05-02T12:00:00.000Z",
  };
}

function quickNote(rawIdea: string): BrainRecentIdea {
  return {
    id: "recent-1",
    scope: {},
    sessionId: null,
    kind: "raw_idea",
    title: rawIdea,
    summary: null,
    status: "active",
    rawIdea,
    content: rawIdea,
    payload: {},
    createdAt: "2026-05-02T12:00:00.000Z",
    updatedAt: "2026-05-02T12:00:00.000Z",
  };
}

function memoryProfile(): BrainMemoryProfileData {
  const permission = {
    visibility: "private" as const,
    trainingUse: false as const,
    source: "user_upload" as const,
    allowedUses: ["private_memory" as const, "create_retrieval" as const],
  };
  const source = {
    id: "brain-source-1",
    kind: "markdown" as const,
    label: "Founder workflow notes",
    scope: {},
    privacy: {
      visibility: "private" as const,
      trainingUse: false as const,
      rawRetention: false,
    },
    permission,
    textHash: "hash-1",
    contentLength: 128,
    chunkCount: 1,
    memoryNodeCount: 1,
    createdAt: "2026-05-02T12:00:00.000Z",
    updatedAt: "2026-05-02T12:00:00.000Z",
    fileName: "founder-workflow.md",
  };
  const signal = {
    id: "signal-1",
    kind: "preferred_build_style" as const,
    label: "Small reversible builds",
    summary: "The user prefers small reversible builds with explicit source provenance.",
    weight: 0.9,
    sourceNodeIds: ["memory-node-1"],
    updatedAt: "2026-05-02T12:00:01.000Z",
  };

  return {
    sourceOfTruth: "private_user_memory_sources_chunks_nodes_edges_profile_signals",
    scope: {},
    sources: [source],
    jobs: [
      {
        id: "brain-import-job-1",
        status: "completed",
        sourceImport: source,
        sourceId: source.id,
        errorMessages: [],
        importedAt: "2026-05-02T12:00:00.000Z",
        completedAt: "2026-05-02T12:00:01.000Z",
        counts: {
          sources: 1,
          chunks: 1,
          memoryNodes: 1,
          memoryEdges: 0,
          profileSignals: 1,
        },
      },
    ],
    recentMemoryNodes: [
      {
        id: "memory-node-1",
        type: "preference",
        title: "Preference - Small reversible builds",
        summary: "The user prefers small reversible builds with explicit source provenance.",
        text: "I prefer small reversible builds with explicit source provenance.",
        sourceId: source.id,
        chunkIds: ["brain-chunk-1"],
        confidence: 0.9,
        tags: ["small", "reversible", "builds"],
        labels: ["taste"],
        evidenceLevel: "grounded",
        permission,
        createdAt: "2026-05-02T12:00:01.000Z",
        lastSeenAt: "2026-05-02T12:00:01.000Z",
      },
    ],
    memoryEdges: [],
    profile: {
      recurringInterests: [],
      activeIdeaClusters: [],
      tasteSignals: [signal],
      preferredBuildStyle: [signal],
      commonFrustrations: [],
      privacySafeSummary:
        "Private user memory from 1 imported source. Current recurring topics: founders. No private global training is claimed or enabled.",
    },
    stats: {
      sourceCount: 1,
      chunkCount: 1,
      memoryNodeCount: 1,
      memoryEdgeCount: 0,
      profileSignalCount: 1,
    },
  };
}
