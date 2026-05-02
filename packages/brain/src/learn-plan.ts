import { z } from "zod";

export const LearningPlanSubgroupSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1).max(90),
    teachingParagraph: z.string().trim().min(80).max(720),
    keyMoves: z.array(z.string().trim().min(1).max(160)).min(2).max(4),
    workedExample: z.string().trim().min(40).max(360),
    visualExample: z
      .object({
        title: z.string().trim().min(1).max(90),
        description: z.string().trim().min(40).max(260),
      })
      .strict(),
  })
  .strict();

export const LearningPlanGroupSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1).max(90),
    purpose: z.string().trim().min(30).max(260),
    subgroups: z.array(LearningPlanSubgroupSchema).min(2).max(5),
  })
  .strict();

export const LearningPlanSchema = z
  .object({
    expertRole: z.string().trim().min(12).max(160),
    goal: z.string().trim().min(12).max(260),
    paragraphFit: z.literal("one_subgroup_per_page"),
    groups: z.array(LearningPlanGroupSchema).min(3).max(7),
  })
  .strict();

export type LearningPlan = z.infer<typeof LearningPlanSchema>;

export type LearningPlanInput = {
  rawIdea: string;
  keyInsight: string;
  claims: ReadonlyArray<{ kind: string; text: string }>;
  learnCandidates: ReadonlyArray<{ term: string; whyItMatters?: string; unblockExplanation?: string }>;
  explorationPaths: ReadonlyArray<{ title: string; prompt: string; expectedValue?: string }>;
};

export function buildExpertLearningPlan(input: LearningPlanInput): LearningPlan {
  const rawIdea = clipText(input.rawIdea, 220);
  const keyInsight = clipText(input.keyInsight || input.rawIdea, 220);
  const assumptions = input.claims.filter((claim) => claim.kind === "assumption").map((claim) => claim.text);
  const questions = input.claims.filter((claim) => claim.kind === "question").map((claim) => claim.text);
  const concepts = input.learnCandidates.map((candidate) => candidate.term);
  const expertRole = inferExpertRole(input);
  const groups = [
    group("group-1", "Frame the subject", "An expert starts by making the topic teachable: one goal, one central claim, and a clear boundary.", [
      subgroup("group-1-subgroup-1", "Name the learning goal", paragraph([
        `Treat the prompt as a request to understand ${rawIdea}.`,
        "The first move is not to answer everything; it is to name what mastery would let the learner do.",
        `For this idea, the usable goal is to explain why ${keyInsight} and what would make that explanation fail.`,
      ]), [`Goal: understand ${clipText(input.rawIdea, 120)}`, "Keep the goal actionable.", "Leave broad background outside the frame."], `A good goal turns "${clipText(input.rawIdea, 90)}" into "I can explain the central mechanism and test its weakest assumption."`, "Goal frame", "A simple frame with the prompt entering on the left, the learning goal in the center, and excluded background branching off to the side."),
      subgroup("group-1-subgroup-2", "Find the central claim", paragraph([
        "The central claim is the sentence the rest of the lesson must support, qualify, or reject.",
        `Here, use "${keyInsight}" as the first teachable claim.`,
        "Everything else becomes either evidence, assumption, example, or challenge.",
      ]), ["Write the claim in one sentence.", "Mark which words need explanation.", "Keep side questions attached but secondary."], `The claim is not the whole prompt; it is the one sentence an expert can point at and say, "this is what we are learning."`, "Claim map", "A central claim node with smaller assumption, example, and challenge nodes connected around it."),
      subgroup("group-1-subgroup-3", "Set the useful boundary", paragraph([
        "A strong lesson has edges.",
        "The boundary says which details are needed now and which details can wait until Check or Verify.",
        "This prevents the page from becoming a survey and keeps each subsection small enough to teach in one paragraph.",
      ]), ["Keep only details that change the claim.", "Defer facts that need external evidence.", "Split every extra idea into a later subgroup."], "If a detail does not explain, test, or apply the central claim, it belongs outside this page.", "Boundary sketch", "A boxed lesson area with relevant details inside and deferred questions parked outside the box."),
    ]),
    group("group-2", "Expose the load-bearing assumptions", "After framing, an expert shows what must be true for the claim to survive.", [
      subgroup("group-2-subgroup-1", "List the hidden premises", paragraph([
        `The lesson depends on assumptions such as ${clipText(assumptions[0] ?? "the learner accepting the mechanism behind the claim", 160)}.`,
        "Naming hidden premises makes the topic inspectable.",
        "The learner can now see which pieces are knowledge and which pieces are bets.",
      ]), ["Turn each premise into a claim.", "Use plain language.", "Do not defend the premise yet."], `Hidden premise: "${clipText(assumptions[0] ?? keyInsight, 120)}" must hold before the main claim is strong.`, "Assumption stack", "A vertical stack where the central claim rests on two or three visible premises."),
      subgroup("group-2-subgroup-2", "Sort strong from weak", paragraph([
        "Not every assumption deserves equal attention.",
        `The expert points first at the premise most likely to change the lesson: ${clipText(assumptions[1] ?? assumptions[0] ?? keyInsight, 160)}.`,
        "This keeps effort aimed at the load-bearing weak point instead of easy context.",
      ]), ["Ask what would break the claim.", "Rank assumptions by importance.", "Work the weakest important one first."], "A weak but irrelevant premise can wait; a fragile premise that carries the claim becomes the next learning target.", "Fragility ranking", "Three assumption cards sorted from sturdy to fragile, with the fragile load-bearing card highlighted."),
      subgroup("group-2-subgroup-3", "Connect assumptions to the claim", paragraph([
        "Each assumption should point to the exact part of the claim it supports.",
        "That connection is what lets Penny challenge or revise the lesson later without losing the whole map.",
        "When the learner sees the connection, they know why the assumption matters.",
      ]), ["Draw claim-to-assumption links.", "Name the supported phrase.", "Keep unsupported context out."], `Connect "${clipText(assumptions[0] ?? "the premise", 90)}" to the phrase in the claim it makes possible.`, "Support links", "A claim sentence with underlined phrases and arrows down to the assumptions that support them."),
    ]),
    group("group-3", "Teach through a concrete example", "An expert uses a worked example so the learner sees the idea operating instead of just hearing a definition.", [
      subgroup("group-3-subgroup-1", "Choose the example", paragraph([
        "The example should be small, concrete, and close to the learner's prompt.",
        `Use ${clipText(input.explorationPaths[0]?.title ?? concepts[0] ?? "the first concrete case", 100)} as the worked case.`,
        "A small case lets one page show the whole move without overflowing.",
      ]), ["Pick one case.", "Keep the inputs visible.", "Avoid adding new background."], `Example input: ${clipText(input.explorationPaths[0]?.prompt ?? input.rawIdea, 140)}`, "Example setup", "A before state showing the prompt, one case, and the specific question the example will answer."),
      subgroup("group-3-subgroup-2", "Run the move", paragraph([
        "Now the expert performs the move slowly.",
        "They show what changes when the claim is applied to the example, then name the reason for each change.",
        "This turns the lesson from a statement into a procedure the learner can repeat.",
      ]), ["Apply the claim to the case.", "Explain each transition.", "Stop before opening a second case."], `Apply the central claim to the case and ask: what would we expect to see if "${clipText(keyInsight, 100)}" is true?`, "Worked trace", "A three-column trace labeled input, expert move, and output."),
      subgroup("group-3-subgroup-3", "Name the output", paragraph([
        "The output is the reusable thing the learner gets from the example.",
        "It might be a distinction, a test, a corrected claim, or a next question.",
        "Naming it lets Penny save the learning as graph material instead of leaving it as prose.",
      ]), ["State the result.", "Name the reusable pattern.", "Attach it to the original claim."], "Output: a claim, assumption, or question that can be checked later.", "Output card", "A single result card connected back to the original prompt and forward to the next challenge."),
    ]),
    group("group-4", "Challenge the explanation", "An expert does not stop at clarity; they tests the explanation against the strongest useful objection.", [
      subgroup("group-4-subgroup-1", "Find the strongest objection", paragraph([
        `Use the open question "${clipText(questions[0] ?? input.explorationPaths[0]?.prompt ?? "what would make this fail", 150)}" as the first challenge.`,
        "The strongest objection is not the harshest wording; it is the failure mode that would force the lesson to change.",
        "This protects the learner from memorizing a brittle explanation.",
      ]), ["Ask what would make the claim false.", "Prefer important objections.", "Avoid trivia."], "Challenge: if the load-bearing assumption fails, the central claim must be revised.", "Challenge loop", "A loop from claim to objection to evidence-needed to revision."),
      subgroup("group-4-subgroup-2", "Decide what would change your mind", paragraph([
        "The learner needs a revision rule before they look for evidence.",
        "That rule names what observation, source, counterexample, or user signal would change the claim.",
        "Without this rule, Verify becomes confirmation-seeking.",
      ]), ["Name disconfirming evidence.", "Name confirming evidence.", "Decide the revision threshold."], "If the expected signal is absent, weaken the claim; if the opposite signal appears, revise it.", "Revision threshold", "A balance scale with evidence that would support the claim on one side and evidence that would revise it on the other."),
    ]),
    group("group-5", "Make the learning reusable", "The final expert move is to compress the lesson into a pattern Penny can remember and reuse.", [
      subgroup("group-5-subgroup-1", "Save the pattern", paragraph([
        "A reusable lesson is shorter than the full explanation but more structured than a note.",
        `Save the pattern as: when learning ${clipText(concepts[0] ?? input.rawIdea, 100)}, frame the claim, expose assumptions, work one example, and challenge the weak point.`,
        "This makes the learning available to Brain, Check, and Verify.",
      ]), ["Compress the lesson.", "Keep the graph links.", "Preserve the weak point."], "Saved pattern: frame -> assumptions -> example -> challenge -> reusable claim.", "Pattern card", "A compact card with the reusable pattern and links to the claim and assumption it came from."),
      subgroup("group-5-subgroup-2", "Prepare the next question", paragraph([
        "The next question should continue the same graph instead of starting a generic chat.",
        `A good next question is: ${clipText(questions[0] ?? input.explorationPaths[0]?.prompt ?? "Which assumption should be checked first?", 180)}`,
        "That question gives the next Learn, Check, or Verify move a real target.",
      ]), ["Use the unresolved weak point.", "Point to a claim or assumption.", "Make the next action obvious."], "Next: turn the unresolved question into a Check or Verify target.", "Next-step arrow", "An arrow from the saved pattern to the next question and then into Check or Verify."),
    ]),
  ];

  return LearningPlanSchema.parse({
    expertRole,
    goal: goalFrom(input.rawIdea),
    paragraphFit: "one_subgroup_per_page",
    groups,
  });
}

function group(id: string, title: string, purpose: string, subgroups: LearningPlan["groups"][number]["subgroups"]): LearningPlan["groups"][number] {
  return { id, title, purpose, subgroups };
}

function subgroup(
  id: string,
  title: string,
  teachingParagraph: string,
  keyMoves: string[],
  workedExample: string,
  visualTitle: string,
  visualDescription: string,
): LearningPlan["groups"][number]["subgroups"][number] {
  return { id, title, teachingParagraph, keyMoves, workedExample, visualExample: { title: visualTitle, description: visualDescription } };
}

function inferExpertRole(input: LearningPlanInput): string {
  const text = `${input.rawIdea} ${input.learnCandidates.map((candidate) => candidate.term).join(" ")}`.toLowerCase();

  if (/\b(startup|founder|customer|pricing|revenue|market|sales|onboarding)\b/.test(text)) {
    return "A startup strategy expert teaching the idea through claims, assumptions, examples, and decision tests.";
  }

  if (/\b(code|software|api|backend|frontend|algorithm|database|system)\b/.test(text)) {
    return "A senior technical instructor teaching the system through concepts, traces, examples, and failure modes.";
  }

  if (/\bessay|writing|thesis|argument|research|source|evidence\b/.test(text)) {
    return "A research and argumentation expert teaching the topic through claims, evidence, examples, and counterarguments.";
  }

  return "A field expert teaching the topic by turning it into a clear claim, inspectable assumptions, examples, and challenges.";
}

function goalFrom(rawIdea: string): string {
  const compact = clipText(rawIdea, 180);

  if (/^i\s+(want|need|would like|am trying)/i.test(compact)) {
    return compact;
  }

  return `I want to understand how ${compact} works.`;
}

function paragraph(sentences: string[]): string {
  return sentences.join(" ");
}

function clipText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 1).trimEnd()}.`;
}
