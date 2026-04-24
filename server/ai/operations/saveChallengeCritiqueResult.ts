import type {
  ChallengeCritiqueProviderName,
  GenerateChallengeCritiqueOutput,
} from "./generateChallengeCritique.ts";

export type SaveChallengeCritiqueResult = {
  roundId: string;
  status: string;
  critiqueJson: GenerateChallengeCritiqueOutput;
  provider: ChallengeCritiqueProviderName;
  model: string;
  promptVersion: string;
};
