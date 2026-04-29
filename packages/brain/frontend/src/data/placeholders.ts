import type { BrainMove, ExplorationPath } from "../types/brain";

export const placeholderProblems = [
  {
    title: "Sentence Title",
    children: ["problem", "idea", "idea"],
  },
  {
    title: "problem",
    children: ["idea", "idea"],
  },
  {
    title: "problem",
    children: ["idea", "idea"],
  },
  {
    title: "problem",
    children: ["idea", "idea"],
  },
  {
    title: "problem",
    children: ["idea", "idea"],
  },
  {
    title: "problem",
    children: ["idea", "idea"],
  },
  {
    title: "problem",
    children: ["idea", "idea"],
  },
];

export const placeholderPaths: ExplorationPath[] = Array.from({ length: 8 }, () => ({
  title: "Pathway explained",
  prompt: "Reasoning",
  expectedValue: "Reasoning",
}));

export const placeholderMoves: BrainMove[] = Array.from({ length: 6 }, (_, index) => ({
  id: `placeholder-${index}`,
  type: "placeholder",
  actor: "Penny",
  summary: "Placeholder",
  createdAt: "Time",
}));
