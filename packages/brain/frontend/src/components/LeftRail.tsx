import { useEffect, useMemo, useState } from "react";
import type { BrainClaim, WorkStructure, WorkStructureStep, WorkStructureStepStatus, WorkStructureType } from "../types/brain";
import { Section } from "./Section";

interface LeftRailProps {
  claims: BrainClaim[];
  workStructure?: WorkStructure | null;
  focusedClaimId: string | null;
  focusedWorkStructureStepId?: string | null;
  suggestedClaimId: string | null;
  onClaimSelect: (claimId: string) => void;
  onWorkStructureSelect?: (step: WorkStructureStep) => void;
}

type StructureDefinition = {
  id: string;
  title: string;
  description: string;
  stepIds: string[];
  children?: StructureChildTemplate[];
};

type StructureChildTemplate = {
  id: string;
  title: string;
  description: string;
};

type StructureChild = {
  id: string;
  aspectId: string;
  label: string;
  title: string;
  description: string;
  status: WorkStructureStepStatus;
  step?: WorkStructureStep;
  claimId?: string;
};

type StructureBox = {
  id: string;
  label: string;
  title: string;
  description: string;
  status: WorkStructureStepStatus;
  steps: WorkStructureStep[];
  children: StructureChild[];
};

export function LeftRail({
  claims,
  workStructure,
  focusedClaimId,
  focusedWorkStructureStepId,
  suggestedClaimId,
  onClaimSelect,
  onWorkStructureSelect,
}: LeftRailProps) {
  const structureType = workStructure?.structureType ?? inferStructureTypeFromClaims(claims);
  const boxes = useMemo(() => buildStructureBoxes(workStructure ?? null, claims, structureType), [claims, structureType, workStructure]);
  const preferredOpenBoxId = useMemo(
    () => preferredStructureBoxId(boxes, workStructure ?? null, focusedClaimId, focusedWorkStructureStepId ?? null, suggestedClaimId),
    [boxes, focusedClaimId, focusedWorkStructureStepId, suggestedClaimId, workStructure],
  );
  const boxIdsKey = boxes.map((box) => box.id).join("|");
  const [openBoxId, setOpenBoxId] = useState<string | null>(preferredOpenBoxId ?? boxes[0]?.id ?? null);

  useEffect(() => {
    setOpenBoxId(preferredOpenBoxId ?? boxes[0]?.id ?? null);
  }, [boxIdsKey, preferredOpenBoxId]);

  function handleBoxSelect(box: StructureBox) {
    setOpenBoxId(box.id);

    const targetStep = box.steps.find((step) => step.status === "active") ?? box.steps[0] ?? null;

    if (targetStep) {
      onWorkStructureSelect?.(targetStep);
    }
  }

  function handleChildSelect(child: StructureChild) {
    if (child.step) {
      onWorkStructureSelect?.(child.step);
      return;
    }

    if (child.claimId) {
      onClaimSelect(child.claimId);
    }
  }

  return (
    <aside className="left-rail" aria-label="Structure map">
      <Section title="STRUCTURE" className="structure-map-section">
        <div className="structure-helper-row">
          <p className="structure-helper">A full type-specific structure, always visible.</p>
          <QuickSelectKey />
        </div>
        <div className="structure-box-list" role="tree" aria-label={`${formatStructureType(structureType)} structure`}>
          {boxes.map((box) => (
            <StructureBoxRow
              key={box.id}
              box={box}
              open={box.id === openBoxId}
              onSelect={() => handleBoxSelect(box)}
              onChildSelect={handleChildSelect}
            />
          ))}
        </div>
      </Section>
    </aside>
  );
}

function QuickSelectKey() {
  const [lastKey, setLastKey] = useState("Key");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      setLastKey(formatPressedKey(event));
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="quick-select-corner" aria-live="polite" aria-label={`Last key pressed: ${lastKey}`}>
      <kbd>{lastKey}</kbd>
    </div>
  );
}

function StructureBoxRow({
  box,
  open,
  onSelect,
  onChildSelect,
}: {
  box: StructureBox;
  open: boolean;
  onSelect: () => void;
  onChildSelect: (child: StructureChild) => void;
}) {
  return (
    <article className={`structure-box is-${box.status}${open ? " is-open" : ""}`} role="treeitem" aria-expanded={open}>
      <button type="button" className="structure-box-main" onClick={onSelect}>
        <span className="structure-box-index" aria-hidden="true">{box.label}</span>
        <span className="structure-box-copy">
          <strong title={box.title}>{box.title}</strong>
          <small title={box.description}>{box.description}</small>
        </span>
        <span className="structure-status-label">{statusLabel(box.status)}</span>
      </button>
      {open ? (
        <div className="structure-subgroup" role="group">
          {box.children.length > 0 ? (
            box.children.map((child) => (
              <StructureChildRow
                key={child.id}
                child={child}
                onSelect={() => onChildSelect(child)}
              />
            ))
          ) : (
            <div className="structure-child is-empty">
              <span className="structure-child-index" aria-hidden="true" />
              <span className="structure-child-copy">
                <strong>No subgroup yet</strong>
                <small>This section is visible but has not been filled.</small>
              </span>
              <span className="structure-status-label">Missing</span>
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}

function StructureChildRow({
  child,
  onSelect,
}: {
  child: StructureChild;
  onSelect: () => void;
}) {
  const interactive = Boolean(child.step || child.claimId);

  return (
    <button
      type="button"
      className={`structure-child is-${child.status}`}
      disabled={!interactive}
      onClick={interactive ? onSelect : undefined}
    >
      <span className="structure-child-index">{child.label}</span>
      <span className="structure-child-copy">
        <strong title={child.title}>{child.title}</strong>
        <small title={child.description}>{child.description}</small>
      </span>
      <span className="structure-status-label">{statusLabel(child.status)}</span>
    </button>
  );
}

function buildStructureBoxes(
  workStructure: WorkStructure | null,
  claims: BrainClaim[],
  structureType: WorkStructureType,
): StructureBox[] {
  const steps = [...(workStructure?.steps ?? [])].sort((left, right) => left.rank - right.rank || left.title.localeCompare(right.title));
  const stepsById = new Map(steps.map((step) => [step.id, step]));
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  const usedStepIds = new Set<string>();
  const definitions = structureDefinitions[structureType] ?? structureDefinitions.general;
  const laterDefinition = definitions[definitions.length - 1] as StructureDefinition;
  const boxes = definitions.slice(0, -1).map((definition) => {
    const matchedSteps = definition.stepIds.flatMap((stepId) => {
      const step = stepsById.get(stepId);

      return step ? [step] : [];
    });

    matchedSteps.forEach((step) => usedStepIds.add(step.id));

    return structureBoxFromDefinition(definition, matchedSteps, claimsById);
  });
  const laterSteps = laterDefinition.stepIds.flatMap((stepId) => {
    const step = stepsById.get(stepId);

    return step ? [step] : [];
  });

  laterSteps.forEach((step) => usedStepIds.add(step.id));

  const extraBoxes = steps
    .filter((step) => !usedStepIds.has(step.id))
    .map((step) =>
      structureBoxFromDefinition(
        {
          id: `extra:${step.id}`,
          title: step.title,
          description: step.purpose,
          stepIds: [step.id],
        },
        [step],
        claimsById,
      ),
    );
  const laterBox = structureBoxFromDefinition(
    {
      ...laterDefinition,
      id: "to_do_later",
      title: "To Do Later",
      description: "Parked work and unresolved pieces",
    },
    laterSteps,
    claimsById,
  );

  return labelStructureBoxes([...boxes, ...extraBoxes, laterBox]);
}

function structureBoxFromDefinition(
  definition: StructureDefinition,
  steps: WorkStructureStep[],
  claimsById: Map<string, BrainClaim>,
): StructureBox {
  const status = structureBoxStatus(steps);
  const stepChildren = steps.flatMap((step) => childrenFromStep(step, claimsById));
  const templateChildren = (definition.children ?? []).map((child, index) => ({
    id: `template:${definition.id}:${child.id}`,
    aspectId: child.id,
    label: "",
    title: child.title,
    description: child.description,
    status: templateChildStatus(status, index),
  }));
  const children = uniqueChildren([...stepChildren, ...templateChildren]);

  return {
    id: definition.id,
    label: "",
    title: definition.title,
    description: steps[0]?.purpose ?? definition.description,
    status,
    steps,
    children,
  };
}

function childrenFromStep(
  step: WorkStructureStep,
  claimsById: Map<string, BrainClaim>,
): StructureChild[] {
  const detailChildren = step.detailChoices.map((choice, index) => ({
    id: `choice:${step.id}:${choice.id}`,
    aspectId: choice.id,
    label: "",
    title: cleanChoiceLabel(choice.label),
    description: choice.description,
    status: childStatusFromParent(step.status, index),
    step,
  }));
  const claimChildren = step.claimIds.flatMap((claimId) => {
    const claim = claimsById.get(claimId);

    return claim
      ? [
          {
            id: `claim:${step.id}:${claim.id}`,
            aspectId: claimAspectId(step, claim),
            label: "",
            title: formatClaimTitle(claim.kind),
            description: claim.text,
            status: step.status,
            claimId: claim.id,
          },
        ]
      : [];
  });

  if (detailChildren.length > 0) {
    return [...detailChildren, ...claimChildren.slice(0, 2)];
  }

  return [
    {
      id: `step:${step.id}:purpose`,
      aspectId: step.id,
      label: "",
      title: step.title,
      description: step.whyNow || step.purpose,
      status: step.status,
      step,
    },
    ...claimChildren.slice(0, 2),
  ];
}

function uniqueChildren(children: StructureChild[]): StructureChild[] {
  const seen = new Set<string>();
  const unique: StructureChild[] = [];

  for (const child of children) {
    const key = child.aspectId.trim().toLowerCase();

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(child);
  }

  return unique.slice(0, 6);
}

function labelStructureBoxes(boxes: StructureBox[]): StructureBox[] {
  return boxes.map((box, index) => {
    const boxLabel = String(index + 1);
    const aspectNumbers = new Map<string, number>();
    let nextAspectNumber = 1;

    const children = box.children.map((child) => {
      const aspectKey = child.aspectId.trim().toLowerCase();
      const aspectNumber = aspectNumbers.get(aspectKey) ?? nextAspectNumber++;

      aspectNumbers.set(aspectKey, aspectNumber);

      return {
        ...child,
        label: `${boxLabel}.${aspectNumber}`,
      };
    });

    return {
      ...box,
      label: boxLabel,
      children,
    };
  });
}

function claimAspectId(step: WorkStructureStep, claim: BrainClaim): string {
  if (step.id === "working_thesis") {
    return "claim";
  }

  return `claim:${claim.kind}`;
}

function preferredStructureBoxId(
  boxes: StructureBox[],
  workStructure: WorkStructure | null,
  focusedClaimId: string | null,
  focusedWorkStructureStepId: string | null,
  suggestedClaimId: string | null,
): string | null {
  const targetStepId =
    focusedWorkStructureStepId ??
    workStructure?.steps.find((step) => focusedClaimId && step.claimIds.includes(focusedClaimId))?.id ??
    workStructure?.steps.find((step) => suggestedClaimId && step.claimIds.includes(suggestedClaimId))?.id ??
    workStructure?.activeStepId ??
    null;

  if (targetStepId) {
    const containingBox = boxes.find((box) => box.steps.some((step) => step.id === targetStepId));

    if (containingBox) {
      return containingBox.id;
    }
  }

  return boxes.find((box) => box.status === "active")?.id ?? boxes[0]?.id ?? null;
}

function structureBoxStatus(steps: WorkStructureStep[]): WorkStructureStepStatus {
  if (steps.length === 0) {
    return "not_started";
  }

  if (steps.some((step) => step.status === "active")) {
    return "active";
  }

  if (steps.every((step) => step.status === "resolved")) {
    return "resolved";
  }

  if (steps.some((step) => step.status === "stale")) {
    return "stale";
  }

  return "not_started";
}

function childStatusFromParent(status: WorkStructureStepStatus, index: number): WorkStructureStepStatus {
  if (status === "active") {
    return index === 0 ? "active" : "not_started";
  }

  return status;
}

function templateChildStatus(status: WorkStructureStepStatus, index: number): WorkStructureStepStatus {
  if (status === "resolved") {
    return "resolved";
  }

  if (status === "active" && index === 0) {
    return "active";
  }

  return "not_started";
}

function statusLabel(status: WorkStructureStepStatus): string {
  switch (status) {
    case "active":
      return "Current";
    case "resolved":
      return "Complete";
    case "stale":
      return "Stale";
    case "not_started":
      return "Missing";
  }
}

function cleanChoiceLabel(label: string): string {
  return label.replace(/\s+choice$/i, "");
}

function formatClaimTitle(kind: string): string {
  return `${formatLabel(kind)} claim`;
}

function formatStructureType(type: WorkStructureType): string {
  return formatLabel(type);
}

function formatLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inferStructureTypeFromClaims(claims: BrainClaim[]): WorkStructureType {
  const text = claims.map((claim) => claim.text).join(" ").toLowerCase();

  if (hasAny(text, ["essay", "expos", "thesis", "course", "counterargument"])) {
    return "essay";
  }

  if (hasAny(text, ["startup", "customer", "market", "product", "pricing"])) {
    return "startup";
  }

  if (hasAny(text, ["research", "study", "hypothesis", "method", "dataset"])) {
    return "research";
  }

  if (hasAny(text, ["decision", "option", "tradeoff", "choose"])) {
    return "decision";
  }

  return "general";
}

function hasAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function formatPressedKey(event: KeyboardEvent): string {
  const modifierPrefix = [
    event.metaKey && event.key !== "Meta" ? "Cmd+" : "",
    event.ctrlKey && event.key !== "Control" ? "Ctrl+" : "",
    event.altKey && event.key !== "Alt" ? "Alt+" : "",
    event.shiftKey && event.key !== "Shift" && event.key.length > 1 ? "Shift+" : "",
  ].join("");

  return `${modifierPrefix}${keyLabel(event.key)}`;
}

function keyLabel(key: string): string {
  switch (key) {
    case " ":
    case "Spacebar":
      return "Space";
    case "ArrowUp":
      return "Up";
    case "ArrowRight":
      return "Right";
    case "ArrowDown":
      return "Down";
    case "ArrowLeft":
      return "Left";
    case "Escape":
      return "Esc";
    case "Backspace":
      return "Back";
    case "Delete":
      return "Del";
    case "Enter":
      return "Enter";
    case "Tab":
      return "Tab";
    case "Meta":
      return "Cmd";
    case "Control":
      return "Ctrl";
    default:
      return key.length === 1 ? key.toUpperCase() : key.replace(/^Key|^Digit/, "");
  }
}

const structureDefinitions: Record<WorkStructureType, StructureDefinition[]> = {
  essay: [
    {
      id: "topic_boundary",
      title: "Topic Boundary",
      description: "Bound the topic",
      stepIds: ["bound_topic"],
      children: [
        { id: "scope", title: "Scope Limit", description: "What the paper will include" },
        { id: "exclusions", title: "Exclusions", description: "What the paper will leave out" },
      ],
    },
    {
      id: "working_thesis",
      title: "Working Thesis",
      description: "Thesis candidate",
      stepIds: ["working_thesis"],
      children: [
        { id: "claim", title: "Claim Shape", description: "The sentence the essay can defend" },
        { id: "stakes", title: "Stakes", description: "Why the claim matters" },
      ],
    },
    {
      id: "course_fit",
      title: "Course Fit",
      description: "Fit to assignment",
      stepIds: ["assignment_fit"],
      children: [
        { id: "expectations", title: "Expectations", description: "What the prompt expects" },
        { id: "lens", title: "Lens / Perspective", description: "Which theoretical lens fits" },
        { id: "key_concepts", title: "Key Concepts", description: "Core concepts to use" },
        { id: "evidence_standard", title: "Evidence Standard", description: "Type / depth of evidence" },
        { id: "success_criteria", title: "Success Criteria", description: "How this will be evaluated" },
      ],
    },
    {
      id: "evidence_buckets",
      title: "Evidence Buckets",
      description: "Organize support",
      stepIds: ["specific_evidence"],
      children: [
        { id: "primary", title: "Primary Evidence", description: "Concrete local examples" },
        { id: "secondary", title: "Secondary Evidence", description: "Academic support" },
      ],
    },
    {
      id: "counterargument",
      title: "Counterargument",
      description: "Anticipate objections",
      stepIds: ["counterargument"],
      children: [
        { id: "strongest_objection", title: "Strongest Objection", description: "The critique most likely to land" },
        { id: "response", title: "Response", description: "Defend, revise, or absorb" },
      ],
    },
    {
      id: "outline",
      title: "Outline",
      description: "Structure the argument",
      stepIds: ["essay_outline"],
      children: [
        { id: "order", title: "Argument Order", description: "How the paper should unfold" },
        { id: "sections", title: "Section Jobs", description: "What each paragraph must do" },
      ],
    },
    {
      id: "missing_pieces",
      title: "Missing Pieces",
      description: "What's not here yet",
      stepIds: ["pressure_test"],
      children: [
        { id: "weak_link", title: "Weak Link", description: "What would make the essay collapse" },
        { id: "open_question", title: "Open Question", description: "What still needs an answer" },
      ],
    },
  ],
  startup: [
    { id: "customer", title: "Customer", description: "Who has the problem", stepIds: ["customer"] },
    { id: "pain", title: "Pain", description: "Why it matters now", stepIds: ["pain"] },
    { id: "wedge", title: "Wedge", description: "First product surface", stepIds: ["wedge"] },
    { id: "business_model", title: "Business Model", description: "How it can work", stepIds: ["business_model"] },
    { id: "challenge", title: "Challenge", description: "Riskiest assumption", stepIds: ["challenge"] },
    { id: "artifact", title: "Output", description: "Brief or map", stepIds: ["artifact"] },
  ],
  research: [
    { id: "question", title: "Question", description: "Research scope", stepIds: ["question"] },
    { id: "literature", title: "Literature", description: "Relevant precedent", stepIds: ["literature"] },
    { id: "method", title: "Method", description: "Evidence design", stepIds: ["method"] },
    { id: "challenge", title: "Validity", description: "Confounds and pressure", stepIds: ["challenge"] },
    { id: "plan", title: "Plan", description: "Research output", stepIds: ["plan"] },
  ],
  decision: [
    { id: "options", title: "Options", description: "Available paths", stepIds: ["options"] },
    { id: "criteria", title: "Criteria", description: "How to choose", stepIds: ["criteria"] },
    { id: "evidence", title: "Evidence", description: "What supports each path", stepIds: ["evidence"] },
    { id: "tradeoff", title: "Tradeoff", description: "Downside and risk", stepIds: ["tradeoff"] },
    { id: "decision_brief", title: "Decision Brief", description: "Final artifact", stepIds: ["decision_brief"] },
  ],
  general: [
    { id: "clarify", title: "Core Claim", description: "Make it specific", stepIds: ["clarify"] },
    { id: "assumptions", title: "Assumptions", description: "What must be true", stepIds: ["assumptions"] },
    { id: "evidence", title: "Evidence", description: "What would prove it", stepIds: ["evidence"] },
    { id: "challenge", title: "Challenge", description: "What could break it", stepIds: ["challenge"] },
    { id: "artifact", title: "Output", description: "Useful next artifact", stepIds: ["artifact"] },
  ],
};
