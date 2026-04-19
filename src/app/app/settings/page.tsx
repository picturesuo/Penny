"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KEYBOARD_SHORTCUTS } from "@/lib/keyboard-shortcuts";

const DEFAULT_SETTINGS = {
  displayName: "Demo Founder",
  email: "demo@penny.local",
  role: "founder",
  primaryDomain: "B2B SaaS",
  defaultMapView: "outline",
  defaultCritiqueMode: "direct",
  defaultCritiqueIntensity: 3,
  showConfidenceAsPercentage: true,
  showHealthScores: true,
  compactMode: false,
  defaultTimeBudgetMinutes: 30,
  requireSessionIntention: true,
  showOnboardingChecklist: true,
  allowAnonymizedDataForPatterns: false,
  allowCalibrationAggregation: false,
  subscriptionTier: "free",
  subscriptionStatus: "trialing",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<typeof DEFAULT_SETTINGS>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_SETTINGS;
    }

    const stored = window.localStorage.getItem("penny-settings");
    if (!stored) {
      return DEFAULT_SETTINGS;
    }

    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [status, setStatus] = useState<string | null>(null);

  function saveSettings() {
    window.localStorage.setItem("penny-settings", JSON.stringify(settings));
    setStatus("Saved locally on this device.");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Card className="p-8">
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Settings</p>
        <h1 className="mt-2 text-4xl font-semibold text-[var(--ink)]">Account and preference controls.</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--muted-ink)]">
          This surface gives the product a home for profile, display, privacy, notification, and billing preferences.
        </p>
        {status ? <p className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{status}</p> : null}
        <div className="mt-4 flex gap-3">
          <Button onClick={saveSettings}>Save locally</Button>
          <Button variant="secondary" onClick={() => window.localStorage.removeItem("penny-settings")}>
            Reset
          </Button>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Profile</p>
          <div className="mt-4 grid gap-4">
            <Field label="Display name" value={settings.displayName} onChange={(value) => setSettings((current) => ({ ...current, displayName: value }))} />
            <Field label="Email" value={settings.email} onChange={(value) => setSettings((current) => ({ ...current, email: value }))} />
            <Field label="Role" value={settings.role} onChange={(value) => setSettings((current) => ({ ...current, role: value }))} />
            <Field label="Primary domain" value={settings.primaryDomain} onChange={(value) => setSettings((current) => ({ ...current, primaryDomain: value }))} />
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Display</p>
          <div className="mt-4 grid gap-4">
            <SelectField
              label="Default map view"
              value={settings.defaultMapView}
              options={["outline", "graph", "cards"]}
              onChange={(value) => setSettings((current) => ({ ...current, defaultMapView: value }))}
            />
            <SelectField
              label="Default critique mode"
              value={settings.defaultCritiqueMode}
              options={["direct", "socratic", "red_team"]}
              onChange={(value) => setSettings((current) => ({ ...current, defaultCritiqueMode: value }))}
            />
            <RangeField label="Critique intensity" value={settings.defaultCritiqueIntensity} min={1} max={5} onChange={(value) => setSettings((current) => ({ ...current, defaultCritiqueIntensity: value }))} />
            <ToggleField label="Show confidence as percentage" checked={settings.showConfidenceAsPercentage} onChange={(checked) => setSettings((current) => ({ ...current, showConfidenceAsPercentage: checked }))} />
            <ToggleField label="Show health scores" checked={settings.showHealthScores} onChange={(checked) => setSettings((current) => ({ ...current, showHealthScores: checked }))} />
            <ToggleField label="Compact mode" checked={settings.compactMode} onChange={(checked) => setSettings((current) => ({ ...current, compactMode: checked }))} />
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Session</p>
          <div className="mt-4 grid gap-4">
            <RangeField label="Default time budget (minutes)" value={settings.defaultTimeBudgetMinutes ?? 30} min={10} max={120} onChange={(value) => setSettings((current) => ({ ...current, defaultTimeBudgetMinutes: value }))} />
            <ToggleField label="Require session intention" checked={settings.requireSessionIntention} onChange={(checked) => setSettings((current) => ({ ...current, requireSessionIntention: checked }))} />
            <ToggleField label="Show onboarding checklist" checked={settings.showOnboardingChecklist} onChange={(checked) => setSettings((current) => ({ ...current, showOnboardingChecklist: checked }))} />
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Privacy and billing</p>
          <div className="mt-4 grid gap-4">
            <ToggleField label="Allow anonymized data for patterns" checked={settings.allowAnonymizedDataForPatterns} onChange={(checked) => setSettings((current) => ({ ...current, allowAnonymizedDataForPatterns: checked }))} />
            <ToggleField label="Allow calibration aggregation" checked={settings.allowCalibrationAggregation} onChange={(checked) => setSettings((current) => ({ ...current, allowCalibrationAggregation: checked }))} />
            <SelectField label="Subscription tier" value={settings.subscriptionTier} options={["free", "pro", "team"]} onChange={(value) => setSettings((current) => ({ ...current, subscriptionTier: value }))} />
            <SelectField label="Subscription status" value={settings.subscriptionStatus} options={["active", "past_due", "cancelled", "trialing"]} onChange={(value) => setSettings((current) => ({ ...current, subscriptionStatus: value }))} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Shortcuts</p>
          <div className="mt-4 space-y-3">
            {KEYBOARD_SHORTCUTS.global.map((shortcut) => (
              <ShortcutRow key={shortcut.description} keys={shortcut.keys} description={shortcut.description} />
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Editing</p>
          <div className="mt-4 space-y-3">
            {KEYBOARD_SHORTCUTS.mapView.map((shortcut) => (
              <ShortcutRow key={shortcut.description} keys={shortcut.keys} description={shortcut.description} />
            ))}
            {KEYBOARD_SHORTCUTS.editing.map((shortcut) => (
              <ShortcutRow key={shortcut.description} keys={shortcut.keys} description={shortcut.description} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-[var(--ink)]">{label}</span>
      <input
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-medium text-[var(--ink)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--ink)]">{label}</span>
        <Badge className="bg-white text-[var(--muted-ink)]">{value}</Badge>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--ink)]"
      />
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-[18px] border border-black/8 bg-[var(--panel)] px-4 py-3">
      <span className="text-sm font-medium text-[var(--ink)]">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function ShortcutRow({ keys, description }: { keys: readonly string[]; description: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[18px] border border-black/8 bg-[var(--panel)] px-4 py-3">
      <p className="text-sm text-[var(--ink)]">{description}</p>
      <div className="flex flex-wrap gap-2">
        {keys.map((key) => (
          <Badge key={key} className="bg-white text-[var(--muted-ink)]">
            {key}
          </Badge>
        ))}
      </div>
    </div>
  );
}
