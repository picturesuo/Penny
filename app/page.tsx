"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Folder, Plus, Sparkles } from "lucide-react";

type QuickNote = {
  id: string;
  title: string;
  body: string;
  date: string;
};

const initialQuickNotes: QuickNote[] = [
  {
    id: "learning-event",
    title: "January 1 mock learning event: what changed?",
    body: "A test learning event worth revisiting as Penny starts turning lightweight capture into structured memory.",
    date: "Jan 1, 2026",
  },
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
    () => quickNotes.find((note) => note.id === selectedNoteId) ?? quickNotes[0],
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
    <main className="min-h-screen bg-[#f4efe7] text-[#151515]">
      <section className="mx-auto grid min-h-screen w-full max-w-6xl gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[410px_1fr] lg:items-center lg:px-10">
        <div className="flex min-h-[680px] flex-col rounded-xl border border-[#d8d2c8] bg-[#fbf8f2] p-5 shadow-sm">
          <p className="text-2xl font-semibold text-[#625f59]">
            Capture a quick note
          </p>

          <div className="mt-8 flex items-center gap-4">
            <Folder className="h-8 w-8 text-[#696762]" strokeWidth={2} />
            <h2 className="text-3xl font-bold tracking-normal">Quick Notes</h2>
            <span className="ml-auto text-2xl font-bold text-[#74716b]">
              {quickNotes.length}
            </span>
          </div>

          <div className="mt-5 grid flex-1 grid-cols-[2px_1fr] gap-5">
            <div className="bg-[#ddd7cd]" aria-hidden="true" />

            <div className="space-y-3">
              <form onSubmit={handleAddQuickNote} className="space-y-2">
                <label htmlFor="quick-note" className="sr-only">
                  Add a quick note
                </label>
                <textarea
                  id="quick-note"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={4}
                  placeholder="Write a quick note..."
                  className="w-full resize-none rounded-xl border-2 border-[#0b67cf] bg-white px-4 py-3 text-2xl leading-8 text-[#151515] outline-none shadow-[0_0_0_1px_rgba(11,103,207,0.18)] placeholder:text-[#8b8984]"
                />
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#176f5d] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#125b4c] focus:outline-none focus:ring-2 focus:ring-[#176f5d] focus:ring-offset-2"
                  aria-label="Add quick note"
                  title="Add quick note"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add note
                </button>
              </form>

              <div className="space-y-3">
                {quickNotes.map((note) => {
                  const isSelected = note.id === selectedNote?.id;

                  return (
                    <button
                      type="button"
                      key={note.id}
                      onClick={() => setSelectedNoteId(note.id)}
                      className={`w-full rounded-xl border bg-white p-4 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[#176f5d] ${
                        isSelected
                          ? "border-[#176f5d] ring-2 ring-[#176f5d]/20"
                          : "border-[#d4d4d4] hover:border-[#aeb4ae]"
                      }`}
                    >
                      <span className="block truncate text-2xl font-bold leading-7">
                        {note.title}
                      </span>
                      <span className="mt-1 block text-xl font-semibold text-[#787570]">
                        {note.date}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="flex min-h-[680px] flex-col justify-between gap-8">
          <section className="rounded-xl border border-[#d8d2c8] bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 text-sm font-semibold uppercase text-[#176f5d]">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Selected quick note
            </div>
            <h3 className="mt-4 text-3xl font-semibold leading-tight">
              {selectedNote?.title}
            </h3>
            <p className="mt-3 text-sm font-semibold uppercase text-[#74716b]">
              {selectedNote?.date}
            </p>
            <p className="mt-5 text-xl leading-8 text-[#383c3a]">
              {selectedNote?.body}
            </p>
          </section>

          <section className="space-y-6">
            <div>
              <p className="text-sm font-semibold uppercase text-[#48615c]">
                Frozen for v0
              </p>
              <h1 className="mt-3 text-4xl font-semibold leading-tight text-[#111318]">
                Penny turns messy founder thinking into traceable product
                judgment.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4f5862]">
                Capture a raw thought, extract the claims inside it, inspect
                the graph, pressure-test the idea, and learn from the blocker
                without expanding the product surface.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {mvpItems.map((item) => (
                <div
                  key={item}
                  className="flex min-h-20 items-center gap-3 rounded-lg border border-[#d8dde2] bg-white p-4 shadow-sm"
                >
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 border border-[#16745f] bg-[#dff4ec]"
                  />
                  <p className="text-base font-semibold leading-6 text-[#191b1f]">
                    {item}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
