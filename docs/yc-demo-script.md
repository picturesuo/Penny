# 90-Second Demo Script

Status: Wave 8 THINKER final demo script
Date: 2026-04-29

## Positioning

One-sentence company description:

> Penny is a controllable AI thinking instrument that turns a messy idea into claims, assumptions, challenges, revisions, and a short Challenge Brief.

Why now:

> AI made generation cheap, but serious builders now need control over reasoning, assumptions, and decision history. Chat is good at producing text; Penny is built for inspecting and improving the structure underneath the text.

Target wedge:

> Early founders making high-stakes strategy, product, fundraising, or market bets before they have enough traction to know which assumptions are true.

What compounds over time:

> Penny compounds through Moves: extracted assumptions, challenge outcomes, claim revisions, absorbed risks, confidence changes, artifacts, and recurring thinking patterns that make future critique sharper.

## Demo Setup

Use a clean session. The founder enters a messy idea, not a polished prompt:

> I think pre-seed founders will pay for a structured thinking autopilot before traction because founder decisions are messy and ChatGPT loses the thread. Penny should map the idea, find weak assumptions, challenge them, and leave me with something I can actually use.

## 90-Second Script

### 0:00-0:10 - Founder enters messy idea

Narration:

> A founder starts with an unpolished idea. Penny does not answer with a wall of advice. It turns the idea into thinking state.

On screen:

- messy seed idea submitted
- new session opens
- source and seed claim appear

Backend receipt:

- `source_recorded`
- `seed_claim_created`

### 0:10-0:22 - Penny extracts assumptions

Narration:

> Penny extracts the claims and assumptions inside the idea. These are not notes. They are graph nodes with confidence and dependency edges.

On screen:

- primary claim
- key assumptions
- dependency edges
- confidence values

Expected assumptions:

- pre-seed founders feel enough pain to pay before traction
- structured thinking is more useful than generic AI chat for this job
- the product can produce a concrete founder artifact fast enough to matter

Backend receipt:

- `assumptions_extracted`

### 0:22-0:35 - Autopilot highlights load-bearing weakness

Narration:

> Autopilot picks the next highest-leverage thinking move. It highlights the willingness-to-pay assumption because the rest of the idea depends on it.

On screen:

- selected pressure point: `Pre-seed founders will pay for structured thinking before traction.`
- graph highlight on the dependency path
- suggested next move

Backend receipt:

- `next_move_recomputed`
- persisted `next_move_candidates`
- `FocusState.source = "autopilot_suggestion"`

### 0:35-0:45 - Penny explains why

Narration:

> Penny explains the choice before doing anything. The issue is not whether founders have messy thinking. The issue is whether they will pay for structured thinking before traction.

On screen:

- why chosen
- reason codes: `shaky_assumption`, `load_bearing`, `market_risk`
- target claim and edge refs available for audit
- founder clicks "Go there" to start the suggested challenge focus

Backend receipt:

- `autopilot_focus_started`

### 0:45-1:00 - Penny challenges it

Narration:

> Now Penny issues the challenge. It is specific, pressure-tested, and answerable.

Challenge copy:

> The risky assumption is not that founders have messy thinking. They do. The risk is that pre-seed founders will pay for structured thinking before traction, when their budget and attention usually go to building, selling, fundraising, or finding customers. If Penny does not create an immediate artifact that helps with one of those urgent jobs, "better thinking" may be admired but deferred.

On screen:

- failure type: `shaky_assumption`
- strength: `strong`
- response options: Defend, Revise, Absorb

Backend receipt:

- `challenge_issued`

### 1:00-1:15 - Founder revises

Narration:

> The founder chooses Revise. Penny does not overwrite history. It preserves the old version and makes the narrower claim current.

Founder revision:

> Pre-seed founders will pay for structured thinking when it produces an immediate fundraising, positioning, or product-decision artifact they can use that week.

On screen:

- old claim version
- new claim version
- revision reason

Backend receipt:

- `claim_revised`
- previous ClaimVersion preserved
- new current ClaimVersion created

### 1:15-1:28 - Penny produces Challenge Brief

Narration:

> Penny turns the loop into a short thinking receipt: original idea, current claim, assumptions, pressure point, challenge, response, what changed, open risks, and the move timeline.

On screen:

- compact Challenge Brief
- before/after claim change
- open risk: prove the urgent paid founder moment

Backend receipt:

- `artifact_created`

### 1:28-1:30 - Penny suggests next move

Narration:

> Penny does not end with generic advice. It gives the next thinking move: test the revised paid-use case against one real founder workflow.

On screen:

- recommended next move
- target claim or edge
- expected completion move

## Close

> That is Penny: not a chatbot that generates more text, but a controllable thinking instrument where every meaningful step becomes durable thinking state.

## Success Bar

- The first visible value is structure, not prose.
- The pressure point is load-bearing and founder-specific.
- Penny explains why before challenging.
- Revise preserves the old claim version.
- The Challenge Brief is short enough to scan.
- The final next move is concrete and non-generic.
