# V0 Challenge Brief Spec

Status: Wave 6 THINKER contract  
Date: 2026-04-29  
Scope: V0 Challenge Brief sections, copy intent, and artifact boundaries

## Purpose

The V0 Challenge Brief is a thinking receipt. It proves what Penny did with the user's idea: what it extracted, what it challenged, how the user responded, what changed, and what should happen next.

It is not a wiki, essay, memo, or transcript. Keep it short, auditable, and tied to backend-owned state.

## Artifact Rules

- Source of truth: claims, current claim versions, edges, moves, sources, source spans, and existing artifacts.
- Creation move: `artifact_created`.
- Artifact kind: `challenge_brief` or `idea_map_challenge_brief`.
- Do not invent claims, evidence, user responses, or history.
- Prefer bullets over prose blocks.
- Use current claim text unless the section explicitly discusses old versions.
- Include IDs in payloads; UI may hide them.
- Target length: 400 to 700 words total for V0.

## Sections

### 1. Original Seed Idea

Purpose: remind the user what started the session.

Content:

- raw seed text, lightly cleaned only for formatting
- source ID

Length: 1 sentence or quote.

### 2. Current Primary Claim

Purpose: show the current strongest version of the user's main claim.

Content:

- current primary claim text
- confidence, if available
- current ClaimVersion ID in payload

Length: 1 sentence plus optional confidence.

### 3. Key Assumptions

Purpose: show the load-bearing assumptions Penny extracted or used.

Content:

- 3 to 5 assumptions
- confidence per assumption
- mark low-confidence or highly connected assumptions

Length: short bullets.

### 4. Selected Pressure Point

Purpose: identify the claim or edge Penny chose to stress-test.

Content:

- target claim text
- target claim ID
- relevant dependency or challenge edge ID
- failure type

Length: 1 to 2 bullets.

### 5. Why Penny Chose It

Purpose: make Autopilot's reasoning legible.

Content:

- 1 to 3 reason codes
- short plain-English rationale
- mention load-bearing status, low confidence, high unsupported confidence, open challenge, or unresolved risk when applicable

Length: 2 to 3 bullets.

### 6. Challenge Issued

Purpose: preserve the actual stress test.

Content:

- challenge text
- strength: `weak`, `moderate`, or `strong`
- what would resolve it
- `challenge_issued` move ID

Length: 1 short paragraph plus one resolution bullet.

### 7. User Response

Purpose: record the user's explicit response path.

Content:

- response: `Defend`, `Revise`, or `Absorb`
- response reasoning, if provided
- created move: `user_defended`, `claim_revised`, or `critique_absorbed`

Length: 1 to 3 bullets.

If no response exists, say: `No response recorded yet.`

### 8. What Changed

Purpose: show state changes without pretending the artifact is source of truth.

Content:

- revised claim text if `Revise`
- previous ClaimVersion ID and current ClaimVersion ID if `Revise`
- acknowledged risk if `Absorb`
- unchanged claim note if `Defend`

Length: 1 to 4 bullets.

If nothing changed, say exactly what stayed unchanged.

### 9. Open Risks

Purpose: carry unresolved thinking forward.

Content:

- absorbed critiques
- unanswered challenge edges
- low-confidence assumptions still supporting the primary claim
- high-confidence claims without support

Length: 2 to 5 bullets.

### 10. Recommended Next Move

Purpose: end with one concrete next thinking action.

Content:

- one recommended action
- target claim or edge
- why it is next
- expected completion move, if known

Length: 1 sentence.

### 11. Move Timeline Summary

Purpose: provide a compact audit trail.

Content:

- 5 to 8 meaningful moves in order
- move kind
- terse summary
- timestamp or relative order

Length: compact list.

## V0 Output Shape

```json
{
  "kind": "challenge_brief",
  "title": "Challenge Brief",
  "sections": {
    "originalSeedIdea": "...",
    "currentPrimaryClaim": "...",
    "keyAssumptions": [],
    "selectedPressurePoint": "...",
    "whyPennyChoseIt": [],
    "challengeIssued": "...",
    "userResponse": "...",
    "whatChanged": [],
    "openRisks": [],
    "recommendedNextMove": "...",
    "moveTimelineSummary": []
  },
  "refs": {
    "sourceIds": [],
    "claimIds": [],
    "claimVersionIds": [],
    "edgeIds": [],
    "moveIds": [],
    "artifactIds": []
  }
}
```

## Acceptance Criteria

- The brief contains all 11 sections.
- The brief can be generated from persisted Penny state only.
- The brief records what changed and what did not change.
- The brief exposes one recommended next move.
- The brief remains short enough to scan in under two minutes.
- The brief does not become a wiki page or generic AI summary.
