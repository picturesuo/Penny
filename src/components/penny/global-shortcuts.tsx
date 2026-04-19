"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function GlobalShortcuts() {
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase() ?? "";
      const isEditable = tagName === "input" || tagName === "textarea" || target?.isContentEditable === true;

      if (isEditable) {
        return;
      }

      const key = event.key.toLowerCase();

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && key === "n") {
        event.preventDefault();
        router.push("/app/new");
      }

      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        router.push("/app/search");
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && key === "h") {
        event.preventDefault();
        router.push("/app");
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  return null;
}
