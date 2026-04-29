# Challenge Loop Spec

Status: Wave 5 THINKER contract  
Date: 2026-04-29  
Scope: challenge copy, challenge semantics, and demo challenge language for Thinking Mode

## 1. What Makes A Strong Challenge

A strong Penny challenge is a targeted stress test against a specific claim. It should make the user confront the weakest load-bearing part of their thinking without turning the product into a generic debate bot.

A strong challenge must be:

- Specific: it names the exact claim, assumption, market behavior, dependency, or definition being challenged.
- Load-bearing: it matters because other claims, decisions, or artifacts depend on it.
- Falsifiable enough: the user can say what evidence, reasoning, or revision would change the claim.
- Actionable: the next step is clear enough to answer through Defend, Revise, or Absorb.
- Proportional: it applies more friction to high-stakes, high-confidence, or highly connected claims.
- Non-performative: it does not use clever phrasing to sound skeptical while avoiding the real risk.
- History-aware when possible: it references prior moves, revisions, absorbed critiques, or unsupported confidence when those exist.
- Truth-preserving: it does not mutate the target claim or confidence unless the user explicitly chooses the matching response path.

Weak challenges include:

- Generic skepticism: "Have you validated this?"
- Advice disguised as critique: "You should talk to customers."
- Vibes: "This feels risky."
- Overbroad objections that attack the whole idea instead of the target claim.
- Challenges that cannot be answered except by hand-waving.
- Critiques that introduce a new claim without connecting it to the graph.

Challenge quality bar:

- The user should understand why this challenge was selected.
- The user should know what would count as a real answer.
- The graph should know which claim and edge the challenge attaches to.
- The response should create one of `user_defended`, `claim_revised`, or `critique_absorbed`.

## 2. Failure Types

Failure types are structured critique labels. They are not decoration; they drive challenge selection, Challenge Brief synthesis, future scoring, and later shape analysis.

### `weak_evidence`

The claim depends on evidence that is missing, too thin, too anecdotal, or too indirect.

Use when:

- confidence is high but sources are weak
- the claim sounds plausible but lacks proof
- the user is relying on intuition where evidence should exist

### `missing_counterargument`

The claim has not faced the strongest opposing case.

Use when:

- the user has only argued the positive case
- a credible opposite explanation exists
- the claim would look weaker if a competent skeptic framed the alternative

### `shaky_assumption`

The claim depends on an assumption that may not hold.

Use when:

- the assumption is low-confidence
- multiple claims depend on it
- the assumption concerns behavior, timing, willingness to pay, urgency, distribution, or adoption

### `analogy_break`

The claim relies on an analogy that may not transfer.

Use when:

- the user says something is like a previous company, product, market, or behavior
- the comparison hides a difference in buyer, timing, incentive, context, or constraint

### `dependency_risk`

The claim depends on another claim whose failure would cascade.

Use when:

- a foundation claim supports several downstream claims
- confidence is inconsistent across a dependency edge
- a dependent claim remains confident while its prerequisite is weak

### `unaddressed_precedent`

The claim ignores relevant prior attempts, failures, or known patterns.

Use when:

- similar products, arguments, decisions, or strategies have failed before
- the user is breaking a norm without addressing why the norm exists
- a precedent would change the burden of proof

### `premise_rejection`

The claim may be built on a premise the intended audience does not accept.

Use when:

- the user assumes the buyer, reader, investor, or stakeholder already shares their framing
- disagreement may happen before the argument reaches its evidence

### `definition_failure`

The claim relies on unclear or overloaded language.

Use when:

- important terms are undefined
- two claims appear to use the same term differently
- the user cannot evaluate the claim until the term is pinned down

## 3. Defend Meaning

Defend means: "I believe the critique is wrong, overweighted, or missing context, and I will explain why."

Backend semantics:

- Records `user_defended`.
- Requires user reasoning.
- Leaves the target claim text unchanged.
- Leaves confidence unchanged unless a separate confidence command is accepted.
- Keeps the challenge edge and critique claim as history.
- Can become shape evidence if the user repeatedly overrides certain critique types.

User-facing copy:

- Button label: `Defend`
- Prompt: `Explain why this challenge should not change the claim.`
- Receipt line: `You defended the claim. Penny preserved the critique as history without changing the claim text.`

Defend is not:

- deleting the critique
- proving the claim true forever
- changing confidence automatically
- ending the loop without reasoning

## 4. Revise Meaning

Revise means: "The critique exposes a real flaw, and I want to change the claim."

Backend semantics:

- Records `claim_revised`.
- Requires revised claim text.
- Preserves the old ClaimVersion.
- Creates a new current ClaimVersion.
- Keeps the challenge history attached to the stable Claim identity.
- Does not erase the original claim from the old-selves timeline.
- Does not automatically change dependent claims unless a separate propagation path is accepted.

User-facing copy:

- Button label: `Revise`
- Prompt: `Rewrite the claim so it survives the challenge.`
- Receipt line: `You revised the claim. Penny preserved the previous version and made your revision current.`

Revise is not:

- editing the claim silently
- replacing the stable Claim identity
- deleting the challenge
- a generic note edit

## 5. Absorb Meaning

Absorb means: "The critique is legitimate, but I am not ready to revise yet."

Backend semantics:

- Records `critique_absorbed`.
- Leaves the target claim text unchanged.
- Leaves confidence unchanged unless a separate confidence command is accepted.
- Marks the challenge as an acknowledged vulnerability or unresolved risk.
- Allows Autopilot to later suggest revisiting the absorbed risk.
- Ensures the Challenge Brief includes the unresolved risk when relevant.

User-facing copy:

- Button label: `Absorb`
- Prompt: `Acknowledge this as a live risk without changing the claim yet.`
- Receipt line: `You absorbed the critique. Penny kept the claim unchanged and marked the risk as unresolved.`

Absorb is not:

- agreement that the claim is false
- a revision
- dismissing the critique
- hiding the risk from later synthesis

## 6. Challenge Receipt

A challenge receipt is the structured record shown after Penny issues or resolves a challenge. It proves that challenge state is backend-owned and move-backed.

When a challenge is issued, the receipt should include:

- target claim text
- target claim ID
- critique text
- failure type
- challenge strength: `weak`, `moderate`, or `strong`
- why this challenge was chosen
- what would resolve it
- suggested next response: Defend, Revise, or Absorb
- created move: `challenge_issued`
- challenge edge ID
- critique claim ID

When the user responds, the receipt should include:

- chosen response: Defend, Revise, or Absorb
- created move: `user_defended`, `claim_revised`, or `critique_absorbed`
- target claim ID
- challenge edge ID
- old ClaimVersion ID when Revise occurs
- new ClaimVersion ID when Revise occurs
- unresolved risk marker when Absorb occurs
- confirmation that no claim text changed unless the response was Revise

Receipt copy should be terse. It should confirm the state transition, not congratulate the user or re-argue the critique.

## 7. Exact Demo Challenge

Target claim:

> Pre-seed founders will pay for structured thinking before traction.

Failure type:

`shaky_assumption`

Strength:

`strong`

Challenge copy:

> The risky assumption is not that founders have messy thinking. They do. The risk is that pre-seed founders will pay for structured thinking before traction, when their budget and attention usually go to building, selling, fundraising, or finding customers. If Penny does not create an immediate artifact that helps with one of those urgent jobs, "better thinking" may be admired but deferred.

Why this challenge was chosen:

> This claim is load-bearing because the founder wedge depends on willingness to pay before traction. It is also behaviorally fragile: founders may value clarity in theory while choosing faster, cheaper, or more familiar substitutes under pressure.

What would resolve it:

> Resolve this by naming the urgent pre-seed moment where structured thinking becomes worth paying for now, plus the artifact Penny produces in that moment. A credible answer should distinguish paid urgency from general interest.

Response options:

- Defend: explain why pre-seed founders will pay despite budget and attention pressure.
- Revise: narrow the claim to the founder moment, buyer, or artifact that can plausibly drive payment.
- Absorb: keep the claim but mark willingness-to-pay-before-traction as an unresolved market risk.

Recommended receipt after issue:

> Challenge issued: Penny challenged the willingness-to-pay assumption as a strong `shaky_assumption`. The claim is unchanged until you Defend, Revise, or Absorb.
