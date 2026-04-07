"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyBriefButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button variant="secondary" onClick={onCopy}>
      {copied ? "Copied" : "Copy brief"}
    </Button>
  );
}
