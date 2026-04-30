import { type FormEvent, useEffect, useState } from "react";

interface ComposerProps {
  disabled: boolean;
  status: string;
  onSubmit: (rawIdea: string) => Promise<void>;
  storageKey?: string;
}

const DEFAULT_STORAGE_KEY = "penny.composerDraft";

export function Composer({ disabled, status, onSubmit, storageKey = DEFAULT_STORAGE_KEY }: ComposerProps) {
  const [rawIdea, setRawIdea] = useState(() => storedDraft(storageKey));

  useEffect(() => {
    const draft = rawIdea.trim();

    if (!canStoreDraft()) {
      return;
    }

    if (draft) {
      window.localStorage.setItem(storageKey, rawIdea);
    } else {
      window.localStorage.removeItem(storageKey);
    }
  }, [rawIdea, storageKey]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!rawIdea.trim()) {
      return;
    }

    await onSubmit(rawIdea.trim());
    setRawIdea("");
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <label htmlFor="rawIdea">ADD OR ASK ANYTHING TO YOUR THINKING</label>
      <div className="composer-control">
        <input
          id="rawIdea"
          name="rawIdea"
          value={rawIdea}
          onChange={(event) => setRawIdea(event.target.value)}
          disabled={disabled}
          aria-describedby="composerStatus"
        />
        <button type="submit" disabled={disabled || rawIdea.trim().length === 0} aria-label="Submit thought">
          <span />
        </button>
      </div>
      <p id="composerStatus" className="sr-only">
        {status}
      </p>
    </form>
  );
}

function storedDraft(storageKey: string): string {
  if (!canStoreDraft()) {
    return "";
  }

  return window.localStorage.getItem(storageKey) ?? "";
}

function canStoreDraft(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}
