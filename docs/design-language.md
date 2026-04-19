# Design Language

## Visual Thesis

Penny should feel like a built city, not a notes dump.

- Density should win over breadth.
- Structure should emerge from thinking, not from decorative UI ceremony.
- The primary surfaces should feel deliberate, legible, and load-bearing.

## Product Hierarchy

- `/app` is the canonical signed-in home.
- The dashboard is a directing surface, not the hero.
- The workspace is where the work happens.
- The graph is a structural minimap, not the whole product.
- Knowledge cards should feel more important than chrome.

## Typography

- Use an expressive serif for display moments.
- Use a clean sans for body copy and controls.
- Keep headlines compact and high-contrast.
- Prefer readable rhythm over oversized marketing copy.

## Layout

- Use strong sectional grouping and clear spacing between modes.
- Keep the active work surface front and center.
- Preserve progressive disclosure so the user can stay in the tunnel without losing the surrounding structure.
- Avoid flat dashboard-grid sameness when a surface should feel like a specific instrument.

## Color And Surfaces

- Use neutral foundations with one or two confident accent treatments.
- Let healthy, stressed, and fragile states read differently.
- Use saturated signals sparingly so they mean something.
- Keep panel backgrounds and borders doing real structural work.

## Motion

- Motion should clarify state changes, not decorate them.
- Use small entry transitions for major surfaces.
- Use staggered reveals where they help the hierarchy read.
- Avoid noisy micro-interactions that do not carry meaning.

## Surface Rules

- The dashboard should summarize state and direct the next move.
- The workspace should make claim context, history, critique, and response visible in one place.
- The challenge round should read as a dedicated card, not a cramped inline block.
- The auth flow should be simple and emotionally quiet.

## Navigation Tone

- The route structure should feel consistent.
- One canonical home path exists for signed-in users: `/app`.
- Public entry, dashboard home, and workspace routes each have a clear job.
- Legacy routes should redirect instead of competing with the canonical path.

## What To Avoid

- Generic SaaS gradients.
- Chatbot sidebars pretending to be a product.
- Over-busy cards that flatten important distinctions.
- Decorative motion that does not change understanding.
- Visual language that makes the graph the hero when the claim is the real unit of work.

## Practical Standard

If a new surface cannot explain its hierarchy in a sentence, it is probably doing too much.

If a new surface does not make the current claim, the current move, or the current decision easier to read, it should be simplified.
