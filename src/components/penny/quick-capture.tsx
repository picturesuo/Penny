'use client';

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuickCaptureModal } from "@/components/penny/quick-capture-modal";

export function QuickCapture({
  userId,
  defaultMapId,
}: {
  userId?: string;
  defaultMapId?: string;
}) {
  const { open } = useQuickCaptureModal();

  return (
    <Button
      className="gap-2"
      data-onboarding-target="quick-capture"
      onClick={() => open({ defaultMapId })}
      title={userId ? `Quick capture for ${userId}` : "Quick capture"}
    >
      <Plus className="size-4" />
      Quick capture
    </Button>
  );
}
