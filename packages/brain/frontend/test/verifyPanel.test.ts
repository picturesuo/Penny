import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VerifyResultDetails } from "../src/components/VerifyPanel";
import type { BrainVerifyConfidenceDecisionResponse, BrainVerifyResult } from "../src/types/brain";

test("Verify result renders evidence cards, citations, saved evidence state, and confidence controls", () => {
  const markup = renderToStaticMarkup(
    createElement(VerifyResultDetails, {
      result: verifyResult(),
      decision: null,
      disabled: false,
      isRunning: false,
      onConfidenceDecision() {},
    }),
  );

  assert.match(markup, /Evidence cards/);
  assert.match(markup, /Used web because/);
  assert.match(markup, /Verify requires source grounding/);
  assert.match(markup, /Sources used/);
  assert.match(markup, /Search result source/);
  assert.match(markup, /Founder workflow survey/);
  assert.match(markup, /Example Source/);
  assert.match(markup, /href="https:\/\/example.test\/source"/);
  assert.match(markup, /Founders report urgency around fundraising choices/);
  assert.match(markup, /Evidence Saved/);
  assert.match(markup, /Accept Confidence Change/);
  assert.match(markup, /Confidence suggestion/);
  assert.match(markup, /-4/);
  assert.match(markup, /Still unsupported/);
  assert.match(markup, /A direct payment test/);
});

test("Verify result renders an accepted confidence decision note", () => {
  const markup = renderToStaticMarkup(
    createElement(VerifyResultDetails, {
      result: verifyResult(),
      decision: confidenceDecision(),
      disabled: false,
      isRunning: false,
      onConfidenceDecision() {},
    }),
  );

  assert.match(markup, /Confidence moved from 42% to 38%/);
});

function verifyResult(): BrainVerifyResult {
  return {
    verdict: "mixed",
    summary: "Evidence supports urgency, but not the full payment claim.",
    evidenceCards: [
      {
        title: "Founder workflow survey",
        summary: "Founders report urgency around fundraising choices.",
        stance: "supports",
        sourceName: "Example Source",
        sourceUrl: "https://example.test/source",
        citation: "Founders report urgency around fundraising choices.",
      },
    ],
    citations: [
      {
        title: "Founder workflow survey",
        sourceName: "Example Source",
        sourceUrl: "https://example.test/source",
        citation: "Founders report urgency around fundraising choices.",
      },
    ],
    unsupportedParts: [
      {
        part: "Will pay",
        reason: "Urgency is not purchase intent.",
        neededEvidence: "A direct payment test.",
      },
    ],
    confidenceDeltaSuggestion: -4,
    whatWouldChangeThis: "Run a direct willingness-to-pay test.",
    nextQuestion: "Which founders paid for the workflow?",
    recipe: {
      steps: [],
    },
    targetClaim: targetClaim(42),
    move: {
      id: uuidAt(501),
      kind: "verify_run",
      summary: "Verified a founder workflow claim.",
      claimIds: [uuidAt(301)],
      edgeIds: [],
      artifactIds: [],
    },
    brainRun: {
      id: uuidAt(601),
      status: "succeeded",
    },
    citationSources: [
      {
        evidenceTitle: "Founder workflow survey",
        source: {
          id: uuidAt(701),
          kind: "verification_citation",
          rawText: "Founders report urgency around fundraising choices.",
        },
        sourceSpan: {
          id: uuidAt(801),
          sourceId: uuidAt(701),
          claimId: uuidAt(301),
          claimVersionId: uuidAt(401),
          label: "verify_evidence",
        },
      },
    ],
    searchTrace: {
      mode: "verify",
      decision: {
        mode: "verify",
        useWebSearch: true,
        depth: "deep",
        reason: "Verify requires source grounding when search is available.",
        reasonCodes: ["verify_requires_sources"],
        signals: ["verify_source_grounding"],
        query: "Founders will pay for clearer decision support.",
        filters: {},
      },
      providerName: "xai",
      providerToolAvailable: true,
      providerToolAttached: true,
      toolOptions: {
        enableImageUnderstanding: false,
      },
      resultCount: 1,
      results: [
        {
          title: "Search result source",
          url: "https://example.test/search",
          snippet: "Independent source result used by Verify.",
          sourceType: "web",
        },
      ],
      savedSourceIds: [uuidAt(701)],
      savedSourceSpanIds: [uuidAt(801)],
    },
    confidenceUpdate: {
      suggestedDelta: -4,
      autoApplied: false,
      decision: "pending_user_decision",
    },
  };
}

function confidenceDecision(): BrainVerifyConfidenceDecisionResponse["data"] {
  return {
    decision: "accept",
    targetClaim: targetClaim(38),
    move: {
      id: uuidAt(502),
      kind: "confidence_update_accepted",
      summary: "Accepted Verify confidence update.",
      claimIds: [uuidAt(301)],
      edgeIds: [],
      artifactIds: [],
    },
    confidenceUpdate: {
      verifyMoveId: uuidAt(501),
      suggestedDelta: -4,
      accepted: true,
      previousConfidence: 42,
      currentConfidence: 38,
      appliedDelta: -4,
      cascade: [],
    },
  };
}

function targetClaim(confidence: number) {
  return {
    id: uuidAt(301),
    versionId: confidence === 42 ? uuidAt(401) : uuidAt(402),
    kind: "assumption",
    status: "exploratory",
    text: "Founders will pay for clearer decision support.",
    confidence,
  };
}

function uuidAt(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
