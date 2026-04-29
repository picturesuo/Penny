export {
  buildArtifactDraft,
  buildCompiledArtifactPayload,
} from "./artifact-core.ts";
export type {
  ArtifactOutput,
  CompiledArtifactPayload,
  PersistedArtifact,
  SessionArtifactContext,
  SessionArtifactState,
} from "./artifact-core.ts";
export { inferShapesFromMoves } from "./shapes.ts";
export type { CompiledShape } from "./shapes.ts";
