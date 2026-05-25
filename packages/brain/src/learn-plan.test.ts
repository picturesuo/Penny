import assert from "node:assert/strict";
import test from "node:test";
import { LearnSessionV2Schema, buildExpertLearningPlan, buildLearnSessionV2, learningBlueprintFor, type LearningPlan } from "./learn-plan.ts";

test("learningBlueprintFor chooses researched lenses for from-scratch and operator topics", () => {
  const fromScratch = learningBlueprintFor({
    rawIdea: "Teach me AI engineering from scratch.",
    keyInsight: "AI engineering should be learned from primitives before frameworks.",
    claims: [],
    learnCandidates: [{ term: "AI engineering" }],
    explorationPaths: [],
    sourceContext: null,
  });
  const operator = learningBlueprintFor({
    rawIdea: "Teach me how Elon Musk would use first principles to evaluate a startup pricing bet.",
    keyInsight: "The bet should reduce to constraints, mechanisms, and decision tests.",
    claims: [],
    learnCandidates: [{ term: "first principles" }],
    explorationPaths: [],
    sourceContext: null,
  });

  assert.equal(fromScratch.id, "from_scratch_builder");
  assert.match(fromScratch.visualFrame, /Primitive -> trace -> test -> artifact/);
  assert.match(fromScratch.artifactMove, /reusable artifact/i);
  assert.equal(operator.id, "first_principles_operator");
  assert.match(operator.expertRole, /without impersonating any public figure/i);
  assert.match(operator.checkMove, /inversion/i);
});

test("buildExpertLearningPlan carries the selected lens into compact lesson material", () => {
  const plan = buildExpertLearningPlan({
    rawIdea: "Teach me RAG from scratch.",
    keyInsight: "RAG connects retrieval, context selection, and answer generation.",
    claims: [
      {
        kind: "assumption",
        text: "The learner needs to see the retrieval primitive before they use a framework.",
      },
    ],
    learnCandidates: [{ term: "retrieval augmented generation" }],
    explorationPaths: [{ title: "Tiny RAG trace", prompt: "Trace question -> chunk -> answer." }],
    sourceContext: null,
  });

  assert.match(plan.expertRole, /from-scratch builder expert/i);
  assert.match(plan.groups[0]?.purpose ?? "", /smallest primitive/i);
  assert.match(plan.groups[0]?.subgroups[0]?.visualExample.description ?? "", /Primitive -> trace -> test -> artifact/);
  assert.match(plan.groups[2]?.subgroups[0]?.teachingParagraph ?? "", /one tiny example/i);
  assert.match(plan.groups[4]?.subgroups[0]?.keyMoves.join(" ") ?? "", /reusable artifact/i);
});

test("buildLearnSessionV2 splits long AI lesson paragraphs before local validation", () => {
  const plan: LearningPlan = {
    expertRole: "A concise expert instructor who turns source material into one-page lessons.",
    goal: "Learn pricing signal reading from interview evidence.",
    paragraphFit: "one_subgroup_per_page",
    groups: [
      group("group-1", "Read the signal", [
        subgroup(
          "group-1-subgroup-1",
          "Separate signal from praise",
          [
            "Start by naming the decision boundary before interpreting the interview, because pricing evidence only matters when it changes what the founder would charge, who would pay, or what moment creates urgency.",
            "Then separate observed buyer behavior from polite encouragement, since compliments can make the idea feel validated while budget requests, repeat usage, and changed priorities are the signals that actually reshape the claim.",
            "Finally write the reusable rule in one sentence so the lesson produces a durable check instead of a broad summary of the whole source.",
          ].join(" "),
        ),
        subgroup("group-1-subgroup-2", "Name the buyer action"),
      ]),
      group("group-2", "Frame the rule", [
        subgroup("group-2-subgroup-1", "Choose the value unit"),
        subgroup("group-2-subgroup-2", "State the revision trigger"),
      ]),
      group("group-3", "Use the result", [
        subgroup("group-3-subgroup-1", "Apply the pricing rule"),
        subgroup("group-3-subgroup-2", "Save the takeaway"),
      ]),
    ],
  };

  const session = buildLearnSessionV2({
    plan,
    rawIdea: "A founder is deciding whether interview praise proves willingness to pay.",
    keyInsight: "Buyer behavior is stronger pricing evidence than compliments.",
    sourceContext: null,
  });
  const splitPages = session.pages.filter((page) => page.id.startsWith("lesson-1-1"));

  assert.equal(LearnSessionV2Schema.safeParse(session).success, true);
  assert.ok(session.pages.length > 6);
  assert.ok(splitPages.length >= 2);
  assert.ok(session.pages.every((page) => page.explanation.length <= 360));
  assert.deepEqual(
    session.pages.map((page) => page.lessonNumber),
    session.pages.map((_, index) => index + 1),
  );
});

function group(id: string, title: string, subgroups: LearningPlan["groups"][number]["subgroups"]): LearningPlan["groups"][number] {
  return {
    id,
    title,
    purpose: `${title} gives the learner a scoped, bite-sized lecture unit tied to the pricing decision.`,
    subgroups,
  };
}

function subgroup(
  id: string,
  title: string,
  teachingParagraph = "This lesson teaches one concrete move for interpreting pricing evidence without turning the whole interview into a vague summary. The learner should leave with a reusable rule they can apply to the current claim.",
): LearningPlan["groups"][number]["subgroups"][number] {
  return {
    id,
    title,
    oneLineGoal: `Learn how to ${title.toLowerCase()} in the current pricing lesson.`,
    teachingParagraph,
    teachingSections: [
      {
        title: "Boundary",
        body: "Keep the lesson focused on one decision boundary so the learner can tell what evidence changes the claim.",
      },
      {
        title: "Move",
        body: "Use the strongest observed behavior as the signal, then compare it with weaker commentary or praise.",
      },
      {
        title: "Result",
        body: "Write the resulting rule as a sentence the learner can reuse in the next Check or Verify pass.",
      },
    ],
    keyMoves: [
      "Name the decision boundary.",
      "Separate observed behavior from praise.",
      "Write the reusable rule.",
    ],
    misconceptions: ["Treating encouragement as proof that a buyer will pay."],
    workedExample: "A buyer asking for pricing this month is stronger evidence than saying the idea sounds useful someday.",
    visualExample: {
      title: `${title} map`,
      description: "A compact map that turns source evidence into one pricing rule for the current claim.",
    },
  };
}
