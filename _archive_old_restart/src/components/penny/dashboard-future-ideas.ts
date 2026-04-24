export const dashboardFutureIdeas = {
  foundation: [
    {
      title: "Lens",
      copy: "A bounded user model built from high-confidence shapes, current goals, active claims, and only the precedents needed for the next answer.",
    },
    {
      title: "Overrides",
      copy: "Every disagreement becomes a move with an explicit failure mode so Penny can learn from the exact reason the user pushed back.",
    },
    {
      title: "Precedents",
      copy: "Seed cases and failure modes give the system a real retrieval substrate instead of generic web search or vague similarity matching.",
    },
  ],
  community: [
    {
      title: "Precedent contributions",
      copy: "Users can optionally contribute anonymized, structured post-mortems so the failure corpus grows as a commons instead of a private stash.",
    },
    {
      title: "Cross-user provenance",
      copy: "When two users hold claims from the same source, Penny can flag source-level contradiction only through privacy-safe aggregation.",
    },
    {
      title: "Research mode",
      copy: "Aggregate unresolved patterns can surface as public anonymized research for researchers, journalists, and funders.",
    },
    {
      title: "Thought-partner matching",
      copy: "Optional one-to-one matching connects users with structurally similar questions without turning the product into a feed.",
    },
  ],
  curriculum: [
    {
      title: "Student mode tunnel",
      copy: "Capture claims, stress-test structure, teach through confusion, synthesize an outline, then hand prose off to downstream AI.",
    },
    {
      title: "Instructor surface",
      copy: "With permission, teachers can inspect the structural progression of thinking across a project and grade process, not just output.",
    },
    {
      title: "Classroom shape views",
      copy: "Aggregate patterns across a class so instructors can see bottlenecks like students abandoning at the counterargument stage.",
    },
    {
      title: "Metacognition rubrics",
      copy: "Evaluate the shapes visible in the traversal, not only the final artifact, so students are rewarded for better thinking.",
    },
    {
      title: "Curriculum packs",
      copy: "Pre-built tunnel variants for investment theses, research proposals, product specs, and argumentative essays with task-specific exit criteria.",
    },
  ],
  hiddenSurfaces: [
    "foundation stack",
    "advanced features",
    "community",
    "curriculum",
    "calibration surfaces",
    "shape dashboard",
    "notification preferences",
    "memory and time",
    "switching-cost layer",
  ],
} as const;
