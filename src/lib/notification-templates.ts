import type { BlindSpotMap } from "@/types/thought-map";
import type { EmailTemplate } from "@/types/notifications";

export interface RevisitQueueEmailItem {
  claimId: string;
  mapId: string;
  claimText: string;
  currentConfidence: number;
  schedulingReason: {
    description: string;
  };
}

export interface ResolutionReminderClaim {
  id: string;
  mapId: string;
  claimText: string;
  confidence: number;
  resolutionDate: string;
  status: string;
}

function truncateClaim(text: string, maxLength = 120) {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1).trim()}…` : trimmed;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildClaimUrl(mapId: string, claimId: string) {
  return `/app/maps/${mapId}?claim=${encodeURIComponent(claimId)}`;
}

function buildMapUrl(mapId: string) {
  return `/app/maps/${mapId}`;
}

function buildQueueUrl(userId: string) {
  return `/app?user=${encodeURIComponent(userId)}#revisit-queue`;
}

function buildBlindSpotUrl(userId: string) {
  return `/app?user=${encodeURIComponent(userId)}#blind-spots`;
}

function buildParagraphs(lines: string[]) {
  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n");
}

export function buildRevisitQueueEmail(
  userId: string,
  queueItems: RevisitQueueEmailItem[],
  userFirstName: string,
): EmailTemplate {
  const topItems = queueItems.slice(0, 3);
  const firstItem = topItems[0];

  return {
    subject: `${topItems.length} claim${topItems.length === 1 ? "" : "s"} worth revisiting today`,
    preview: firstItem ? `"${truncateClaim(firstItem.claimText)}" — ${firstItem.schedulingReason.description}` : "Penny found a few claims worth another pass.",
    bodyText: [
      `${userFirstName},`,
      `Penny has flagged ${queueItems.length} claim${queueItems.length === 1 ? "" : "s"} for review.`,
      ...topItems.map(
        (item) =>
          `- "${truncateClaim(item.claimText)}" | ${item.schedulingReason.description} | Current confidence: ${item.currentConfidence}% | Review: ${buildClaimUrl(item.mapId, item.claimId)}`,
      ),
      `Open your full revisit queue: ${buildQueueUrl(userId)}`,
    ].join("\n"),
    bodyHtml: `
      ${buildParagraphs([`${userFirstName},`, `Penny has flagged ${queueItems.length} claim${queueItems.length === 1 ? "" : "s"} for review.`])}
      <div class="notification-list">
        ${topItems
          .map(
            (item) => `
              <article class="notification-item" style="margin:16px 0;padding:16px;border:1px solid rgba(15,23,42,.08);border-radius:20px;background:#fff;">
                <p style="margin:0 0 8px;font-size:14px;line-height:24px;color:#0f172a;">"${escapeHtml(truncateClaim(item.claimText))}"</p>
                <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:#6b7280;">${escapeHtml(item.schedulingReason.description)}</p>
                <p style="margin:0 0 12px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#6b7280;">Current confidence: ${item.currentConfidence}%</p>
                <a href="${buildClaimUrl(item.mapId, item.claimId)}" style="display:inline-block;border-radius:999px;background:#22272e;color:#fff;padding:10px 16px;text-decoration:none;font-size:13px;font-weight:600;">Review this claim</a>
              </article>
            `,
          )
          .join("")}
      </div>
      <p>
        <a href="${buildQueueUrl(userId)}" style="display:inline-block;border-radius:999px;background:#fff;border:1px solid rgba(15,23,42,.12);color:#0f172a;padding:10px 16px;text-decoration:none;font-size:13px;font-weight:600;">Open your full revisit queue</a>
      </p>
    `,
    ctaLabel: "Open revisit queue",
    ctaUrl: buildQueueUrl(userId),
  };
}

export function buildResolutionDueEmail(
  claim: ResolutionReminderClaim,
  userFirstName: string,
  daysUntilDue: number,
): EmailTemplate {
  const urgencyPhrase =
    daysUntilDue < 0
      ? `is overdue by ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? "" : "s"}`
      : daysUntilDue === 0
        ? "resolves today"
        : daysUntilDue === 1
          ? "resolves tomorrow"
          : `resolves in ${daysUntilDue} days`;
  const reminderLabel =
    daysUntilDue < 0
      ? "Resolve the overdue prediction"
      : daysUntilDue === 0
        ? "Resolve today"
        : "Resolve this prediction";

  return {
    subject: `A prediction ${urgencyPhrase}`,
    preview: truncateClaim(claim.claimText),
    bodyText: [
      `${userFirstName},`,
      `A prediction you made with ${claim.confidence}% confidence ${urgencyPhrase}.`,
      `"${truncateClaim(claim.claimText)}"`,
      `When you are ready, Penny will walk you through the resolution and calibration update.`,
      `Open the map: ${buildMapUrl(claim.mapId)}`,
    ].join("\n"),
    bodyHtml: `
      ${buildParagraphs([`${userFirstName},`, `A prediction you made with ${claim.confidence}% confidence ${urgencyPhrase}.`])}
      <blockquote style="margin:16px 0;padding:16px 20px;border-left:4px solid #22272e;background:#f8f4eb;">"${escapeHtml(truncateClaim(claim.claimText))}"</blockquote>
      <p>Penny will walk you through the resolution and calibration update.</p>
      <p><a href="${buildMapUrl(claim.mapId)}?resolve=true" style="display:inline-block;border-radius:999px;background:#22272e;color:#fff;padding:10px 16px;text-decoration:none;font-size:13px;font-weight:600;">${escapeHtml(reminderLabel)}</a></p>
    `,
    ctaLabel: reminderLabel,
    ctaUrl: `${buildMapUrl(claim.mapId)}?resolve=true`,
  };
}

export function buildBlindSpotDigestEmail(blindSpotMap: BlindSpotMap, userFirstName: string): EmailTemplate {
  const topBlindSpot = blindSpotMap.untestedHighConfidenceClaims[0];
  const topDomain = blindSpotMap.unexaminedDomains[0];

  return {
    subject: "Your weekly blind spot digest",
    preview: topBlindSpot
      ? `High confidence claim that has never been challenged: "${truncateClaim(topBlindSpot.claimText)}"`
      : topDomain
        ? `${topDomain.domain} - ${topDomain.stressTestedPercent}% tested`
        : "Penny did not find a blind spot worth surfacing this week.",
    bodyText: [
      `${userFirstName},`,
      "Here are the areas that have gone longest without examination:",
      topBlindSpot
        ? `- High-confidence, never challenged: "${truncateClaim(topBlindSpot.claimText)}" (${topBlindSpot.confidence}% confidence, ${topBlindSpot.daysSinceCreation} days old, ${topBlindSpot.dialecticRoundCount} critique rounds)`
        : "- No single claim stood out as an untested high-confidence blind spot.",
      topDomain
        ? `- Most under-tested domain: ${topDomain.domain} (${topDomain.stressTestedPercent}% tested across ${topDomain.claimCount} claims)`
        : "- No under-tested domain crossed the current threshold.",
      `View the full blind spot map: ${buildBlindSpotUrl(blindSpotMap.userId)}`,
    ].join("\n"),
    bodyHtml: `
      ${buildParagraphs([`${userFirstName},`, "Here are the areas that have gone longest without examination:"])}
      ${
        topBlindSpot
          ? `
            <article style="margin:16px 0;padding:16px;border:1px solid rgba(15,23,42,.08);border-radius:20px;background:#fff;">
              <p style="margin:0 0 8px;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:#6b7280;">High-confidence, never challenged</p>
              <blockquote style="margin:0 0 10px;padding:0 0 0 16px;border-left:4px solid #22272e;">"${escapeHtml(truncateClaim(topBlindSpot.claimText))}"</blockquote>
              <p style="margin:0 0 12px;font-size:13px;line-height:20px;color:#6b7280;">${topBlindSpot.confidence}% confidence, ${topBlindSpot.daysSinceCreation} days old, ${topBlindSpot.dialecticRoundCount} critique rounds</p>
              <a href="${buildBlindSpotUrl(blindSpotMap.userId)}" style="display:inline-block;border-radius:999px;background:#22272e;color:#fff;padding:10px 16px;text-decoration:none;font-size:13px;font-weight:600;">Review this blind spot</a>
            </article>
          `
          : ""
      }
      ${
        topDomain
          ? `
            <article style="margin:16px 0;padding:16px;border:1px solid rgba(15,23,42,.08);border-radius:20px;background:#f8f4eb;">
              <p style="margin:0 0 8px;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:#6b7280;">Domain gap</p>
              <p style="margin:0;font-size:14px;line-height:24px;color:#0f172a;">${escapeHtml(topDomain.domain)} is only ${topDomain.stressTestedPercent}% stress-tested across ${topDomain.claimCount} claims.</p>
            </article>
          `
          : ""
      }
      <p>
        <a href="${buildBlindSpotUrl(blindSpotMap.userId)}" style="display:inline-block;border-radius:999px;background:#fff;border:1px solid rgba(15,23,42,.12);color:#0f172a;padding:10px 16px;text-decoration:none;font-size:13px;font-weight:600;">View your full blind spot map</a>
      </p>
    `,
    ctaLabel: "Open blind spot map",
    ctaUrl: buildBlindSpotUrl(blindSpotMap.userId),
  };
}
