"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatShapeVerdict, type PennyShape } from "@/lib/penny-insights";

type ShapeFeedback = "confirmed" | "rejected" | "refined";

export function ShapeDashboard({ shapes }: { shapes: PennyShape[] }) {
  const [feedback, setFeedback] = useState<Record<string, ShapeFeedback>>({});

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Shapes dashboard</p>
          <h2 className="mt-2 text-3xl font-semibold text-[var(--ink)] sm:text-4xl">
            What Penny thinks about how you think.
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted-ink)]">
            These patterns are derived from moves, overrides, confidence shifts, and repeated failures. They are confirmable, rejectable, and refinable.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-[var(--panel)] text-[var(--ink)]">Periodic surface</Badge>
          <Badge className="bg-[var(--panel)] text-[var(--ink)]">Metacognition visible</Badge>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {shapes.length ? (
          shapes.map((shape) => {
            const currentFeedback = feedback[shape.id];

            return (
              <div key={shape.id} className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-white text-[var(--ink)]">{shape.kind}</Badge>
                  <Badge className="bg-[#e7defa] text-[#5c4c88]">
                    {formatShapeVerdict(shape.verdict)} · {shape.confidence}%
                  </Badge>
                  <Badge className="bg-[#d9ead8] text-[#355b32]">{shape.evidenceNodeIds.length} claims</Badge>
                </div>

                <h3 className="mt-3 text-xl font-semibold text-[var(--ink)]">{shape.label}</h3>
                <p className="mt-2 text-sm leading-7 text-[var(--ink)]">{shape.summary}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{shape.explanation}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {shape.supportingNodes.slice(0, 3).map((node) => (
                    <Badge key={node.id} className="bg-white text-[var(--ink)]">
                      {node.kind.replaceAll("_", " ")}
                    </Badge>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    className="px-3 py-2 text-xs"
                    onClick={() => setFeedback((current) => ({ ...current, [shape.id]: "confirmed" }))}
                  >
                    Confirm
                  </Button>
                  <Button
                    variant="secondary"
                    className="px-3 py-2 text-xs"
                    onClick={() => setFeedback((current) => ({ ...current, [shape.id]: "rejected" }))}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="secondary"
                    className="px-3 py-2 text-xs"
                    onClick={() => setFeedback((current) => ({ ...current, [shape.id]: "refined" }))}
                  >
                    Refine
                  </Button>
                </div>

                {currentFeedback ? (
                  <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                    Marked as {currentFeedback}
                  </p>
                ) : null}
              </div>
            );
          })
        ) : (
          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5 lg:col-span-2">
            <p className="text-sm leading-7 text-[var(--muted-ink)]">
              Penny will surface metacognitive patterns here once enough claims, overrides, and revisits have accumulated.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
