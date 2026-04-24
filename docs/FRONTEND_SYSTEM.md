# Penny Frontend System

## Purpose

This document defines the first reusable visual foundation for the Penny MVP shell. It is intentionally UI-only: no backend contracts, AI behavior, or graph logic belong here.

## Design Tokens

Tokens live in `apps/web/styles/tokens.css` as CSS custom properties and are mirrored where useful in `apps/web/lib/design/tokens.ts`.

- Colors: canvas, raised canvas, panel, ink, muted text, line, success, danger.
- Spacing: `--space-1` through `--space-12`, based on a 4px step.
- Typography: system sans stack, mono stack, fixed text sizes from `--text-xs` to `--text-2xl`.
- Radius: `--radius-xs`, `--radius-sm`, `--radius-md`, `--radius-lg`; cards and controls should stay at 8px unless a larger shell container needs 12px.
- Shadows: `--shadow-sm`, `--shadow-md`, `--shadow-lg`, used sparingly on panels and the workspace hero.
- Borders: `--border-subtle` and `--border-strong`.
- Mode accents:
  - Brain: green, for organization and current workspace state.
  - Challenge: clay, for critique and stress testing.
  - Learn: blue, for teach-back and understanding.

## Components

Reusable primitives live in `apps/web/components/ui`.

- `Button`: primary, secondary, ghost, and danger variants with optional compact sizing and icon slot.
- `Card`: repeated-item framing only.
- `Panel`: larger workspace sections with optional eyebrow and title.
- `Badge`: neutral, success, danger, and mode-accent variants.
- `SegmentedTabs`: mode switcher for Brain, Challenge, and Learn.
- `Input` and `Textarea`: labeled field wrappers.
- `EmptyState`, `LoadingState`, `ErrorState`: standard non-happy path surfaces.
- `ConfidenceBadge`: normalized confidence display.

## Layout

Reusable layout wrappers live in `apps/web/components/layout`.

- `AppShell`: full Penny frame.
- `SidebarNav`: left navigation with Penny logo, modes, spheres, recent sessions, and account area.
- `TopToolbar`: breadcrumb, search, filter placeholder, New Thought action, and settings placeholder.
- `WorkspaceLayout`: main workspace plus inspector rail.
- `InspectorRail`: right-side contextual rail.

## Visual Rules

- Keep the MVP app work-focused, dense, and calm.
- Use cards for repeated items, not as page-section decoration.
- Use `Panel` for major workspace areas and `Card` for repeated claim/session/mode items.
- Keep Brain, Challenge, and Learn accents consistent across nav, badges, and segmented controls.
- Do not add heavy graph rendering in this shell layer.
- Do not introduce backend fetches into design-system components.
- Do not edit AI files from this frontend system slice.
