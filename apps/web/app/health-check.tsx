"use client";

import { useState } from "react";
import type { HealthResponse } from "@penny/shared";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

type HealthState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: HealthResponse }
  | { status: "error"; message: string };

export function HealthCheck() {
  const [state, setState] = useState<HealthState>({ status: "idle" });

  async function checkHealth() {
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
        onClick={checkHealth}
        style={{
          background: "#b66a3c",
          color: "#f6f1e8",
          border: "none",
          borderRadius: 999,
          padding: "12px 18px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {state.status === "loading" ? "Checking..." : "Check backend health"}
      </button>
      <p style={{ marginTop: 16, color: "#2a2927" }}>
        API base URL: <code>{apiBaseUrl}</code>
      </p>
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
        <p style={{ marginTop: 16, color: "#b00020" }}>{state.message}</p>
      ) : null}
    </section>
  );
}
