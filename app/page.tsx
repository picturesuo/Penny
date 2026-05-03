export const metadata = {
  title: "Penny v0 MVP",
  description: "The locked Penny MVP checklist and freeze policy.",
};

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

const guardrails = [
  "Fix blockers that prevent a locked item from working.",
  "Fix failing typecheck, build, or MVP verification tests.",
  "Fix security, ownership, data-loss, or startup issues.",
  "Update release notes, test docs, or version metadata for v0.",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--background)] text-[#191b1f]">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-12 px-6 py-12 sm:px-8 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[1fr_380px] lg:items-end">
          <div className="max-w-3xl">
            <p className="mb-4 text-sm font-semibold uppercase text-[#48615c]">
              Frozen for v0
            </p>
            <h1 className="text-4xl font-semibold leading-tight text-[#111318]">
              Penny turns messy founder thinking into traceable product
              judgment.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#4f5862]">
              The v0 MVP is locked to one path: capture a thought, extract the
              claims inside it, inspect the graph, pressure-test the idea, and
              learn from the blocker without expanding the product surface.
            </p>
          </div>

          <aside className="border-l-4 border-[#16745f] bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase text-[#16745f]">
              Release target
            </p>
            <p className="mt-3 font-mono text-3xl font-semibold text-[#111318]">
              v0-mvp
            </p>
            <p className="mt-4 text-sm leading-6 text-[#4f5862]">
              Tag only from a verified commit containing the locked checklist
              and passing the MVP verification commands.
            </p>
          </aside>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {mvpItems.map((item) => (
            <div
              key={item}
              className="flex min-h-28 flex-col justify-between rounded-lg border border-[#d8dde2] bg-white p-5 shadow-sm"
            >
              <span
                aria-hidden="true"
                className="mb-6 h-4 w-4 border border-[#16745f] bg-[#dff4ec]"
              />
              <p className="text-base font-semibold leading-6 text-[#191b1f]">
                {item}
              </p>
            </div>
          ))}
        </div>

        <section className="grid gap-6 border-t border-[#d8dde2] pt-8 lg:grid-cols-[280px_1fr]">
          <div>
            <p className="text-sm font-semibold uppercase text-[#48615c]">
              Freeze policy
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-[#111318]">
              No new feature work before v0.
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {guardrails.map((guardrail) => (
              <p
                key={guardrail}
                className="rounded-lg border border-[#d8dde2] bg-white p-4 text-sm leading-6 text-[#4f5862]"
              >
                {guardrail}
              </p>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
