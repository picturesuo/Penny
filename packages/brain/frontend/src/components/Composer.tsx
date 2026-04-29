import { type FormEvent, useState } from "react";

interface ComposerProps {
  disabled: boolean;
  status: string;
  onSubmit: (rawIdea: string) => Promise<void>;
}

export function Composer({ disabled, status, onSubmit }: ComposerProps) {
  const [rawIdea, setRawIdea] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!rawIdea.trim()) {
      return;
    }

    await onSubmit(rawIdea.trim());
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
