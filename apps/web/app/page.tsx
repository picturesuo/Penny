import { HealthCheck } from "./health-check";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 880,
          display: "grid",
          gap: 24,
          padding: 32,
          borderRadius: 24,
          border: "1px solid rgba(18, 16, 14, 0.08)",
          background: "rgba(255,255,255,0.72)",
          boxShadow: "0 24px 60px rgba(18, 16, 14, 0.08)",
        }}
      >
        <section>
          <p
            style={{
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.18em",
              fontSize: 12,
              color: "#4f8a7b",
            }}
          >
            Penny restart
          </p>
          <h1 style={{ marginBottom: 12, fontSize: "clamp(2rem, 4vw, 3.5rem)" }}>Penny restart successful.</h1>
          <p style={{ margin: 0, lineHeight: 1.7, color: "#2a2927" }}>
            This is a clean monorepo rebuild with a fresh Next.js frontend, a Fastify API, and one shared TypeScript
            package.
          </p>
        </section>
        <HealthCheck />
      </div>
    </main>
  );
}
