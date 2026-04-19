"use client";

import { useEffect, useState } from "react";
import { Bell, Clock3, RefreshCw, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { NotificationPreferences, NotificationSchedule } from "@/types/notifications";

const WEEKDAY_LABELS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
] as const;

function createDefaultPreferences(userId: string): NotificationPreferences {
  return {
    userId,
    emailEnabled: true,
    pushEnabled: false,
    inAppEnabled: true,
    revisitQueueDigest: "daily",
    resolutionReminders: "always",
    blindSpotDigest: "weekly",
    featureUnlockAlerts: true,
    sessionStartSuggestion: "weekday_mornings",
    customSchedule: null,
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "08:00",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York",
  };
}

function formatChannels(preferences: NotificationPreferences) {
  const channels: string[] = [];
  if (preferences.emailEnabled) channels.push("email");
  if (preferences.inAppEnabled) channels.push("in-app");
  if (preferences.pushEnabled) channels.push("push");
  return channels.length ? channels.join(" · ") : "none";
}

function updateDaySelection(schedule: NotificationSchedule | null, day: number) {
  const currentDays = schedule?.daysOfWeek ?? [];
  const nextDays = currentDays.includes(day) ? currentDays.filter((value) => value !== day) : [...currentDays, day];
  return {
    daysOfWeek: nextDays.sort((a, b) => a - b),
    timeOfDay: schedule?.timeOfDay ?? "09:00",
  };
}

export interface NotificationPreferencesProps {
  userId: string;
}

export function NotificationPreferencesView({ userId }: NotificationPreferencesProps) {
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/users/${userId}/notification-preferences`);
        if (!response.ok) {
          throw new Error("Could not load notification preferences.");
        }

        const payload = (await response.json()) as { preferences: NotificationPreferences };
        if (!cancelled) {
          setPreferences(payload.preferences);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load notification preferences.");
          setPreferences(createDefaultPreferences(userId));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  function updatePreference<K extends keyof NotificationPreferences>(key: K, value: NotificationPreferences[K]) {
    setPreferences((current) => (current ? { ...current, [key]: value } : current));
  }

  async function savePreferences() {
    if (!preferences) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/users/${userId}/notification-preferences`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(preferences),
      });

      if (!response.ok) {
        throw new Error("Could not save notification preferences.");
      }

      const payload = (await response.json()) as { preferences: NotificationPreferences };
      setPreferences(payload.preferences);
      setLastSavedAt(new Date());
    } finally {
      setSaving(false);
    }
  }

  if (!preferences) {
    return (
      <Card className="p-6 sm:p-8">
        <div className="flex items-center gap-2">
          <Bell className="size-5 text-[var(--ink)]" />
          <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Notifications</p>
        </div>
        <h2 className="mt-3 text-3xl font-semibold text-[var(--ink)] sm:text-4xl">Active presence settings</h2>
        <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
          Penny can nudge you about revisit queues, resolutions, blind spots, and session starts even when you are not in the app.
        </p>
        <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">{loading ? "Loading preferences..." : "Preparing notification preferences..."}</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <Bell className="size-5 text-[var(--ink)]" />
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Notifications</p>
          </div>
          <h2 className="mt-3 text-3xl font-semibold text-[var(--ink)] sm:text-4xl">Active presence settings</h2>
          <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
            Penny can nudge you about revisit queues, resolution dates, blind spots, and session starts even when you are not in the app.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-white text-[var(--ink)]">{formatChannels(preferences)}</Badge>
          <Badge className="bg-[#d9ead8] text-[#355b32]">{preferences.timezone}</Badge>
          {preferences.quietHoursEnabled ? <Badge className="bg-[#fff6ed] text-[#8b4d1f]">Quiet hours on</Badge> : null}
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Channels</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                { key: "emailEnabled", label: "Email" },
                { key: "inAppEnabled", label: "In app" },
                { key: "pushEnabled", label: "Push" },
              ].map((channel) => (
                <label key={channel.key} className="flex items-center gap-3 rounded-[18px] bg-white px-4 py-3">
                  <input
                    type="checkbox"
                    checked={preferences[channel.key as "emailEnabled" | "inAppEnabled" | "pushEnabled"]}
                    onChange={(event) =>
                      setPreferences((current) =>
                        current
                          ? ({
                              ...current,
                              [channel.key]: event.target.checked,
                            } as NotificationPreferences)
                          : current,
                      )
                    }
                    className="size-4 rounded border-black/20"
                  />
                  <span className="text-sm font-medium text-[var(--ink)]">{channel.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Frequency controls</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--ink)]">Revisit queue digest</span>
                <select
                  value={preferences.revisitQueueDigest}
                  onChange={(event) => updatePreference("revisitQueueDigest", event.target.value as NotificationPreferences["revisitQueueDigest"])}
                  className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink)]"
                >
                  <option value="daily">Daily</option>
                  <option value="every_3_days">Every 3 days</option>
                  <option value="weekly">Weekly</option>
                  <option value="off">Off</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--ink)]">Resolution reminders</span>
                <select
                  value={preferences.resolutionReminders}
                  onChange={(event) => updatePreference("resolutionReminders", event.target.value as NotificationPreferences["resolutionReminders"])}
                  className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink)]"
                >
                  <option value="always">Always</option>
                  <option value="high_stakes_only">High stakes only</option>
                  <option value="off">Off</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--ink)]">Blind spot digest</span>
                <select
                  value={preferences.blindSpotDigest}
                  onChange={(event) => updatePreference("blindSpotDigest", event.target.value as NotificationPreferences["blindSpotDigest"])}
                  className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink)]"
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="off">Off</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--ink)]">Session start suggestion</span>
                <select
                  value={preferences.sessionStartSuggestion}
                  onChange={(event) => updatePreference("sessionStartSuggestion", event.target.value as NotificationPreferences["sessionStartSuggestion"])}
                  className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink)]"
                >
                  <option value="weekday_mornings">Weekday mornings</option>
                  <option value="custom">Custom schedule</option>
                  <option value="off">Off</option>
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Quiet hours</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">Pause notifications when Penny should stay out of the way.</p>
              </div>
              <label className="inline-flex items-center gap-3 rounded-full bg-white px-4 py-2 text-sm font-medium text-[var(--ink)]">
                <input
                  type="checkbox"
                  checked={preferences.quietHoursEnabled}
                  onChange={(event) => updatePreference("quietHoursEnabled", event.target.checked)}
                  className="size-4 rounded border-black/20"
                />
                Enabled
              </label>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--ink)]">Start</span>
                <input
                  type="time"
                  value={preferences.quietHoursStart}
                  onChange={(event) => updatePreference("quietHoursStart", event.target.value)}
                  className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink)]"
                />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-medium text-[var(--ink)]">End</span>
                <input
                  type="time"
                  value={preferences.quietHoursEnd}
                  onChange={(event) => updatePreference("quietHoursEnd", event.target.value)}
                  className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink)]"
                />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-medium text-[var(--ink)]">Timezone</span>
                <input
                  type="text"
                  value={preferences.timezone}
                  onChange={(event) => updatePreference("timezone", event.target.value)}
                  className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink)]"
                />
              </label>
            </div>
          </div>

          {preferences.sessionStartSuggestion === "custom" ? (
            <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Custom session schedule</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {WEEKDAY_LABELS.map((day) => {
                  const checked = preferences.customSchedule?.daysOfWeek.includes(day.value) ?? false;

                  return (
                    <label key={day.value} className="flex items-center gap-3 rounded-[18px] bg-white px-4 py-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          updatePreference(
                            "customSchedule",
                            updateDaySelection(preferences.customSchedule, day.value),
                          )
                        }
                        className="size-4 rounded border-black/20"
                      />
                      <span className="text-sm font-medium text-[var(--ink)]">{day.label}</span>
                    </label>
                  );
                })}
              </div>
              <label className="mt-4 block space-y-2">
                <span className="text-sm font-medium text-[var(--ink)]">Time of day</span>
                <input
                  type="time"
                  value={preferences.customSchedule?.timeOfDay ?? "09:00"}
                  onChange={(event) =>
                    updatePreference("customSchedule", {
                      daysOfWeek: preferences.customSchedule?.daysOfWeek ?? [1, 2, 3, 4, 5],
                      timeOfDay: event.target.value,
                    })
                  }
                  className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink)]"
                />
              </label>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-[24px] border border-black/8 bg-[linear-gradient(180deg,#23272e_0%,#2f353d_100%)] p-5 text-white">
            <div className="flex items-center gap-2">
              <Clock3 className="size-4 text-white/70" />
              <p className="text-xs uppercase tracking-[0.18em] text-white/60">Preview</p>
            </div>
            <h3 className="mt-3 text-xl font-semibold">How Penny will show up</h3>
            <p className="mt-3 text-sm leading-6 text-white/75">
              {preferences.revisitQueueDigest === "off" ? "Revisit queue digests are paused." : `Revisit queue digests go out ${preferences.revisitQueueDigest.replaceAll("_", " ")}.`}
            </p>
            <p className="mt-2 text-sm leading-6 text-white/75">
              {preferences.resolutionReminders === "off" ? "Resolution reminders are off." : `Resolution reminders are ${preferences.resolutionReminders.replaceAll("_", " ")}.`}
            </p>
            <p className="mt-2 text-sm leading-6 text-white/75">
              {preferences.blindSpotDigest === "off" ? "Blind spot digests are off." : `Blind spot digests are ${preferences.blindSpotDigest}.`}
            </p>
            <p className="mt-2 text-sm leading-6 text-white/75">
              {preferences.sessionStartSuggestion === "off"
                ? "Session start suggestions are off."
                : preferences.sessionStartSuggestion === "custom"
                  ? "Custom session reminders will follow the selected days and time."
                  : "Weekday mornings will surface a session nudge when the day starts."}
            </p>
            {preferences.quietHoursEnabled ? (
              <p className="mt-2 text-sm leading-6 text-white/75">
                Quiet hours run from {preferences.quietHoursStart} to {preferences.quietHoursEnd} in {preferences.timezone}.
              </p>
            ) : null}
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Saved state</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
              {lastSavedAt ? `Last saved ${lastSavedAt.toLocaleTimeString()}.` : "Nothing has been saved in this session yet."}
            </p>
            {error ? <p className="mt-3 rounded-2xl bg-[#fff6ed] px-4 py-3 text-sm leading-6 text-[#8b4d1f]">{error}</p> : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                variant="secondary"
                className="gap-2"
                onClick={() => {
                  setLoading(true);
                  void (async () => {
                    try {
                      const response = await fetch(`/api/users/${userId}/notification-preferences`);
                      if (!response.ok) {
                        throw new Error("Could not refresh notification preferences.");
                      }

                      const payload = (await response.json()) as { preferences: NotificationPreferences };
                      setPreferences(payload.preferences);
                      setError(null);
                    } catch (refreshError) {
                      setError(refreshError instanceof Error ? refreshError.message : "Could not refresh notification preferences.");
                    } finally {
                      setLoading(false);
                    }
                  })();
                }}
                disabled={saving || loading}
              >
                <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                className="gap-2"
                onClick={() => {
                  void savePreferences().catch((saveError) => {
                    setError(saveError instanceof Error ? saveError.message : "Could not save notification preferences.");
                  });
                }}
                disabled={saving}
              >
                <Save className={`size-4 ${saving ? "animate-pulse" : ""}`} />
                Save preferences
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
