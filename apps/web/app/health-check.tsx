"use client";

import { useState } from "react";
import type { HealthResponse } from "@penny/shared";
import { EmptyState, ErrorState, LoadingState } from "../components/ui";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

type HealthState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: HealthResponse }
  | { status: "error"; message: string };

export function HealthCheck() {
  const [state, setState] = useState<HealthState>({ status: "idle" });
  const isLoading = state.status === "loading";

  async function checkHealth() {
    if (isLoading) {
      return;
    }

    setState({ status: "loading" });

    try {
      const response = await fetch(`${apiBaseUrl}/health`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Health check failed with status ${response.status}.`);
      }

      const data = (await response.json()) as HealthResponse;
      setState({ status: "success", data });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Unknown health check failure.",
      });
    }
  }

  return (
    <section
      style={{
        border: "1px solid rgba(18, 16, 14, 0.12)",
        borderRadius: 16,
        padding: 24,
        background: "rgba(255,255,255,0.75)",
      }}
    >
      <h2 style={{ marginTop: 0 }}>Backend health</h2>
      <p style={{ lineHeight: 1.6 }}>Call the Fastify backend and confirm the restart wiring is live.</p>
      <button
        type="button"
        disabled={isLoading}
        onClick={checkHealth}
        style={{
          background: "#b66a3c",
          color: "#f6f1e8",
          border: "none",
          borderRadius: 999,
          padding: "12px 18px",
          fontWeight: 600,
          cursor: isLoading ? "not-allowed" : "pointer",
          opacity: isLoading ? 0.64 : 1,
        }}
      >
        {isLoading ? "Checking..." : "Check backend health"}
      </button>
      <p style={{ marginTop: 16, color: "#2a2927" }}>
        API base URL: <code>{apiBaseUrl}</code>
      </p>
      {state.status === "idle" ? (
        <EmptyState
          actionLabel="Run health check"
          body="No backend request has been sent from this browser session yet."
          onAction={() => {
            void checkHealth();
          }}
          title="Backend health not checked"
        />
      ) : null}
      {state.status === "loading" ? <LoadingState label="Checking backend health." /> : null}
      {state.status === "success" ? (
        <pre
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 12,
            background: "#12100e",
            color: "#f6f1e8",
            overflowX: "auto",
          }}
        >
          {JSON.stringify(state.data, null, 2)}
        </pre>
      ) : null}
      {state.status === "error" ? (
        <ErrorState
          actionLabel="Retry health check"
          message="Penny could not reach the backend health endpoint. Check that the API server is running, then retry."
          onAction={() => {
            void checkHealth();
          }}
          technicalDetail={state.message}
          title="Backend health check failed"
        />
      ) : null}
    </section>
  );
}
