import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const commandPaletteHookPath = new URL("../../apps/web/src/hooks/useCommandPalette.ts", import.meta.url);
const pennyShellPath = new URL("../../apps/web/components/penny-shell.tsx", import.meta.url);
const commandPalettePath = new URL("../../apps/web/src/components/command/CommandPalette.tsx", import.meta.url);

test("Penny keyboard shortcuts are centralized in the command palette hook", async () => {
  const [hook, shell] = await Promise.all([readFile(commandPaletteHookPath, "utf8"), readFile(pennyShellPath, "utf8")]);

  assert.match(hook, /isCommandK/);
  assert.match(hook, /open\(\)/);
  assert.match(hook, /event\.key === "Escape"/);
  assert.match(hook, /onClearSelection/);
  assert.match(hook, /event\.key === "\/"/);
  assert.match(hook, /onFocusContextInput/);
  assert.match(hook, /b: "brain"/);
  assert.match(hook, /c: "challenge"/);
  assert.match(hook, /l: "learn"/);
  assert.match(hook, /isEditableTarget\(event\.target\)/);
  assert.doesNotMatch(shell, /function handleWorkspaceShortcut/);
});

test("Penny shell wires shortcuts to mode, selection, and capture context", async () => {
  const shell = await readFile(pennyShellPath, "utf8");

  assert.match(shell, /onSwitchMode/);
  assert.match(shell, /void switchMode\(mode\)/);
  assert.match(shell, /onClearSelection/);
  assert.match(shell, /setSelectedNodeId\(null\)/);
  assert.match(shell, /onFocusContextInput/);
  assert.match(shell, /claimComposerTextareaRef\.current\.focus\(\)/);
  assert.match(shell, /aria-keyshortcuts="Meta\+K Control\+K \/"?/);
  assert.match(shell, /aria-keyshortcuts=\{mode\.id\.slice\(0, 1\)\}/);
});

test("shortcut hints are visible where users need them", async () => {
  const [shell, palette] = await Promise.all([readFile(pennyShellPath, "utf8"), readFile(commandPalettePath, "utf8")]);

  assert.match(shell, /<kbd>⌘K<\/kbd>/);
  assert.match(shell, /<kbd>\/<\/kbd>/);
  assert.match(shell, /<kbd>\{mode\.label\.slice\(0, 1\)\}<\/kbd>/);
  assert.match(shell, /Esc clears/);
  assert.match(shell, /Press \/ from Brain to focus this capture box/);
  assert.match(palette, /<kbd>Esc<\/kbd>/);
});
