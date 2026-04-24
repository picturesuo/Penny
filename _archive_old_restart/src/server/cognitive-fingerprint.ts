import { prisma } from "@/db/prisma";
import { generateCognitiveFingerprint } from "@/lib/cognitive-fingerprint";
import type { CognitiveFingerprint, CognitiveFingerprintEntry } from "@/types/cognitive-fingerprint";

type FingerprintPatternReviewRecord = {
  patternId: string;
  acknowledged: boolean;
  disputeText: string | null;
  falsificationCondition: string | null;
};

function decoratePattern(pattern: CognitiveFingerprintEntry, reviews: FingerprintPatternReviewRecord[]): CognitiveFingerprintEntry {
  const review = reviews.find((entry) => entry.patternId === pattern.id) ?? null;

  if (!review) {
    return pattern;
  }

  return {
    ...pattern,
    userAcknowledged: review.acknowledged || pattern.userAcknowledged,
    userDisputeText: review.disputeText,
    userFalsificationCondition: review.falsificationCondition,
  };
}

export async function getCognitiveFingerprint(userId: string): Promise<CognitiveFingerprint> {
  const [fingerprint, reviews] = await Promise.all([
    generateCognitiveFingerprint(userId),
    prisma.fingerprintPatternReview.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const decorate = (patterns: CognitiveFingerprintEntry[]) => patterns.map((pattern) => decoratePattern(pattern, reviews));

  return {
    ...fingerprint,
    confirmedPatterns: decorate(fingerprint.confirmedPatterns),
    emergingPatterns: decorate(fingerprint.emergingPatterns),
    retiredPatterns: decorate(fingerprint.retiredPatterns),
    dominantPattern: fingerprint.dominantPattern ? decoratePattern(fingerprint.dominantPattern, reviews) : null,
    mostImprovedPattern: fingerprint.mostImprovedPattern ? decoratePattern(fingerprint.mostImprovedPattern, reviews) : null,
  };
}

export async function upsertFingerprintReview(params: {
  userId: string;
  patternId: string;
  disputeText?: string | null;
  falsificationCondition?: string | null;
  acknowledged?: boolean;
}) {
  return prisma.fingerprintPatternReview.upsert({
    where: {
      userId_patternId: {
        userId: params.userId,
        patternId: params.patternId,
      },
    },
    create: {
      userId: params.userId,
      patternId: params.patternId,
      disputeText: params.disputeText?.trim() || null,
      falsificationCondition: params.falsificationCondition?.trim() || null,
      acknowledged: params.acknowledged ?? false,
    },
    update: {
      disputeText: params.disputeText?.trim() || null,
      falsificationCondition: params.falsificationCondition?.trim() || null,
      acknowledged: params.acknowledged ?? true,
    },
  });
}
