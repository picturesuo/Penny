"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Newspaper, Plus } from "lucide-react";

type QuickNote = {
  id: string;
  title: string;
  body: string;
  date: string;
};

const fallbackQuickNote: QuickNote = {
  id: "learning-event",
  title: "January 1 mock learning event: what changed?",
  body: "A test learning event worth revisiting as Penny starts turning lightweight capture into structured memory.",
  date: "Jan 1, 2026",
};

const initialQuickNotes: QuickNote[] = [
  fallbackQuickNote,
  {
    id: "test-note",
    title: "Hello this is a test for quick note",
    body: "A short captured note that should be easy to reopen and expand without leaving the landing surface.",
    date: "May 2, 2026",
  },
  {
    id: "core-idea",
    title: "Core idea: I want to learn what Y Combinator misses",
    body: "Use quick notes as raw seed material, then route the strongest notes into assumptions, challenge, and learn loops.",
    date: "May 2, 2026",
  },
];

const mvpItems = [
  "Capture thought",
  "Extract claims",
  "Visualize graph",
  "Inspect node",
  "Rate confidence",
  "Search with Cmd+K",
  "Challenge idea",
  "Learn blocker",
];

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function summarizeNote(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");

  if (trimmed.length <= 58) {
    return trimmed;
  }

  return `${trimmed.slice(0, 55)}...`;
}

export default function Home() {
  const [quickNotes, setQuickNotes] = useState(initialQuickNotes);
  const [draft, setDraft] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState(initialQuickNotes[0].id);

  const selectedNote = useMemo(
    () =>
      quickNotes.find((note) => note.id === selectedNoteId) ??
      quickNotes[0] ??
      fallbackQuickNote,
    [quickNotes, selectedNoteId],
  );

  function handleAddQuickNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = draft.trim();

    if (!body) {
      return;
    }

    const note: QuickNote = {
      id: `quick-note-${Date.now()}`,
      title: summarizeNote(body),
      body,
      date: formatDate(new Date()),
    };

    setQuickNotes((notes) => [note, ...notes]);
    setSelectedNoteId(note.id);
    setDraft("");
  }

  return (
    <main className="min-h-screen bg-[#f7f1e8] px-4 py-5 text-[#111] sm:px-7">
      <section className="mx-auto min-h-[calc(100vh-40px)] w-full max-w-7xl border-y-4 border-[#111]">
        <header className="border-b border-[#111] py-4 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.42em] text-[#3f3b35]">
            Capture a quick note
          </p>
          <div className="mt-3 flex items-center justify-center gap-3">
            <Newspaper className="h-8 w-8" aria-hidden="true" />
            <h1 className="text-5xl font-bold leading-none sm:text-7xl">
              Quick Notes
            </h1>
          </div>
          <p className="mt-2 text-sm font-bold uppercase tracking-[0.32em]">
            {quickNotes.length} notes in the penny desk
          </p>
        </header>

        <div className="grid gap-0 lg:grid-cols-[360px_minmax(0,1fr)_330px]">
          <aside className="border-b border-[#111] py-5 lg:border-b-0 lg:border-r lg:pr-5">
            <form onSubmit={handleAddQuickNote} className="space-y-3">
              <label
                htmlFor="quick-note"
                className="block text-xs font-bold uppercase tracking-[0.28em]"
              >
                Add a quick note
              </label>
              <textarea
                id="quick-note"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={5}
                placeholder="Write a quick note..."
                className="w-full resize-none border border-[#111] bg-[#fffdf7] px-4 py-3 text-lg leading-7 text-[#111] outline-none placeholder:text-[#6f6a60] focus:ring-2 focus:ring-[#111]"
              />
              <button
                type="submit"
                className="inline-flex min-h-10 items-center gap-2 border border-[#111] bg-[#111] px-4 text-sm font-bold uppercase tracking-[0.16em] text-[#f7f1e8] transition hover:bg-[#34302b] focus:outline-none focus:ring-2 focus:ring-[#111] focus:ring-offset-2 focus:ring-offset-[#f7f1e8]"
                aria-label="Add quick note"
                title="Add quick note"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add note
              </button>
            </form>

            <div className="mt-6 border-t border-[#111]">
              {quickNotes.map((note) => {
                const isSelected = note.id === selectedNote.id;

                return (
                  <button
                    type="button"
                    key={note.id}
                    onClick={() => setSelectedNoteId(note.id)}
                    className={`block w-full border-b border-[#111] px-0 py-4 text-left transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#111] ${
                      isSelected ? "bg-[#ece2d2]" : "hover:bg-[#f0e8dc]"
                    }`}
                  >
                    <span className="block px-3 text-xl font-bold leading-6">
                      {note.title}
                    </span>
                    <span className="mt-2 block px-3 text-xs font-bold uppercase tracking-[0.18em] text-[#666157]">
                      {note.date}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <article className="px-0 py-6 lg:px-7">
            <p className="border-y border-[#111] py-2 text-xs font-bold uppercase tracking-[0.3em] text-[#4b463e]">
              Selected quick note
            </p>
            <h2 className="mt-5 max-w-4xl text-4xl font-bold leading-[0.95] sm:text-6xl">
              {selectedNote.title}
            </h2>
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.24em] text-[#6d675d]">
              {selectedNote.date}
            </p>
            <p className="mt-8 max-w-3xl border-l-4 border-[#111] pl-5 text-2xl leading-9 text-[#27241f]">
              {selectedNote.body}
            </p>

            <section className="mt-12 border-t-2 border-[#111] pt-6">
              <p className="text-xs font-bold uppercase tracking-[0.32em] text-[#4f5d59]">
                Frozen for v0
              </p>
              <h3 className="mt-4 max-w-4xl text-3xl font-bold leading-tight sm:text-5xl">
                Penny turns messy founder thinking into traceable product
                judgment.
              </h3>
              <p className="mt-5 max-w-3xl text-xl leading-8 text-[#454139]">
                Capture a raw thought, extract the claims inside it, inspect
                the graph, pressure-test the idea, and learn from the blocker
                without expanding the product surface.
              </p>
            </section>
          </article>

          <aside className="border-t border-[#111] py-6 lg:border-l lg:border-t-0 lg:pl-5">
            <p className="border-b border-[#111] pb-2 text-xs font-bold uppercase tracking-[0.28em]">
              MVP loop
            </p>
            <ol className="divide-y divide-[#111]">
              {mvpItems.map((item, index) => (
                <li
                  key={item}
                  className="grid grid-cols-[2.5rem_1fr] gap-3 py-4"
                >
                  <span className="text-2xl font-bold leading-none">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <p className="text-xl font-bold leading-6">{item}</p>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </section>
    </main>
  );
}
