import type { HTMLAttributes } from "react";
import { cx } from "../../lib/design/classes";
import { normalizeConfidenceValue, type ConfidenceScale } from "./ConfidenceChip";

export type ConfidenceSparklineProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  height?: number;
  label?: string;
  scale?: ConfidenceScale;
  values: ReadonlyArray<number>;
  width?: number;
};

type SparkPoint = {
  x: number;
  y: number;
  value: number;
};

export function ConfidenceSparkline({
  className,
  height = 36,
  label = "Confidence history",
  scale = "percent",
  values,
  width = 120,
  ...props
}: ConfidenceSparklineProps) {
  const normalizedValues = values.map((value) => normalizeConfidenceValue(value, scale));
  const points = buildSparkPoints(normalizedValues, width, height);
  const ratedPoints = points.filter((point): point is SparkPoint => point !== null);
  const linePaths = buildLinePaths(points);
  const lastValue = [...normalizedValues].reverse().find((value) => value !== null) ?? null;
  const accessibleSummary =
    lastValue === null ? `${label}: no rated confidence history` : `${label}: latest rating ${lastValue}%`;

  if (ratedPoints.length === 0) {
    return (
      <div
        aria-label={accessibleSummary}
        className={cx("confidence-sparkline confidence-sparkline--empty", className)}
        role="img"
        {...props}
      >
        <svg aria-hidden="true" focusable="false" height={height} viewBox={`0 0 ${width} ${height}`} width={width}>
          <line className="confidence-sparkline__baseline" x1="0" x2={width} y1={height - 4} y2={height - 4} />
        </svg>
        <span style={{ color: "var(--color-faint)", fontSize: 12, lineHeight: 1.2 }}>No confidence history</span>
      </div>
    );
  }

  return (
    <div
      aria-label={accessibleSummary}
      className={cx("confidence-sparkline", className)}
      role="img"
      {...props}
    >
      <svg aria-hidden="true" focusable="false" height={height} viewBox={`0 0 ${width} ${height}`} width={width}>
        <line className="confidence-sparkline__baseline" x1="0" x2={width} y1={height - 4} y2={height - 4} />
        {linePaths.map((path, index) => (
          <path className="confidence-sparkline__line" d={path} key={`${path}-${index}`} />
        ))}
        {ratedPoints.map((point, index) => (
          <circle
            className="confidence-sparkline__dot"
            cx={point.x}
            cy={point.y}
            key={`${point.x}-${point.y}-${point.value}-${index}`}
            r="2.4"
          />
        ))}
      </svg>
    </div>
  );
}

function buildSparkPoints(values: Array<number | null>, width: number, height: number): Array<SparkPoint | null> {
  if (values.length === 0) {
    return [];
  }

  const padding = 4;
  const usableWidth = Math.max(1, width - padding * 2);
  const usableHeight = Math.max(1, height - padding * 2);
  const step = values.length > 1 ? usableWidth / (values.length - 1) : 0;

  return values.map((value, index) => {
    if (value === null) {
      return null;
    }

    return {
      value,
      x: padding + step * index,
      y: padding + ((100 - value) / 100) * usableHeight,
    };
  });
}

function buildLinePaths(points: Array<SparkPoint | null>) {
  const paths: string[] = [];
  let activePath = "";

  points.forEach((point) => {
    if (!point) {
      if (activePath) {
        paths.push(activePath);
        activePath = "";
      }
      return;
    }

    activePath = activePath ? `${activePath} L ${point.x} ${point.y}` : `M ${point.x} ${point.y}`;
  });

  if (activePath) {
    paths.push(activePath);
  }

  return paths;
}
