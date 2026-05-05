import { z } from "zod";

export const LearningPlanSubgroupSchema = z
  .object({
    id: z.string().trim().min(1),
    title: z.string().trim().min(1).max(90),
    oneLineGoal: z.string().trim().min(20).max(220),
    teachingParagraph: z.string().trim().min(80).max(720),
    teachingSections: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(80),
            body: z.string().trim().min(40).max(360),
          })
          .strict(),
      )
      .length(3),
    keyMoves: z.array(z.string().trim().min(1).max(160)).min(2).max(4),
    misconceptions: z.array(z.string().trim().min(1).max(220)).min(1).max(4),
    workedExample: z.string().trim().min(40).max(360),
    visualExample: z
      .object({
        title: z.string().trim().min(1).max(90),
        description: z.string().trim().min(40).max(260),
      })
      .strict(),
    sourceContext: z
      .object({
        clusterId: z.string().trim().min(1),
        clusterTitle: z.string().trim().min(1).max(90),
        localSummary: z.string().trim().min(20).max(360),
        sourceRange: z.string().trim().min(1).max(80),
      })
      .strict()
      .optional(),
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
  sourceContext?: LearningSourceContext | null;
};

export type LearningSourceCluster = {
  id: string;
  title: string;
  summary: string;
  sourceRange: string;
};

export type LearningSourceContext = {
  kind: "text" | "pdf" | "slides" | "document";
  fileName: string | null;
  mainIdea: string;
  clusters: LearningSourceCluster[];
};

export const LearnVisualTypeSchema = z.enum(["diagram", "latex", "image", "code", "comparison", "concept_map"]);

export const LearnSourceSpanV2Schema = z
  .object({
    sourceId: z.string().trim().min(1),
    label: z.string().trim().min(1).max(90),
    text: z.string().trim().min(1).max(260),
    sourceRange: z.string().trim().min(1).max(90).optional(),
  })
  .strict();

export const LearnVisualV2Schema = z
  .object({
    type: LearnVisualTypeSchema,
    title: z.string().trim().min(1).max(90),
    description: z.string().trim().min(20).max(260),
    body: z.string().trim().min(1).max(520),
    items: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(60),
            text: z.string().trim().min(1).max(180),
          })
          .strict(),
      )
      .min(1)
      .max(5)
      .optional(),
  })
  .strict();

export const LearnPageV2Schema = z
  .object({
    id: z.string().trim().min(1),
    lessonNumber: z.number().int().min(1),
    title: z.string().trim().min(1).max(90),
    explanation: z.string().trim().min(40).max(360),
    visual: LearnVisualV2Schema,
    quickCheck: z.string().trim().min(20).max(220),
    takeaway: z.string().trim().min(20).max(180),
    sourceSpans: z.array(LearnSourceSpanV2Schema).max(3),
  })
  .strict();

export const LearnSessionV2Schema = z
  .object({
    version: z.literal("learn_session_v2"),
    goal: z.string().trim().min(12).max(260),
    pages: z.array(LearnPageV2Schema).min(1).max(40),
    visualTypes: z.array(LearnVisualTypeSchema).min(1).max(6),
    sourceOfTruth: z.literal("ai_generated_learn_pages_validated_locally"),
  })
  .strict();

export type LearnVisualType = z.infer<typeof LearnVisualTypeSchema>;
export type LearnVisualV2 = z.infer<typeof LearnVisualV2Schema>;
export type LearnPageV2 = z.infer<typeof LearnPageV2Schema>;
export type LearnSessionV2 = z.infer<typeof LearnSessionV2Schema>;

export type LearnSessionV2Input = {
  plan: LearningPlan;
  rawIdea: string;
  keyInsight: string;
  sourceContext?: LearningSourceContext | null;
};

export function buildExpertLearningPlan(input: LearningPlanInput): LearningPlan {
  const rawIdea = clipText(input.rawIdea, 220);
  const keyInsight = clipText(input.keyInsight || input.rawIdea, 220);
  const assumptions = input.claims.filter((claim) => claim.kind === "assumption").map((claim) => claim.text);
  const questions = input.claims.filter((claim) => claim.kind === "question").map((claim) => claim.text);
  const concepts = input.learnCandidates.map((candidate) => candidate.term);
  const expertRole = inferExpertRole(input);
  const sourceGroups = sourceContextGroups(input);
  const groups = sourceGroups.length
    ? sourceGroups
    : [
    group("group-1", "Understand the target", "An expert starts like a careful agent: identify the real goal, the usable end state, and the boundary of the work.", [
      subgroup("group-1-subgroup-1", "Name the end state", paragraph([
        `Treat the prompt as a request to understand ${rawIdea}.`,
        "The first move is not to answer everything; it is to name what mastery would let the learner do.",
        `For this idea, the usable goal is to explain why ${keyInsight} and what would make that explanation fail.`,
      ]), [`End state: understand ${clipText(input.rawIdea, 120)}`, "Keep the goal actionable.", "Leave broad background outside the frame."], `A good end state turns "${clipText(input.rawIdea, 90)}" into "I can explain the central mechanism and test its weakest assumption."`, "Goal frame", "A simple frame with the prompt entering on the left, the end state in the center, and excluded background branching off to the side."),
      subgroup("group-1-subgroup-2", "Identify the main object", paragraph([
        "The central claim is the sentence the rest of the lesson must support, qualify, or reject.",
        `Here, use "${keyInsight}" as the first teachable claim.`,
        "Everything else becomes either evidence, assumption, example, or challenge.",
      ]), ["Write the claim in one sentence.", "Mark which words need explanation.", "Keep side questions attached but secondary."], `The claim is not the whole prompt; it is the one sentence an expert can point at and say, "this is what we are learning."`, "Claim map", "A central claim node with smaller assumption, example, and challenge nodes connected around it."),
      subgroup("group-1-subgroup-3", "Define done for this lesson", paragraph([
        "A strong lesson has edges.",
        "The boundary says which details are needed now and which details can wait until Check or Verify.",
        "This prevents the page from becoming a survey and keeps each subsection small enough to teach in one paragraph.",
      ]), ["Keep only details that change the claim.", "Defer facts that need external evidence.", "Split every extra idea into a later subgroup."], "If a detail does not explain, test, or apply the central claim, it belongs outside this page.", "Boundary sketch", "A boxed lesson area with relevant details inside and deferred questions parked outside the box."),
    ]),
    group("group-2", "Break it into work chunks", "After the target is clear, an expert decomposes the work into the claims, assumptions, and questions that must be handled.", [
      subgroup("group-2-subgroup-1", "List the required pieces", paragraph([
        `The lesson depends on assumptions such as ${clipText(assumptions[0] ?? "the learner accepting the mechanism behind the claim", 160)}.`,
        "Naming hidden premises makes the topic inspectable.",
        "The learner can now see which pieces are knowledge and which pieces are bets.",
      ]), ["Turn each premise into a claim.", "Use plain language.", "Do not defend the premise yet."], `Hidden premise: "${clipText(assumptions[0] ?? keyInsight, 120)}" must hold before the main claim is strong.`, "Assumption stack", "A vertical stack where the central claim rests on two or three visible premises."),
      subgroup("group-2-subgroup-2", "Order the chunks", paragraph([
        "Not every assumption deserves equal attention.",
        `The expert points first at the premise most likely to change the lesson: ${clipText(assumptions[1] ?? assumptions[0] ?? keyInsight, 160)}.`,
        "This keeps effort aimed at the load-bearing weak point instead of easy context.",
      ]), ["Ask what would break the claim.", "Rank assumptions by importance.", "Work the weakest important one first."], "A weak but irrelevant premise can wait; a fragile premise that carries the claim becomes the next learning target.", "Fragility ranking", "Three assumption cards sorted from sturdy to fragile, with the fragile load-bearing card highlighted."),
      subgroup("group-2-subgroup-3", "Connect each chunk to the goal", paragraph([
        "Each assumption should point to the exact part of the claim it supports.",
        "That connection is what lets Penny challenge or revise the lesson later without losing the whole map.",
        "When the learner sees the connection, they know why the assumption matters.",
      ]), ["Draw claim-to-assumption links.", "Name the supported phrase.", "Keep unsupported context out."], `Connect "${clipText(assumptions[0] ?? "the premise", 90)}" to the phrase in the claim it makes possible.`, "Support links", "A claim sentence with underlined phrases and arrows down to the assumptions that support them."),
    ]),
    group("group-3", "Work the chunks", "An expert then does the work in small, visible passes so each subgroup teaches one useful move.", [
      subgroup("group-3-subgroup-1", "Choose the first case", paragraph([
        "The example should be small, concrete, and close to the learner's prompt.",
        `Use ${clipText(input.explorationPaths[0]?.title ?? concepts[0] ?? "the first concrete case", 100)} as the worked case.`,
        "A small case lets one page show the whole move without overflowing.",
      ]), ["Pick one case.", "Keep the inputs visible.", "Avoid adding new background."], `Example input: ${clipText(input.explorationPaths[0]?.prompt ?? input.rawIdea, 140)}`, "Example setup", "A before state showing the prompt, one case, and the specific question the example will answer."),
      subgroup("group-3-subgroup-2", "Do the expert move", paragraph([
        "Now the expert performs the move slowly.",
        "They show what changes when the claim is applied to the example, then name the reason for each change.",
        "This turns the lesson from a statement into a procedure the learner can repeat.",
      ]), ["Apply the claim to the case.", "Explain each transition.", "Stop before opening a second case."], `Apply the central claim to the case and ask: what would we expect to see if "${clipText(keyInsight, 100)}" is true?`, "Worked trace", "A three-column trace labeled input, expert move, and output."),
      subgroup("group-3-subgroup-3", "Capture the result", paragraph([
        "The output is the reusable thing the learner gets from the example.",
        "It might be a distinction, a test, a corrected claim, or a next question.",
        "Naming it lets Penny save the learning as graph material instead of leaving it as prose.",
      ]), ["State the result.", "Name the reusable pattern.", "Attach it to the original claim."], "Output: a claim, assumption, or question that can be checked later.", "Output card", "A single result card connected back to the original prompt and forward to the next challenge."),
    ]),
    group("group-4", "Check the work", "An expert does not stop at completion; they tests the explanation against the strongest useful objection.", [
      subgroup("group-4-subgroup-1", "Find the failure point", paragraph([
        `Use the open question "${clipText(questions[0] ?? input.explorationPaths[0]?.prompt ?? "what would make this fail", 150)}" as the first challenge.`,
        "The strongest objection is not the harshest wording; it is the failure mode that would force the lesson to change.",
        "This protects the learner from memorizing a brittle explanation.",
      ]), ["Ask what would make the claim false.", "Prefer important objections.", "Avoid trivia."], "Challenge: if the load-bearing assumption fails, the central claim must be revised.", "Challenge loop", "A loop from claim to objection to evidence-needed to revision."),
      subgroup("group-4-subgroup-2", "Set the revision rule", paragraph([
        "The learner needs a revision rule before they look for evidence.",
        "That rule names what observation, source, counterexample, or user signal would change the claim.",
        "Without this rule, Verify becomes confirmation-seeking.",
      ]), ["Name disconfirming evidence.", "Name confirming evidence.", "Decide the revision threshold."], "If the expected signal is absent, weaken the claim; if the opposite signal appears, revise it.", "Revision threshold", "A balance scale with evidence that would support the claim on one side and evidence that would revise it on the other."),
      subgroup("group-4-subgroup-3", "Run a counterexample", paragraph([
        "A useful counterexample is small enough to inspect but strong enough to threaten the claim.",
        `Test the lesson against ${clipText(questions[1] ?? questions[0] ?? "the most plausible opposite case", 150)} before treating it as learned.`,
        "This gives Ask Penny and Verify a narrow local context instead of reopening the whole topic.",
      ]), ["Pick one counterexample.", "Apply the revision rule.", "Keep only the changed claim visible."], "Counterexample pass: one case, one expected failure, one decision about whether the claim survives.", "Counterexample pass", "A single counterexample card passing through the revision rule and producing keep, weaken, or revise."),
      subgroup("group-4-subgroup-4", "Mark what still needs evidence", paragraph([
        "The check ends by separating what the learner now understands from what still requires evidence.",
        "This prevents a good explanation from pretending to be verified fact.",
        "The remaining evidence need becomes the next Check or Verify target in the same thinking graph.",
      ]), ["Name understood claims.", "Name evidence gaps.", "Send unresolved facts to Check or Verify."], "Evidence gap: a claim can be well explained and still need a source, measurement, or real-world test.", "Evidence ledger", "A ledger with understood claims on the left and unresolved evidence needs on the right."),
    ]),
    group("group-5", "Finish with a usable result", "The final expert move is to compress the lesson into a result Penny can remember, reuse, and continue from.", [
      subgroup("group-5-subgroup-1", "Produce the final takeaway", paragraph([
        "A reusable lesson is shorter than the full explanation but more structured than a note.",
        `Save the pattern as: when learning ${clipText(concepts[0] ?? input.rawIdea, 100)}, frame the claim, expose assumptions, work one example, and challenge the weak point.`,
        "This makes the learning available to Brain, Check, and Verify.",
      ]), ["Compress the lesson.", "Keep the graph links.", "Preserve the weak point."], "Saved pattern: frame -> assumptions -> example -> challenge -> reusable claim.", "Pattern card", "A compact card with the reusable pattern and links to the claim and assumption it came from."),
      subgroup("group-5-subgroup-2", "Decide the next action", paragraph([
        "The next question should continue the same graph instead of starting a generic chat.",
        `A good next question is: ${clipText(questions[0] ?? input.explorationPaths[0]?.prompt ?? "Which assumption should be checked first?", 180)}`,
        "That question gives the next Learn, Check, or Verify move a real target.",
      ]), ["Use the unresolved weak point.", "Point to a claim or assumption.", "Make the next action obvious."], "Next: turn the unresolved question into a Check or Verify target.", "Next-step arrow", "An arrow from the saved pattern to the next question and then into Check or Verify."),
      subgroup("group-5-subgroup-3", "Save the graph hook", paragraph([
        "The final output should point back to the claim, assumption, or concept it changes.",
        "That hook is what lets a later session resume the work without replaying the whole lesson.",
        "If the hook is missing, the result is just prose instead of durable Penny material.",
      ]), ["Choose the graph node.", "Attach the takeaway.", "Keep the unresolved edge visible."], "Graph hook: save the takeaway beside the exact claim or assumption it updates, not beside the whole source prompt.", "Graph hook", "A takeaway card attached to one graph node with an unresolved evidence edge still visible."),
      subgroup("group-5-subgroup-4", "Close the category context", paragraph([
        "When the learner leaves this numbered category, the local Ask Penny context should close with it.",
        "The next category starts fresh so the assistant does not keep spending attention on old examples.",
        "The durable output is the takeaway and graph hook, not the transient chat thread.",
      ]), ["End the local context.", "Carry forward only saved takeaways.", "Start the next category clean."], "Context close: keep the saved result, drop the category chat, and move forward with a smaller prompt.", "Context handoff", "A closed category folder handing only a takeaway card into the next numbered category."),
    ]),
    ];

  return LearningPlanSchema.parse({
    expertRole,
    goal: goalFrom(input.rawIdea),
    paragraphFit: "one_subgroup_per_page",
    groups,
  });
}

export function buildLearnSessionV2(input: LearnSessionV2Input): LearnSessionV2 {
  const pages = repairAndSplitLearnPages(
    input.plan.groups.flatMap((group, groupIndex) =>
      group.subgroups.map((subgroup, subgroupIndex) =>
        pageFromSubgroup({
          group,
          subgroup,
          groupIndex,
          subgroupIndex,
          rawIdea: input.rawIdea,
          keyInsight: input.keyInsight,
          sourceContext: input.sourceContext ?? null,
        }),
      ),
    ),
  ).map((page, index) => ({ ...page, lessonNumber: index + 1 }));
  const parsedPages = pages.map((page) => LearnPageV2Schema.parse(page));
  const visualTypes = [...new Set(parsedPages.map((page) => page.visual.type))];

  return LearnSessionV2Schema.parse({
    version: "learn_session_v2",
    goal: input.plan.goal,
    pages: parsedPages,
    visualTypes,
    sourceOfTruth: "ai_generated_learn_pages_validated_locally",
  });
}

function pageFromSubgroup({
  group,
  subgroup,
  groupIndex,
  subgroupIndex,
  rawIdea,
  keyInsight,
  sourceContext,
}: {
  group: LearningPlan["groups"][number];
  subgroup: LearningPlan["groups"][number]["subgroups"][number];
  groupIndex: number;
  subgroupIndex: number;
  rawIdea: string;
  keyInsight: string;
  sourceContext: LearningSourceContext | null;
}): LearnPageV2 {
  const explanation = conciseExplanation(subgroup.teachingParagraph, subgroup.teachingSections);
  const quickCheck = quickCheckForSubgroup(group, subgroup, rawIdea, keyInsight);
  const takeaway = takeawayForSubgroup(subgroup, keyInsight);

  return {
    id: `lesson-${groupIndex + 1}-${subgroupIndex + 1}`,
    lessonNumber: 1,
    title: subgroup.title,
    explanation,
    visual: visualForSubgroup(subgroup, rawIdea),
    quickCheck,
    takeaway,
    sourceSpans: sourceSpansForSubgroup(subgroup, sourceContext, rawIdea),
  };
}

function repairAndSplitLearnPages(pages: LearnPageV2[]): LearnPageV2[] {
  return pages.flatMap((page) => {
    if (page.explanation.length <= 360) {
      return [page];
    }

    const chunks = chunkSentences(page.explanation, 320);

    return chunks.map((chunk, index) => ({
      ...page,
      id: `${page.id}-${index + 1}`,
      title: index === 0 ? page.title : clipText(`${page.title} continued`, 90),
      explanation: ensureMinimumLength(chunk, page.takeaway),
      quickCheck: index === chunks.length - 1 ? page.quickCheck : `Before continuing: ${clipText(page.takeaway, 180)}`,
      takeaway: index === chunks.length - 1 ? page.takeaway : clipText(page.takeaway, 180),
    }));
  });
}

function conciseExplanation(
  teachingParagraph: string,
  sections: LearningPlan["groups"][number]["subgroups"][number]["teachingSections"],
): string {
  const sectionText = sections.map((section) => `${section.title}: ${section.body}`).join(" ");
  const firstPass = firstSentences(teachingParagraph, 2);
  const candidate = firstPass.length >= 80 ? firstPass : firstSentences(`${teachingParagraph} ${sectionText}`, 3);

  return ensureMinimumLength(candidate, teachingParagraph);
}

function visualForSubgroup(
  subgroup: LearningPlan["groups"][number]["subgroups"][number],
  rawIdea: string,
): LearnVisualV2 {
  const visualText = `${subgroup.title} ${subgroup.teachingParagraph} ${subgroup.workedExample} ${subgroup.visualExample.title} ${subgroup.visualExample.description}`;
  const type = inferVisualType(visualText, rawIdea);
  const items = visualItemsForType(type, subgroup) ?? [];

  return LearnVisualV2Schema.parse({
    type,
    title: subgroup.visualExample.title,
    description: subgroup.visualExample.description,
    body: visualBodyForType(type, subgroup),
    ...(items.length ? { items } : {}),
  });
}

function inferVisualType(text: string, rawIdea: string): LearnVisualType {
  const compact = `${text} ${rawIdea}`.toLowerCase();

  if (/```|function\s|const\s|let\s|class\s|import\s|def\s|api|code|algorithm/.test(compact)) {
    return "code";
  }

  if (/[=∫∑]|derivative|equation|formula|calculate|probability|slope|integral|latex/.test(compact)) {
    return "latex";
  }

  if (/\b(compare|versus|vs\.?|rather than|instead of|not the same|tradeoff)\b/.test(compact)) {
    return "comparison";
  }

  if (/\b(image|photo|screenshot|diagram from source|slide)\b/.test(compact)) {
    return "image";
  }

  if (/\b(loop|trace|flow|path|arrow|threshold|stack|sequence)\b/.test(compact)) {
    return "diagram";
  }

  return "concept_map";
}

function visualItemsForType(
  type: LearnVisualType,
  subgroup: LearningPlan["groups"][number]["subgroups"][number],
): NonNullable<LearnVisualV2["items"]> {
  const moves = subgroup.keyMoves.slice(0, type === "comparison" ? 2 : 4);

  if (type === "comparison") {
    return [
      { label: "Use", text: moves[0] ?? subgroup.workedExample },
      { label: "Do not use", text: subgroup.misconceptions[0] ?? "A broad summary that hides the lesson's decision point." },
    ];
  }

  if (type === "latex") {
    return [
      { label: "Variable", text: "Name what changes." },
      { label: "Rule", text: "Write the formula or relationship." },
      { label: "Meaning", text: subgroup.workedExample },
    ];
  }

  return moves.map((move, index) => ({ label: `Step ${index + 1}`, text: move }));
}

function visualBodyForType(
  type: LearnVisualType,
  subgroup: LearningPlan["groups"][number]["subgroups"][number],
): string {
  switch (type) {
    case "latex":
      return "$$\\text{input} \\rightarrow \\text{rule} \\rightarrow \\text{interpreted result}$$";
    case "code":
      return [
        "const input = currentLesson;",
        "const output = applyOneMove(input);",
        "return check(output);",
      ].join("\n");
    case "comparison":
      return `${subgroup.keyMoves[0] ?? subgroup.title} | ${subgroup.misconceptions[0] ?? "A tempting but weak alternative"}`;
    case "image":
      return subgroup.visualExample.description;
    case "diagram":
      return `${subgroup.title} -> ${subgroup.keyMoves[0] ?? "apply"} -> ${clipText(subgroup.workedExample, 140)}`;
    case "concept_map":
      return [subgroup.title, ...subgroup.keyMoves.slice(0, 3)].join(" -> ");
  }
}

function quickCheckForSubgroup(
  group: LearningPlan["groups"][number],
  subgroup: LearningPlan["groups"][number]["subgroups"][number],
  rawIdea: string,
  keyInsight: string,
): string {
  const subject = clipText(keyInsight || rawIdea, 120);
  const move = subgroup.keyMoves[0] ?? subgroup.workedExample;

  if (group.id.startsWith("source-group")) {
    return clipText(`Your turn: explain how "${clipText(subgroup.title, 80)}" changes the source's main claim in one sentence.`, 220);
  }

  return clipText(`Your turn: apply "${clipText(move, 90)}" to "${subject}" in one sentence.`, 220);
}

function takeawayForSubgroup(
  subgroup: LearningPlan["groups"][number]["subgroups"][number],
  keyInsight: string,
): string {
  return clipText(`${subgroup.title}: ${subgroup.workedExample || subgroup.keyMoves[0] || keyInsight}`, 180);
}

function sourceSpansForSubgroup(
  subgroup: LearningPlan["groups"][number]["subgroups"][number],
  sourceContext: LearningSourceContext | null,
  rawIdea: string,
): LearnPageV2["sourceSpans"] {
  if (subgroup.sourceContext) {
    return [
      {
        sourceId: subgroup.sourceContext.clusterId,
        label: clipText(subgroup.sourceContext.clusterTitle, 90),
        text: clipText(subgroup.sourceContext.localSummary, 260),
        sourceRange: clipText(subgroup.sourceContext.sourceRange, 90),
      },
    ];
  }

  if (sourceContext?.clusters[0]) {
    const cluster = sourceContext.clusters[0];

    return [{ sourceId: cluster.id, label: clipText(cluster.title, 90), text: clipText(cluster.summary, 260), sourceRange: clipText(cluster.sourceRange, 90) }];
  }

  return [{ sourceId: "source.raw_idea", label: "Source idea", text: clipText(rawIdea, 240) }];
}

function firstSentences(text: string, count: number): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, count)
    .join(" ");
}

function chunkSentences(text: string, maxLength: number): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences.length ? sentences : [text]) {
    const next = current ? `${current} ${sentence}` : sentence;

    if (next.length > maxLength && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.map((chunk) => clipText(chunk, maxLength)).filter(Boolean);
}

function ensureMinimumLength(value: string, fallback: string): string {
  const compact = value.trim();

  if (compact.length >= 40) {
    return compact;
  }

  return clipText(`${compact} ${fallback}`.trim(), 360);
}

function sourceContextGroups(input: LearningPlanInput): LearningPlan["groups"] {
  const context = input.sourceContext;

  if (!context?.clusters.length) {
    return [];
  }

  const maxGroups = context.clusters.slice(0, 7);

  return maxGroups.map((cluster, index) => {
    const nextCluster = maxGroups[index + 1];

    return group(
      `source-group-${index + 1}`,
      cluster.title,
      `Teach this ${context.kind} cluster as a scoped bite-sized lecture unit, keeping Ask Penny context inside ${cluster.sourceRange}.`,
      [
        sourceSubgroup(cluster, index, 1, "Extract the main idea", [
          `Read only ${cluster.sourceRange} first.`,
          `State the local idea: ${clipText(cluster.summary, 130)}`,
          "Do not pull in later clusters until this local point is stable.",
        ]),
        sourceSubgroup(cluster, index, 2, "Break down the mechanism", [
          "Split the cluster into the terms, cause-effect links, examples, and assumptions it uses.",
          "Turn every hidden prerequisite into a visible claim.",
          "Keep each piece tied to this cluster summary.",
        ]),
        sourceSubgroup(cluster, index, 3, "Work one example", [
          "Choose the smallest example or slide detail in this cluster.",
          "Explain what changes from input to output.",
          "Name the reusable pattern the learner can carry forward.",
        ]),
        sourceSubgroup(cluster, index, 4, "Check the takeaway", [
          "Ask what would make this cluster's takeaway misleading.",
          "Separate understood context from evidence that still needs Verify.",
          nextCluster ? `Hand off only the saved takeaway before moving to ${nextCluster.title}.` : "Close the lesson by saving the final takeaway to Brain.",
        ]),
      ],
    );
  });
}

function sourceSubgroup(
  cluster: LearningSourceCluster,
  groupIndex: number,
  subgroupIndex: number,
  title: string,
  keyMoves: string[],
): LearningPlan["groups"][number]["subgroups"][number] {
  return {
    ...subgroup(
      `source-group-${groupIndex + 1}-subgroup-${subgroupIndex}`,
      title,
      paragraph([
        `${cluster.title} is a local context cluster from ${cluster.sourceRange}.`,
        cluster.summary,
        "Teach it as one concise lecture page so the learner can pause, ask questions, and continue without the next cluster leaking in.",
      ]),
      keyMoves,
      `Worked example from ${cluster.sourceRange}: ${clipText(cluster.summary, 220)}`,
      "Cluster context",
      `A source cluster card showing ${cluster.sourceRange}, its local summary, and arrows to its next saved takeaway.`,
    ),
    sourceContext: {
      clusterId: cluster.id,
      clusterTitle: cluster.title,
      localSummary: cluster.summary,
      sourceRange: cluster.sourceRange,
    },
  };
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
  const oneLineGoal = `Learn ${title.toLowerCase()} as one subsection of the current thinking graph.`;
  const teachingSections = [
    {
      title: "Definition",
      body: keyMoves[0]
        ? `First, define the move: ${keyMoves[0]} This gives the subsection a single object to teach instead of a broad topic.`
        : teachingParagraph,
    },
    {
      title: "Application",
      body: keyMoves[1]
        ? `Second, apply it locally: ${keyMoves[1]} Keep the explanation tied to this prompt and this graph node.`
        : teachingParagraph,
    },
    {
      title: "Procedure",
      body: keyMoves[2]
        ? `Third, make it repeatable: ${keyMoves[2]} The learner should leave with one action they can use on the next subsection.`
        : `Third, make it repeatable: ${workedExample}`,
    },
  ];
  const misconceptions = [
    "Do not treat the subsection title as the whole lesson.",
    "Do not add background unless it changes the current claim, assumption, or example.",
  ];

  return {
    id,
    title,
    oneLineGoal,
    teachingParagraph,
    teachingSections,
    keyMoves,
    misconceptions,
    workedExample,
    visualExample: { title: visualTitle, description: visualDescription },
  };
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
