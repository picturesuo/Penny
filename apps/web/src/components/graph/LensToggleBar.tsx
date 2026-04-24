export type LensToggle = {
  id: string;
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  onToggle?: () => void;
};

type LensToggleBarProps = {
  toggles?: LensToggle[];
};

const defaultToggles: LensToggle[] = [
  { id: "lens", label: "Lens", disabled: true },
  { id: "filter", label: "Filter", disabled: true },
];

const railStyle = {
  position: "absolute",
  right: 14,
  top: 14,
  display: "flex",
  gap: 6,
  padding: 4,
  border: "1px solid rgba(23, 32, 27, 0.08)",
  borderRadius: 8,
  background: "rgba(253, 254, 251, 0.88)",
  boxShadow: "0 10px 26px rgba(23, 32, 27, 0.055)",
} as const;

const buttonStyle = {
  minHeight: 30,
  border: "1px solid rgba(23, 32, 27, 0.1)",
  borderRadius: 6,
  padding: "0 9px",
  background: "#f4f6f2",
  color: "#69766f",
  fontSize: 12,
  fontWeight: 700,
} as const;

export function LensToggleBar({ toggles = defaultToggles }: LensToggleBarProps) {
  return (
    <div aria-label="Graph lens and filter placeholders" data-testid="penny-graph-lens-toggles" style={railStyle}>
      {toggles.map((toggle) => (
        <button
          key={toggle.id}
          type="button"
          aria-pressed={toggle.pressed}
          disabled={toggle.disabled ?? !toggle.onToggle}
          title={`${toggle.label} toggle${toggle.disabled ?? !toggle.onToggle ? " placeholder" : ""}`}
          style={{
            ...buttonStyle,
            background: toggle.pressed ? "rgba(47, 107, 85, 0.12)" : buttonStyle.background,
            color: toggle.pressed ? "#174c3b" : buttonStyle.color,
            cursor: toggle.disabled ?? !toggle.onToggle ? "not-allowed" : "pointer",
          }}
          onClick={toggle.onToggle}
        >
          {toggle.label}
        </button>
      ))}
    </div>
  );
}
