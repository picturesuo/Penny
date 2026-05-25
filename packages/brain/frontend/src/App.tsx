import { useEffect, useState } from "react";
import {
  createChallengeBrief,
  createLearnSession,
  fetchBrainYcFounderFixtureImport,
  type LearnSourceMaterialInput,
  fetchBrainHybridSearch,
  fetchBrainDocuments,
  fetchBrainRecents,
  fetchSessionCockpit,
  importBrainSource,
  keepBrainRecentIdea,
  issueChallengeFromCandidate,
  respondToChallenge,
  saveBrainObject,
  seedBrain,
  selectAutopilotNode,
  startAutopilotCandidate,
  tickAutopilot,
  updateBrainRecentStatus,
  verifyClaim,
} from "./api/brainClient";
import { buildAutopilotStartIntent, runAutopilotGoThere, type PennyMode } from "./autopilotUx";
import { BrainWorkspace } from "./components/BrainWorkspace";
import { CodebaseBrainPanel } from "./components/CodebaseBrainPanel";
import { clearCreateWorkspaceDraftStorage, CreateWorkspace } from "./components/CreateWorkspace";
import { Header } from "./components/Header";
import { LandingPage } from "./components/LandingPage";
import { LearnWorkspace } from "./components/LearnWorkspace";
import { formatLabel, shortId } from "./lib/format";
import type {
  AutopilotTickData,
  BrainData,
  BrainDocumentSummary,
  BrainDocumentsData,
  BrainHybridSearchResponse,
  BrainMemoryProfileData,
  BrainMove,
  BrainRecentIdea,
  MemoryNode,
  CanvasNode,
  CanvasNodeAction,
  ChallengeResponseKind,
  RespondToChallengeResponse,
  SessionCockpitData,
  WorkStructureStep,
} from "./types/brain";

type ChallengeResponseDraft =
  | {
      response: "defend";
      reasoning: string;
    }
  | {
      response: "revise";
      revisedText: string;
      reasoning?: string;
    }
  | {
      response: "absorb";
      reasoning?: string;
    };

type BrainRelatedSearchState = BrainHybridSearchResponse["data"];
type QuickNoteAction = "build" | "brain" | "check" | "learn" | "archive" | "restore";
type PersistedCreateWorkspaceBoot = {
  version: 1;
  updatedAt: number;
  seedText: string;
  brainProfile: BrainMemoryProfileData | null;
  activeMode?: "Create" | "Learn";
  learnFocusNode?: CanvasNode | null;
};

const ACTIVE_SESSION_KEY = "penny.activeSessionId";
const CREATE_WORKSPACE_BOOT_KEY = "penny.createWorkspaceBoot.v1";
const SESSION_QUERY_PARAM = "sessionId";
const LOCAL_DEMO_MODE_STATUS = "Local demo mode";
export const pennyYcCreatePrompt =
  "I want to create a YC startup around ideation and thinking - maybe a thinking instrument. It should use my past emails, messages, and notes to help me turn vague ideas into buildable structure. I want it to feel like a workbench that gives ideas direction without taking judgment away from the human.";

export function App() {
  const [documentsData, setDocumentsData] = useState<BrainDocumentsData | null>(null);
  const [recents, setRecents] = useState<BrainRecentIdea[]>([]);
  const [archivedRecents, setArchivedRecents] = useState<BrainRecentIdea[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [data, setData] = useState<BrainData | null>(null);
  const [moves, setMoves] = useState<BrainMove[]>([]);
  const [autopilot, setAutopilot] = useState<AutopilotTickData | null>(null);
  const [challengeResponse, setChallengeResponse] = useState<RespondToChallengeResponse["data"] | null>(null);
  const [latestArtifact, setLatestArtifact] = useState<SessionCockpitData["latestArtifact"]>(null);
  const [focusedClaimId, setFocusedClaimId] = useState<string | null>(null);
  const [focusedWorkStructureStepId, setFocusedWorkStructureStepId] = useState<string | null>(null);
  const [brainCanvasOpen, setBrainCanvasOpen] = useState(false);
  const [learnFocusNode, setLearnFocusNode] = useState<CanvasNode | null>(null);
  const [relatedBrainSearch, setRelatedBrainSearch] = useState<BrainRelatedSearchState | null>(null);
  const [createInitialSeedText, setCreateInitialSeedText] = useState<string | null>(null);
  const [createBrainProfile, setCreateBrainProfile] = useState<BrainMemoryProfileData | null>(null);
  const [createWorkspaceMounted, setCreateWorkspaceMounted] = useState(false);
  const [createWorkspaceRunId, setCreateWorkspaceRunId] = useState(0);
  const [activeMode, setActiveMode] = useState<PennyMode>("Learn");
  const [landingVisible, setLandingVisible] = useState(true);
  const [status, setStatus] = useState("Ready");
  const [isThinking, setIsThinking] = useState(false);
  const codebaseBrainPanelVisible = isCodebaseBrainPanelRoute();

  const selectedDocument = documentsData?.documents.find((document) => document.sessionId === selectedDocumentId) ?? null;
  const workStructure = data?.workStructure ?? null;
  const sessionLabel = selectedDocument
    ? `Doc ${shortId(selectedDocument.sessionId)} ${formatLabel(selectedDocument.status)}`
    : `${documentsData?.meta.documentCount ?? 0} docs`;

  useEffect(() => {
    if (activeMode === "Create") {
      setCreateWorkspaceMounted(true);
    }
  }, [activeMode]);

  useEffect(() => {
    if (codebaseBrainPanelVisible) {
      return;
    }

    const sessionId = activeSessionId();
    let cancelled = false;

    async function restoreBrain() {
      setIsThinking(true);
      setStatus(sessionId ? "Restoring session" : "Loading docs");

      try {
        const documents = await fetchBrainDocuments();

        if (cancelled) {
          return;
        }

        setDocumentsData(documents.data);
        await refreshRecents();

        if (!sessionId) {
          const createBoot = restoreCreateWorkspaceBoot();

          if (createBoot) {
            setCreateInitialSeedText(createBoot.seedText);
            setCreateBrainProfile(createBoot.brainProfile);
            setLearnFocusNode(createBoot.learnFocusNode ?? null);
            setCreateWorkspaceMounted(true);
            setLandingVisible(false);
            setActiveMode(createBoot.activeMode === "Learn" && createBoot.learnFocusNode ? "Learn" : "Create");
            setStatus(createBoot.activeMode === "Learn" && createBoot.learnFocusNode ? "Learn restored from Create" : "Create restored");
            return;
          }

          setLandingVisible(true);
          setStatus("Docs loaded");
          return;
        }

        const cockpit = await loadSession(sessionId, null);

        if (!cancelled) {
          if (isRestorableSession(cockpit)) {
            setLandingVisible(false);
          } else {
            resetToLandingAfterUnrestorableSession();
          }
        }
      } catch (error) {
        if (!cancelled) {
          forgetActiveSession();
          setLandingVisible(true);
          setStatus(formatErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setIsThinking(false);
        }
      }
    }

    void restoreBrain();

    return () => {
      cancelled = true;
    };
  }, [codebaseBrainPanelVisible]);

  async function handleSeed(rawIdea: string) {
    setIsThinking(true);
    setStatus("Thinking");

    try {
      const payload = await seedBrain(rawIdea);
      setData(payload.data);
      setChallengeResponse(null);
      setLatestArtifact(null);
      setBrainCanvasOpen(false);
      setLandingVisible(false);
      setFocusedWorkStructureStepId(payload.data.workStructure?.activeStepId ?? null);
      setFocusedClaimId(payload.data.firstChallenge?.targetClaimId ?? payload.data.ideaMap?.claims?.[0]?.id ?? null);
      setStatus("Graph slice persisted");

      if (payload.data.session?.id) {
        const sessionId = payload.data.session.id;
        rememberActiveSession(sessionId);
        setSelectedDocumentId(sessionId);
        setStatus("Doc created");

        try {
          await refreshDocuments(sessionId);
          await tickAutopilot(sessionId);
          const cockpit = await refreshCockpit(sessionId, payload.data);
          setFocusedClaimId(
            cockpit.autopilot.focusState?.focusedClaimId ??
              cockpit.autopilot.suggestion?.targetClaimId ??
              payload.data.firstChallenge?.targetClaimId ??
              payload.data.ideaMap?.claims?.[0]?.id ??
              null,
          );
          await refreshDocuments(sessionId);
        } catch (followUpError) {
          setStatus(successStatusAfterFollowUp("Doc saved", followUpError));
        }
      }
    } catch (error) {
      await refreshDocumentsAfterSeedFailure();
      setStatus(formatErrorMessage(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function handleLearnSeed(rawIdea: string, sourceMaterial?: LearnSourceMaterialInput, searchWeb = false) {
    setIsThinking(true);
    setStatus("Building Learn path");

    try {
      const payload = await createLearnSession(rawIdea, sourceMaterial, { searchWeb });
      const learnData = payload.data;
      setData(learnData);
      setAutopilot(learnData.autopilot ?? null);
      setChallengeResponse(null);
      setLatestArtifact(null);
      setBrainCanvasOpen(false);
      setLearnFocusNode(null);
      setRelatedBrainSearch(null);
      setLandingVisible(false);
      setActiveMode("Learn");
      setFocusedWorkStructureStepId(learnData.workStructure?.activeStepId ?? null);
      setFocusedClaimId(learnData.firstChallenge?.targetClaimId ?? learnData.ideaMap?.claims?.[0]?.id ?? null);
      setStatus("Learn path created");

      if (learnData.session?.id) {
        const sessionId = learnData.session.id;
        rememberActiveSession(sessionId);
        setSelectedDocumentId(sessionId);

        try {
          await refreshDocuments(sessionId);
          const cockpit = await refreshCockpit(sessionId, learnData);
          setFocusedClaimId(
            cockpit.autopilot.focusState?.focusedClaimId ??
              cockpit.autopilot.suggestion?.targetClaimId ??
              learnData.firstChallenge?.targetClaimId ??
              learnData.ideaMap?.claims?.[0]?.id ??
              null,
          );
          await refreshDocuments(sessionId);
        } catch (followUpError) {
          setStatus(successStatusAfterFollowUp("Learn path created", followUpError));
        }
      }
    } catch (error) {
      await refreshDocumentsAfterSeedFailure();
      setStatus(formatErrorMessage(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function handleKeepRecentIdea(rawIdea: string) {
    setIsThinking(true);
    setStatus("Saving quick note");

    try {
      const payload = await keepBrainRecentIdea(rawIdea);
      setRecents(payload.data.recents ?? mergeRecentIdeas(payload.data.recent, recents));
      setArchivedRecents(payload.data.archived ?? archivedRecents);
      setStatus("Quick note saved");
    } catch (error) {
      setStatus(formatErrorMessage(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function handleSelectDocument(sessionId: string) {
    setIsThinking(true);
    setStatus("Opening doc");
    setLandingVisible(false);

    try {
      await loadSession(sessionId, data);
      setStatus("Doc opened");
    } catch (error) {
      setStatus(formatErrorMessage(error));
    } finally {
      setIsThinking(false);
    }
  }

  function handleBackToLibrary() {
    setSelectedDocumentId(null);
    forgetActiveSession();
    setStatus("Docs loaded");
  }

  function handleNewThought() {
    setSelectedDocumentId(null);
    setData(null);
    setMoves([]);
    setAutopilot(null);
    setChallengeResponse(null);
    setLatestArtifact(null);
    setFocusedClaimId(null);
    setBrainCanvasOpen(false);
    setLearnFocusNode(null);
    setRelatedBrainSearch(null);
    setCreateInitialSeedText(null);
    setCreateBrainProfile(null);
    setCreateWorkspaceMounted(false);
    setLandingVisible(true);
    forgetActiveSession();
    forgetCreateWorkspaceBoot();
    setStatus("Ready");
  }

  function handleLandingModeSelect(mode: PennyMode) {
    setLandingVisible(false);
    setActiveMode(mode);

    if (mode !== "Create") {
      setCreateBrainProfile(null);
    }
  }

  async function handleLandingPromptSubmit(
    mode: Extract<PennyMode, "Learn" | "Create">,
    rawIdea: string,
    sourceMaterial?: LearnSourceMaterialInput,
  ) {
    if (mode === "Learn") {
      setLandingVisible(false);
      setActiveMode("Learn");
      await handleLearnSeed(rawIdea, sourceMaterial);
      return;
    }

    if (isYcDemoCreatePrompt(rawIdea)) {
      await startYcFixtureCreate(rawIdea);
      return;
    }

    setLandingVisible(false);
    setData(null);
    setMoves([]);
    setAutopilot(null);
    setChallengeResponse(null);
    setLatestArtifact(null);
    setFocusedClaimId(null);
    setFocusedWorkStructureStepId(null);
    setBrainCanvasOpen(false);
    setLearnFocusNode(null);
    setRelatedBrainSearch(null);
    const createSeedText = sourceMaterial?.extractedText || rawIdea;
    rememberCreateWorkspaceBoot({ seedText: createSeedText, brainProfile: null });
    setCreateInitialSeedText(createSeedText);
    setCreateBrainProfile(null);
    setCreateWorkspaceRunId((current) => current + 1);
    setActiveMode("Create");
    setStatus("Preparing Create");
  }

  async function handleBuildWithPenny() {
    await startYcFixtureCreate(pennyYcCreatePrompt);
  }

  async function startYcFixtureCreate(rawIdea: string) {
    setIsThinking(true);
    setStatus("Synthesizing safe demo sources");

    try {
      const { profile, sourceCount } = await importYcFounderFixtureBundle();

      setSelectedDocumentId(null);
      setData(null);
      setMoves([]);
      setAutopilot(null);
      setChallengeResponse(null);
      setLatestArtifact(null);
      setFocusedClaimId(null);
      setFocusedWorkStructureStepId(null);
      setBrainCanvasOpen(false);
      setLearnFocusNode(null);
      setRelatedBrainSearch(null);
      clearCreateWorkspaceDraftStorage();
      const createSeedText = rawIdea.trim() || pennyYcCreatePrompt;
      rememberCreateWorkspaceBoot({ seedText: createSeedText, brainProfile: profile });
      setCreateInitialSeedText(createSeedText);
      setCreateBrainProfile(profile);
      setCreateWorkspaceMounted(true);
      setCreateWorkspaceRunId((current) => current + 1);
      setLandingVisible(false);
      setActiveMode("Create");
      forgetActiveSession();
      setStatus(`YC demo Brain synthesized from ${sourceCount} safe fixture sources`);
    } catch (error) {
      setLandingVisible(true);
      setStatus(formatErrorMessage(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function importYcFounderFixtureBundle(): Promise<{ profile: BrainMemoryProfileData; sourceCount: number }> {
    const fixture = await fetchBrainYcFounderFixtureImport();
    const importInputs = fixture.data.importInputs?.length ? fixture.data.importInputs : [fixture.data.importInput];
    let profile: BrainMemoryProfileData | null = null;

    for (const [index, importInput] of importInputs.entries()) {
      setStatus(`Synthesizing demo source ${index + 1}/${importInputs.length}: ${importInput.label ?? "Brain context"}`);
      const imported = await importBrainSource(importInput);

      if (imported.data.job.status === "failed") {
        throw new Error(imported.data.job.errorMessages[0] ?? "YC founder fixture import failed.");
      }

      profile = imported.data.profile;
    }

    if (!profile) {
      throw new Error("YC founder fixture did not contain importable demo sources.");
    }

    return { profile, sourceCount: importInputs.length };
  }

  async function handleLandingQuickNote(rawIdea: string) {
    setLandingVisible(false);
    setActiveMode("Learn");

    if (rawIdea.trim()) {
      await handleKeepRecentIdea(rawIdea);
    }
  }

  async function handleReworkDocument() {
    if (!data?.session?.id) {
      setStatus("Open a doc before reworking it");
      return;
    }

    const documentSeedText = selectedDocument ? createPromptFromBrainDocument(selectedDocument) : data.source?.rawText?.trim() ?? "";

    setIsThinking(true);
    setStatus("Preparing Create");

    try {
      await tickAutopilot(data.session.id, true);
      const cockpit = await refreshCockpit(data.session.id);
      setFocusedClaimId(cockpit.autopilot.suggestion?.targetClaimId ?? cockpit.ideaMap.claims[0]?.id ?? null);
      await refreshDocuments(data.session.id);
      if (documentSeedText) {
        rememberCreateWorkspaceBoot({ seedText: documentSeedText, brainProfile: null });
        setCreateInitialSeedText(documentSeedText);
      }
      setActiveMode("Create");
      setCreateBrainProfile(null);
      setCreateWorkspaceMounted(true);
      setCreateWorkspaceRunId((current) => current + 1);
      setStatus("Create ready");
    } catch (error) {
      setStatus(formatErrorMessage(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function handleGoThere(candidateIdOverride?: string) {
    const intent = buildAutopilotStartIntent(data?.session?.id, autopilot, candidateIdOverride);

    if (!intent.ok) {
      setStatus(intent.status);
      return;
    }

    setIsThinking(true);
    setStatus("Starting Autopilot focus");

    try {
      const result = await runAutopilotGoThere(intent, {
        startCandidate: startAutopilotCandidate,
        refreshCockpit,
      });
      setFocusedClaimId(result.focusedClaimId);
      setActiveMode(result.nextMode);
      if (result.nextMode === "Create") {
        setCreateBrainProfile(null);
        setCreateWorkspaceMounted(true);
      }
      setStatus("Autopilot focus started");
    } catch (error) {
      setStatus(formatErrorMessage(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function handleIssueChallenge() {
    if (!data?.session?.id) {
      setStatus("Challenge needs a doc first");
      return;
    }

    const candidate = autopilot?.suggestion ?? autopilot?.selectedCandidate ?? null;
    const candidateId = candidate?.candidateId ?? null;

    if (!candidateId) {
      setStatus("No selected candidate to challenge");
      return;
    }

    if (candidate?.action !== "challenge") {
      setStatus(`${candidate?.label ?? "Selected action"} is not a challenge candidate`);
      return;
    }

    setIsThinking(true);
    setStatus("Issuing challenge");

    try {
      const issued = await issueChallengeFromCandidate(data.session.id, candidateId);
      const cockpit = await refreshCockpit(data.session.id);
      await refreshDocuments(data.session.id);
      setChallengeResponse(null);
      setFocusedClaimId(issued.data.targetClaim.id ?? cockpit.activeChallenge?.targetClaimId ?? null);
      setStatus("Challenge issued");
    } catch (error) {
      setStatus(formatErrorMessage(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function handleChallengeResponse(challengeId: string, draft: ChallengeResponseDraft) {
    if (!data?.session?.id) {
      setStatus("Challenge response needs a doc first");
      return;
    }

    setIsThinking(true);
    setStatus(`${responseLabel(draft.response)} response`);

    try {
      const response = await respondToChallenge({ challengeId, ...draft });
      setChallengeResponse(response.data);

      if (response.data.nextMove.status === "client_tick_required") {
        await tickAutopilot(data.session.id, response.data.nextMove.body.resume);
      }

      const cockpit = await refreshCockpit(data.session.id);
      await refreshDocuments(data.session.id);
      setFocusedClaimId(response.data.receipt.targetClaimId ?? cockpit.autopilot.suggestion?.targetClaimId ?? null);
      setStatus(`${responseLabel(draft.response)} saved`);
    } catch (error) {
      setStatus(formatErrorMessage(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function handleCreateChallengeBrief() {
    if (!data?.session?.id) {
      setStatus("Doc generation needs a session first");
      return;
    }

    setIsThinking(true);
    setStatus("Creating doc");

    try {
      const brief = await createChallengeBrief(data.session.id);
      setLatestArtifact(brief.data.artifact);
      await refreshCockpit(data.session.id);
      await refreshDocuments(data.session.id);
      setStatus("Doc created");
    } catch (error) {
      setStatus(formatErrorMessage(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function handleVerifyChanged() {
    if (!data?.session?.id) {
      return;
    }

    const cockpit = await refreshCockpit(data.session.id);
    await refreshDocuments(cockpit.session.id);
    setFocusedClaimId(
      cockpit.autopilot.focusState?.focusedClaimId ??
        cockpit.autopilot.suggestion?.targetClaimId ??
        cockpit.ideaMap.claims[0]?.id ??
        null,
    );
  }

  async function handleManualClaimSelect(claimId: string) {
    setFocusedWorkStructureStepId(workStructure?.steps.find((step) => step.claimIds.includes(claimId))?.id ?? null);

    if (!data?.session?.id) {
      setFocusedClaimId(claimId);
      return;
    }

    setIsThinking(true);
    setStatus("Saving manual focus");

    try {
      await selectAutopilotNode({
        sessionId: data.session.id,
        claimId,
        previousSuggestionMoveId: autopilot?.move?.id ?? null,
      });
      const cockpit = await refreshCockpit(data.session.id);
      setFocusedClaimId(cockpit.autopilot.focusState?.focusedClaimId ?? claimId);
      setStatus("Manual selection saved");
    } catch (error) {
      setStatus(formatErrorMessage(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function handleWorkStructureSelect(step: WorkStructureStep) {
    setFocusedWorkStructureStepId(step.id);

    const claimId = step.claimIds[0] ?? null;

    if (!claimId) {
      setStatus(`${step.title} selected`);
      return;
    }

    await handleManualClaimSelect(claimId);
      setFocusedWorkStructureStepId(step.id);
  }

  function handleOpenCanvas() {
    const sessionId = data?.session?.id ?? selectedDocument?.sessionId ?? null;

    if (!sessionId) {
      setStatus("Save an idea to Brain before opening Canvas");
      return;
    }

    setBrainCanvasOpen(true);
    setActiveMode("Brain");
    setStatus("Canvas ready");
  }

  async function handleBrainRelatedSearch(query: string, claimId?: string | null): Promise<BrainHybridSearchResponse["data"]> {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      const emptySearch = { available: false, results: [], meta: { query: "", resultCount: 0 } };
      setRelatedBrainSearch(emptySearch);
      return emptySearch;
    }

    setIsThinking(true);
    setStatus("Checking Brain memory");

    try {
      const response = await fetchBrainHybridSearch({
        query: trimmedQuery,
        sessionId: data?.session?.id ?? selectedDocument?.sessionId ?? null,
        claimId: claimId ?? null,
        mode: "learn",
        limit: 5,
      });
      setRelatedBrainSearch(response.data);
      setStatus(response.data.available ? "Brain memory checked" : "Brain related search unavailable");
      return response.data;
    } catch (error) {
      const failedSearch = { available: false, results: [], meta: { query: trimmedQuery, resultCount: 0 } };
      setRelatedBrainSearch(failedSearch);
      setStatus(formatErrorMessage(error));
      return failedSearch;
    } finally {
      setIsThinking(false);
    }
  }

  async function handleCanvasNodeAction(action: CanvasNodeAction, node: CanvasNode) {
    const claimId = claimIdFromCanvasNode(node);
    const claim = claimId ? data?.ideaMap?.claims?.find((item) => item.id === claimId) ?? null : null;
    const nodeText = node.summary?.trim() || claim?.text || node.title;

    if (claimId) {
      setFocusedClaimId(claimId);
    }

    switch (action) {
      case "learn":
        setLearnFocusNode(node);
        setActiveMode("Learn");
        setStatus("Learn focused on canvas node");
        return;
      case "check":
        setActiveMode("Create");
        if (claimId) {
          await handleManualClaimSelect(claimId);
        } else {
          setStatus("Create opened for canvas node");
        }
        return;
      case "verify":
        await handleCanvasVerify(node, claimId, nodeText);
        return;
      case "save":
        await handleCanvasSave(node, nodeText);
        return;
      case "related":
        setLearnFocusNode(node);
        await handleBrainRelatedSearch(nodeText, claimId);
        setActiveMode("Learn");
        return;
    }
  }

  async function handleCanvasVerify(node: CanvasNode, claimId: string | null, currentClaimText: string) {
    if (!data?.session?.id || !claimId) {
      setActiveMode("Create");
      setStatus("Open a saved claim before running Verify");
      return;
    }

    setIsThinking(true);
    setStatus("Verifying canvas claim");

    try {
      await verifyClaim({ sessionId: data.session.id, claimId, currentClaimText });
      const cockpit = await refreshCockpit(data.session.id);
      await refreshDocuments(data.session.id);
      setFocusedClaimId(claimId ?? cockpit.autopilot.suggestion?.targetClaimId ?? null);
      setLearnFocusNode(node);
      setActiveMode("Create");
      setStatus("Verify completed");
    } catch (error) {
      setActiveMode("Create");
      setStatus(formatErrorMessage(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function handleCanvasSave(node: CanvasNode, content: string) {
    if (node.id.startsWith("brain_object:")) {
      setStatus("Canvas object is already saved in Brain");
      return;
    }

    if (!content.trim()) {
      setStatus("Canvas node has no content to save");
      return;
    }

    setIsThinking(true);
    setStatus("Saving canvas node");

    try {
      await saveBrainObject({
        sessionId: data?.session?.id ?? selectedDocument?.sessionId ?? null,
        objectType: node.kind,
        title: node.title,
        summary: node.summary ?? null,
        content,
        payload: {
          source: "canvas_node",
          canvasNodeId: node.id,
          refs: node.refs ?? {},
        },
      });
      await refreshDocuments(data?.session?.id ?? selectedDocument?.sessionId ?? null);
      setStatus("Canvas node saved to Brain");
    } catch (error) {
      setStatus(formatErrorMessage(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function loadSession(sessionId: string, fallbackData: BrainData | null): Promise<SessionCockpitData> {
    setSelectedDocumentId(sessionId);
    rememberActiveSession(sessionId);
    const cockpit = await refreshCockpit(sessionId, fallbackData);
    setFocusedWorkStructureStepId(cockpit.workStructure?.activeStepId ?? null);
    setFocusedClaimId(
      cockpit.autopilot.focusState?.focusedClaimId ??
        cockpit.autopilot.suggestion?.targetClaimId ??
        cockpit.ideaMap.claims[0]?.id ??
        null,
    );

    return cockpit;
  }

  function resetToLandingAfterUnrestorableSession() {
    forgetActiveSession();
    setSelectedDocumentId(null);
    setData(null);
    setMoves([]);
    setAutopilot(null);
    setChallengeResponse(null);
    setLatestArtifact(null);
    setFocusedClaimId(null);
    setFocusedWorkStructureStepId(null);
    setBrainCanvasOpen(false);
    setLearnFocusNode(null);
    setRelatedBrainSearch(null);
    setLandingVisible(true);
    setStatus("Ready");
  }

  async function refreshCockpit(sessionId: string, fallbackData: BrainData | null = data): Promise<SessionCockpitData> {
    const cockpit = await fetchSessionCockpit(sessionId);
    const cockpitData = cockpit.data;

    setData(mergeCockpitData(cockpitData, fallbackData));
    setAutopilot(cockpitData.autopilot);
    setMoves(cockpitData.moves);
    setLatestArtifact(cockpitData.latestArtifact ?? null);
    setFocusedWorkStructureStepId(cockpitData.workStructure?.activeStepId ?? null);
    rememberActiveSession(cockpitData.session.id);

    return cockpitData;
  }

  async function refreshDocuments(preferredSessionId: string | null = selectedDocumentId): Promise<void> {
    const documents = await fetchBrainDocuments();
    setDocumentsData(documents.data);

    if (preferredSessionId) {
      setSelectedDocumentId(preferredSessionId);
    }
  }

  async function refreshDocumentsAfterSeedFailure(): Promise<void> {
    try {
      await refreshDocuments(null);
    } catch {
      // Keep the seed error visible when the fallback document refresh also fails.
    }
  }

  async function refreshRecents(): Promise<void> {
    try {
      const payload = await fetchBrainRecents();
      setRecents(payload.data.recents);
      setArchivedRecents(payload.data.archived ?? []);
    } catch {
      setRecents([]);
      setArchivedRecents([]);
    }
  }

  async function handleQuickNoteStatus(recentId: string, nextStatus: "active" | "archived") {
    setIsThinking(true);
    setStatus(nextStatus === "archived" ? "Archiving quick note" : "Restoring quick note");

    try {
      const payload = await updateBrainRecentStatus(recentId, nextStatus);
      setRecents(payload.data.recents);
      setArchivedRecents(payload.data.archived ?? []);
      setStatus(nextStatus === "archived" ? "Quick note archived" : "Quick note restored");
    } catch (error) {
      setStatus(formatErrorMessage(error));
    } finally {
      setIsThinking(false);
    }
  }

  async function handleQuickNoteAction(recent: BrainRecentIdea, action: QuickNoteAction) {
    if (action === "archive" || action === "restore") {
      await handleQuickNoteStatus(recent.id, action === "archive" ? "archived" : "active");
      return;
    }

    setIsThinking(true);
    setStatus("Using quick note");

    try {
      if (action === "brain") {
        const saved = await saveBrainObject({
          objectType: "quick_note",
          title: recent.rawIdea,
          summary: "Promoted from Quick Notes.",
          content: recent.rawIdea,
          payload: {
            source: "quick_note",
            recentId: recent.id,
          },
        });
        setStatus(saved.data.memoryImport?.status === "completed" ? "Quick note saved into private Brain memory" : "Quick note added to Brain");
        await refreshRecents();
      } else {
        if (action === "learn") {
          await handleLearnSeed(recent.rawIdea);
        } else if (action === "check") {
          setData(null);
          setMoves([]);
          setAutopilot(null);
          setChallengeResponse(null);
          setLatestArtifact(null);
          setFocusedClaimId(null);
          setFocusedWorkStructureStepId(null);
          setBrainCanvasOpen(false);
          setLearnFocusNode(null);
          setRelatedBrainSearch(null);
          rememberCreateWorkspaceBoot({ seedText: recent.rawIdea, brainProfile: null });
          setCreateInitialSeedText(recent.rawIdea);
          setCreateBrainProfile(null);
          setCreateWorkspaceMounted(true);
          setActiveMode("Create");
          setStatus("Quick note sent to Create");
        } else {
          await handleSeed(recent.rawIdea);
          setActiveMode("Brain");
        }
        setStatus(
          action === "check"
            ? "Quick note sent to Create"
            : action === "learn"
              ? "Quick note opened in Learn"
              : "Quick note built",
        );

        const payload = await updateBrainRecentStatus(recent.id, "archived");
        setRecents(payload.data.recents);
        setArchivedRecents(payload.data.archived ?? []);
      }
    } catch (error) {
      setStatus(formatErrorMessage(error));
    } finally {
      setIsThinking(false);
    }
  }

  function handleStartCreateWithBrain(profile: BrainMemoryProfileData, focusMemory?: MemoryNode) {
    setSelectedDocumentId(null);
    setData(null);
    setMoves([]);
    setAutopilot(null);
    setChallengeResponse(null);
    setLatestArtifact(null);
    setFocusedClaimId(null);
    setFocusedWorkStructureStepId(null);
    setBrainCanvasOpen(false);
    setLearnFocusNode(null);
    setRelatedBrainSearch(null);
    const createSeedText = createPromptFromBrainProfile(profile, focusMemory);
    rememberCreateWorkspaceBoot({ seedText: createSeedText, brainProfile: profile });
    setCreateInitialSeedText(createSeedText);
    setCreateBrainProfile(profile);
    setCreateWorkspaceMounted(true);
    setLandingVisible(false);
    setActiveMode("Create");
    forgetActiveSession();
    setStatus(profile.stats.memoryNodeCount ? "Using your Brain in Create" : "Create opened context-light");
  }

  function handleLearnFromCreate(node: CanvasNode) {
    setLearnFocusNode(node);
    rememberCreateWorkspaceView({ activeMode: "Learn", learnFocusNode: node });
    setActiveMode("Learn");
    setStatus("Learn opened from Create");
  }

  function handleBackToCreateFromLearn() {
    rememberCreateWorkspaceView({ activeMode: "Create", learnFocusNode });
    setActiveMode("Create");
  }

  if (codebaseBrainPanelVisible) {
    return <CodebaseBrainPanel />;
  }

  const shouldRenderCreateWorkspace = createWorkspaceMounted || activeMode === "Create";

  return (
    <div className="min-h-screen bg-white text-[#111]">
      <div
        className={`mx-auto min-h-[calc(100vh-5px)] max-w-[1440px] bg-white${
          landingVisible ? "" : " border-t-[5px] border-black"
        }`}
      >
        {landingVisible ? (
          <LandingPage
            disabled={isThinking}
            status={status}
            onModeSelect={handleLandingModeSelect}
            onPromptSubmit={handleLandingPromptSubmit}
            onQuickNote={handleLandingQuickNote}
            onBuildWithPenny={handleBuildWithPenny}
          />
        ) : (
          <>
            <Header
              sessionLabel={sessionLabel}
              thinkingLabel={isThinking ? "Thinking" : status}
              activeItem={activeMode}
              onNavItemSelect={(item) => setActiveMode(item as PennyMode)}
              onLogoSelect={handleNewThought}
            />
            {activeMode === "Learn" ? (
          <LearnWorkspace
            selectedDocument={selectedDocument}
            documents={documentsData?.documents ?? []}
            data={data}
            autopilot={autopilot}
            focusedClaimId={focusedClaimId}
            focusNode={learnFocusNode}
            isThinking={isThinking}
            status={status}
            recents={recents}
            onLearnSeed={(rawIdea, options) => handleLearnSeed(rawIdea, undefined, options?.searchWeb ?? false)}
            onKeepRecent={handleKeepRecentIdea}
            onSearchBrainRelated={handleBrainRelatedSearch}
            {...(shouldRenderCreateWorkspace ? { onBackToCreate: handleBackToCreateFromLearn } : {})}
          />
        ) : activeMode === "Brain" ? (
          <BrainWorkspace
            documentsData={documentsData}
            selectedDocument={selectedDocument}
            data={data}
            moves={moves}
            autopilot={autopilot}
            latestArtifact={latestArtifact ?? null}
            focusedClaimId={focusedClaimId}
            canvasOpen={brainCanvasOpen}
            status={status}
            isThinking={isThinking}
            recents={recents}
            archivedRecents={archivedRecents}
            onSelectDocument={handleSelectDocument}
            onBackToLibrary={handleBackToLibrary}
            onNewThought={handleNewThought}
            onSeed={handleSeed}
            onQuickNoteCreate={handleKeepRecentIdea}
            onQuickNoteAction={handleQuickNoteAction}
            onClaimSelect={handleManualClaimSelect}
            onReworkDocument={handleReworkDocument}
            onCanvasOpenChange={setBrainCanvasOpen}
            onCanvasNodeAction={handleCanvasNodeAction}
            onStartCreateWithBrain={handleStartCreateWithBrain}
          />
            ) : null}
            {shouldRenderCreateWorkspace ? (
              <div hidden={activeMode !== "Create"}>
                <CreateWorkspace
                  data={data}
                  status={status}
                  isThinking={isThinking}
                  brainProfile={createBrainProfile}
                  recents={recents}
                  initialSeedText={createInitialSeedText}
                  key={createWorkspaceRunId}
                  onInitialSeedConsumed={() => setCreateInitialSeedText(null)}
                  onStatusChange={setStatus}
                  onThinkingChange={setIsThinking}
                  onOpenBrain={() => setActiveMode("Brain")}
                  onLearnThis={handleLearnFromCreate}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export function createPromptFromBrainProfile(profile: BrainMemoryProfileData, focusMemory?: MemoryNode): string {
  const sourceLabels = profile.sources
    .slice(0, 3)
    .map((source) => source.label.trim())
    .filter(Boolean);
  const memoryTitles = profile.recentMemoryNodes
    .slice(0, 3)
    .map((node) => node.title.trim())
    .filter(Boolean);
  const contextLine =
    profile.profile.privacySafeSummary.trim() ||
    [
      profile.stats.memoryNodeCount ? `${profile.stats.memoryNodeCount} Brain memories` : null,
      sourceLabels.length ? `sources: ${sourceLabels.join(", ")}` : null,
      memoryTitles.length ? `signals: ${memoryTitles.join("; ")}` : null,
    ]
      .filter(Boolean)
      .join(". ");

  return [
    focusMemory
      ? `Use this Brain memory as the seed: ${focusMemory.title}. ${focusMemory.summary}`
      : "Use my Brain context to create five concrete directions for Penny's next buildable artifact.",
    contextLine ? `Ground the directions in this context: ${contextLine}` : "Ground the directions in the imported Brain memories.",
  ].join(" ");
}

export function createPromptFromBrainDocument(document: BrainDocumentSummary): string {
  const sections = [
    document.originalIdea ? `Original idea: ${document.originalIdea}` : null,
    document.mainClaim ? `Main claim: ${document.mainClaim.text}` : null,
    document.finalRecommendations.length ? `Recommendations: ${document.finalRecommendations.slice(0, 3).join("; ")}` : null,
    document.nextActions.length ? `Next actions: ${document.nextActions.slice(0, 3).join("; ")}` : null,
    document.todoLaterIdeas.length ? `Keep in mind: ${document.todoLaterIdeas.slice(0, 2).join("; ")}` : null,
  ].filter(Boolean);

  return [
    `Rework the Brain document "${document.title}" in Create.`,
    document.description ? `Document context: ${document.description}` : null,
    ...sections,
    "Give me five concrete directions, keep the document's strongest claims visible, and turn the next choice into a buildable artifact.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function isYcDemoCreatePrompt(rawIdea: string): boolean {
  const normalized = rawIdea.toLowerCase().replace(/\s+/g, " ").trim();
  const hasYcFrame = /\byc\b|y combinator|startup/.test(normalized);
  const hasThinkingWorkbench = /ideation|thinking instrument|thinking workbench|creativity workbench|workbench/.test(normalized);
  const hasPrivateContext =
    /emails?|gmail|messages?|whatsapp|linkedin|notes?|past context|private context/.test(normalized);

  return Boolean(hasYcFrame && hasThinkingWorkbench && hasPrivateContext);
}

function mergeCockpitData(cockpit: SessionCockpitData, current: BrainData | null): BrainData {
  const keyInsight = cockpit.ideaMap.keyInsight ?? current?.ideaMap?.keyInsight ?? null;
  const fallbackChallenge = current?.firstChallenge && !current.firstChallenge.id ? current.firstChallenge : null;
  const firstChallenge = cockpit.activeChallenge ?? fallbackChallenge;
  const workStructure = cockpit.workStructure ?? current?.workStructure ?? null;

  return {
    ...(current?.source ? { source: current.source } : {}),
    ...(current?.brainRun ? { brainRun: current.brainRun } : {}),
    session: cockpit.session,
    ...(workStructure ? { workStructure } : {}),
    ideaMap: {
      claims: cockpit.ideaMap.claims,
      edges: cockpit.ideaMap.edges,
      ...(typeof keyInsight === "string" && keyInsight ? { keyInsight } : {}),
    },
    graphPath: cockpit.graphPath,
    explorationPaths: current?.explorationPaths ?? [],
    learnCandidates: current?.learnCandidates ?? [],
    ...(current?.learningPlan ? { learningPlan: current.learningPlan } : {}),
    ...(current?.learn ? { learn: current.learn } : {}),
    ...(firstChallenge ? { firstChallenge } : {}),
  };
}

function isRestorableSession(cockpit: SessionCockpitData): boolean {
  return cockpit.ideaMap.claims.length > 0 || cockpit.ideaMap.edges.length > 0 || cockpit.moves.length > 0;
}

function mergeRecentIdeas(recent: BrainRecentIdea, existing: BrainRecentIdea[]): BrainRecentIdea[] {
  return [recent, ...existing.filter((item) => item.id !== recent.id)].slice(0, 8);
}

function responseLabel(response: ChallengeResponseKind): string {
  return response.charAt(0).toUpperCase() + response.slice(1);
}

export function formatErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (isRawDatabaseFailure(message)) {
    return LOCAL_DEMO_MODE_STATUS;
  }

  return message;
}

function successStatusAfterFollowUp(baseStatus: string, error: unknown): string {
  const message = formatErrorMessage(error);

  return message === LOCAL_DEMO_MODE_STATUS ? baseStatus : `${baseStatus}; ${message}`;
}

function isRawDatabaseFailure(message: string): boolean {
  return /DATABASE_URL is required|Failed query:|ENOTFOUND|tenant\/user postgres/i.test(message);
}

function claimIdFromCanvasNode(node: CanvasNode): string | null {
  if (node.refs?.claimId) {
    return node.refs.claimId;
  }

  return node.id.startsWith("claim:") ? node.id.slice("claim:".length) : null;
}

function activeSessionId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const urlSessionId = new URLSearchParams(window.location.search).get(SESSION_QUERY_PARAM);

  if (urlSessionId) {
    return urlSessionId;
  }

  return window.localStorage.getItem(ACTIVE_SESSION_KEY);
}

function isCodebaseBrainPanelRoute(): boolean {
  return typeof window !== "undefined" && window.location.pathname === "/dev/codebase";
}

function rememberActiveSession(sessionId: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);

  const url = new URL(window.location.href);
  url.searchParams.set(SESSION_QUERY_PARAM, sessionId);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function forgetActiveSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ACTIVE_SESSION_KEY);

  const url = new URL(window.location.href);
  url.searchParams.delete(SESSION_QUERY_PARAM);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function rememberCreateWorkspaceBoot(input: { seedText: string; brainProfile: BrainMemoryProfileData | null }): void {
  if (typeof window === "undefined") {
    return;
  }

  clearCreateWorkspaceDraftStorage();
  window.localStorage.setItem(
    CREATE_WORKSPACE_BOOT_KEY,
    JSON.stringify({
      version: 1,
      updatedAt: Date.now(),
      seedText: input.seedText,
      brainProfile: input.brainProfile,
      activeMode: "Create",
      learnFocusNode: null,
    } satisfies PersistedCreateWorkspaceBoot),
  );
}

function rememberCreateWorkspaceView(input: { activeMode: "Create" | "Learn"; learnFocusNode: CanvasNode | null }): void {
  if (typeof window === "undefined") {
    return;
  }

  const boot = restoreCreateWorkspaceBoot();

  if (!boot) {
    return;
  }

  window.localStorage.setItem(
    CREATE_WORKSPACE_BOOT_KEY,
    JSON.stringify({
      ...boot,
      updatedAt: Date.now(),
      activeMode: input.activeMode,
      learnFocusNode: input.learnFocusNode,
    } satisfies PersistedCreateWorkspaceBoot),
  );
}

function restoreCreateWorkspaceBoot(): PersistedCreateWorkspaceBoot | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(CREATE_WORKSPACE_BOOT_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!isCreateWorkspaceBoot(parsed)) {
      window.localStorage.removeItem(CREATE_WORKSPACE_BOOT_KEY);
      clearCreateWorkspaceDraftStorage();
      return null;
    }

    return parsed;
  } catch {
    window.localStorage.removeItem(CREATE_WORKSPACE_BOOT_KEY);
    clearCreateWorkspaceDraftStorage();
    return null;
  }
}

function forgetCreateWorkspaceBoot(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(CREATE_WORKSPACE_BOOT_KEY);
  clearCreateWorkspaceDraftStorage();
}

function isCreateWorkspaceBoot(value: unknown): value is PersistedCreateWorkspaceBoot {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.updatedAt === "number" &&
    typeof value.seedText === "string" &&
    (value.brainProfile === null || isRecord(value.brainProfile)) &&
    (value.activeMode === undefined || value.activeMode === "Create" || value.activeMode === "Learn") &&
    (value.learnFocusNode === undefined || value.learnFocusNode === null || isRecord(value.learnFocusNode))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
