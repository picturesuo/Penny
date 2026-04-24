import { dedupePoints } from "@/lib/penny";
import type { ContextProvider } from "@/lib/context/provider";
import type { EvidenceScanResult, StructuredPoint, SessionState } from "@/types/penny";

const KEYWORD_MAP: Record<
  string,
  {
    supports: StructuredPoint[];
    contradictions: StructuredPoint[];
    patterns: StructuredPoint[];
  }
> = {
  fitness: {
    supports: [
      {
        point: "People do spend on accountability when they already have intent to improve fitness.",
        whyItMatters: "Demand exists, but usually in narrow, high-motivation segments.",
      },
    ],
    contradictions: [
      {
        point: "Retention collapses quickly in habit products when the product adds guilt but not a clear daily reward.",
        whyItMatters: "Behavior change apps die on week-two dropoff.",
      },
    ],
    patterns: [
      {
        point: "Crowded consumer wellness categories demand either a wedge audience or a distinctive loop.",
        whyItMatters: "A generic fitness app is easy to ignore.",
      },
    ],
  },
  compliance: {
    supports: [
      {
        point: "Teams pay for products that reduce review cycles or audit anxiety.",
        whyItMatters: "Compliance budgets exist when pain is tied to deadlines or risk.",
      },
    ],
    contradictions: [
      {
        point: "New workflow tools fail when they cannot integrate with existing systems of record.",
        whyItMatters: "If switching cost is high, novelty is not enough.",
      },
    ],
    patterns: [
      {
        point: "B2B trust-heavy products need a believable path to proof, not just a better interface.",
        whyItMatters: "Distribution and credibility are part of the product.",
      },
    ],
  },
  marketplace: {
    supports: [
      {
        point: "Focused vertical marketplaces can work when one side has acute urgency and fragmented supply.",
        whyItMatters: "Strong wedges beat broad marketplace ambitions.",
      },
    ],
    contradictions: [
      {
        point: "Two-sided marketplaces fail when founders assume supply and demand will appear at the same time.",
        whyItMatters: "Liquidity risk is the core risk, not UI polish.",
      },
    ],
    patterns: [
      {
        point: "Many winning marketplaces begin as manual or concierge operations.",
        whyItMatters: "You can test matching before building software.",
      },
    ],
  },
  devtool: {
    supports: [
      {
        point: "Developers adopt tools that save time inside workflows they already repeat weekly.",
        whyItMatters: "Utility beats novelty in developer products.",
      },
    ],
    contradictions: [
      {
        point: "Devtools struggle when the buyer, user, and security approver are different people.",
        whyItMatters: "Distribution gets harder than the product itself.",
      },
    ],
    patterns: [
      {
        point: "Open source, CLI adoption, and team rollout are different motions.",
        whyItMatters: "The go-to-market path must match the product shape.",
      },
    ],
  },
};

function pickEvidence(rawText: string) {
  const lower = rawText.toLowerCase();
  const matches = Object.entries(KEYWORD_MAP)
    .filter(([keyword]) => lower.includes(keyword))
    .map(([, value]) => value);

  if (matches.length === 0) {
    return {
      supports: [
        {
          point: "Clear pain and a narrow initial buyer usually matter more than feature breadth.",
          whyItMatters: "Vague markets produce vague demand.",
        },
      ],
      contradictions: [
        {
          point: "Founders often assume interest before proving an urgent problem.",
          whyItMatters: "Polite curiosity is not demand.",
        },
      ],
      patterns: [
        {
          point: "Most early concepts improve after narrowing to one urgent use case.",
          whyItMatters: "Specific wedges create better validation tests.",
        },
      ],
    };
  }

  return matches.reduce(
    (accumulator, current) => ({
      supports: [...accumulator.supports, ...current.supports],
      contradictions: [...accumulator.contradictions, ...current.contradictions],
      patterns: [...accumulator.patterns, ...current.patterns],
    }),
    {
      supports: [] as StructuredPoint[],
      contradictions: [] as StructuredPoint[],
      patterns: [] as StructuredPoint[],
    },
  );
}

export class MockContextProvider implements ContextProvider {
  async getEvidence(session: SessionState): Promise<EvidenceScanResult> {
    if (session.rawIdea.toLowerCase().includes("offline-only")) {
      throw new Error("Evidence lookup unavailable");
    }

    const bundle = pickEvidence(
      [session.rawIdea, session.problem, session.solution, session.category]
        .filter(Boolean)
        .join(" "),
    );

    return {
      supports: dedupePoints(bundle.supports).slice(0, 3),
      contradictions: dedupePoints(bundle.contradictions).slice(0, 3),
      marketPatterns: dedupePoints(bundle.patterns).slice(0, 3),
      confidenceNote: "Pattern-level context, not authoritative research.",
    };
  }
}
