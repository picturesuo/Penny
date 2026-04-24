"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { PersonalizedCritiqueContext } from "@/types/personalized-critique";

export function PersonalizedCritiquePanel({ context }: { context: PersonalizedCritiqueContext | null }) {
  if (!context) {
    return null;
  }

  const isDeep = context.knowledgeDepth === "deep" || context.knowledgeDepth === "comprehensive";

  return (
    <Card className="rounded-[20px] border-0 bg-[var(--panel)] p-4 shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Compounding critique</p>
          <h3 className="mt-1 text-xl font-semibold text-[var(--ink)]">
            {isDeep ? "Penny knows you well enough to push harder." : "Penny is still learning your critique patterns."}
          </h3>
        </div>
        <Badge className="bg-white text-[var(--ink)]">{context.knowledgeDepth}</Badge>
      </div>

      <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{context.disclosure}</p>
      <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">{context.knowledgeDepthMessage}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {context.confirmedBiases.slice(0, 3).map((bias) => (
          <Badge key={bias} className="bg-[#fff6ed] text-[#8b4d1f]">
            bias: {bias}
          </Badge>
        ))}
        {context.dominantShapes.slice(0, 3).map((shape) => (
          <Badge key={shape} className="bg-[#e7defa] text-[#5c4c88]">
            shape: {shape}
          </Badge>
        ))}
        {context.weakDomains.slice(0, 3).map((domain) => (
          <Badge key={`weak-${domain}`} className="bg-[#ffe5e0] text-[#a13d2d]">
            harder in {domain}
          </Badge>
        ))}
        {context.strongDomains.slice(0, 3).map((domain) => (
          <Badge key={`strong-${domain}`} className="bg-[#d9ead8] text-[#355b32]">
            steadier in {domain}
          </Badge>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <InfoBlock label="Mode adjustment" value={context.critiqueModeAdjustment} />
        <InfoBlock label="Selected voice" value={context.voiceSelected.replaceAll("_", " ")} />
        <InfoBlock label="Intensity adjustment" value={formatIntensity(context.intensityAdjustment)} />
        <InfoBlock label="Knowledge age" value={`${context.knowledgeAge} day${context.knowledgeAge === 1 ? "" : "s"}`} />
      </div>

      {context.failureTypesPrioritized.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Failure types to press</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {context.failureTypesPrioritized.slice(0, 4).map((failureType) => (
              <Badge key={failureType} className="bg-white text-[var(--ink)]">
                {failureType}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {context.strongConcessionContexts.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Where you already update</p>
          <ul className="mt-2 space-y-2 text-sm leading-6 text-[var(--ink)]">
            {context.strongConcessionContexts.slice(0, 3).map((item) => (
              <li key={item} className="rounded-[14px] bg-white px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {context.dismissalPatterns.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Dismissal pattern</p>
          <div className="mt-2 space-y-2">
            {context.dismissalPatterns.slice(0, 2).map((pattern) => (
              <div key={pattern.id} className="rounded-[14px] bg-white px-3 py-2 text-sm leading-6 text-[var(--ink)]">
                {pattern.summary}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] bg-white px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted-ink)]">{label}</p>
      <p className="mt-1 text-sm leading-6 text-[var(--ink)]">{value}</p>
    </div>
  );
}

function formatIntensity(value: number) {
  if (value > 0) {
    return `+${value}`;
  }

  if (value < 0) {
    return `${value}`;
  }

  return "no change";
}
