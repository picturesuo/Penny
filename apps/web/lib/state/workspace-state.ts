"use client";

import { useSyncExternalStore } from "react";

export type WorkspaceMode = "brain" | "challenge" | "learn";

export type WorkspaceState = {
  selectedNodeId: string | null;
  currentMode: WorkspaceMode;
  activeSessionId: string | null;
};

const initialWorkspaceState: WorkspaceState = {
  selectedNodeId: null,
  currentMode: "brain",
  activeSessionId: null,
};

let workspaceState = initialWorkspaceState;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function getSnapshot() {
  return workspaceState;
}

function getServerSnapshot() {
  return initialWorkspaceState;
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function setWorkspaceState(update: Partial<WorkspaceState> | ((current: WorkspaceState) => Partial<WorkspaceState>)) {
  const patch = typeof update === "function" ? update(workspaceState) : update;
  const nextState = {
    ...workspaceState,
    ...patch,
  };

  if (
    nextState.selectedNodeId === workspaceState.selectedNodeId &&
    nextState.currentMode === workspaceState.currentMode &&
    nextState.activeSessionId === workspaceState.activeSessionId
  ) {
    return;
  }

  workspaceState = nextState;
  emitChange();
}

export function setSelectedNodeId(selectedNodeId: string | null) {
  setWorkspaceState({ selectedNodeId });
}

export function setCurrentMode(currentMode: WorkspaceMode) {
  setWorkspaceState({ currentMode });
}

export function setActiveSessionId(activeSessionId: string | null) {
  setWorkspaceState({ activeSessionId });
}

export function useWorkspaceState() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    ...state,
    setSelectedNodeId,
    setCurrentMode,
    setActiveSessionId,
  };
}
