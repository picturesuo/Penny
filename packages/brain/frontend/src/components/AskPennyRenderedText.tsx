import React, { type ReactNode } from "react";

type TextPart =
  | { kind: "text"; value: string }
  | { kind: "math"; value: string; display: boolean };

const greekSymbols: Record<string, string> = {
  alpha: "alpha",
  beta: "beta",
  gamma: "gamma",
  delta: "delta",
  epsilon: "epsilon",
  theta: "theta",
  lambda: "lambda",
  mu: "mu",
  pi: "pi",
  rho: "rho",
  sigma: "sigma",
  tau: "tau",
  omega: "omega",
  Delta: "Delta",
  Sigma: "Sigma",
  Omega: "Omega",
};

export function AskPennyRenderedText({ text }: { text: string }) {
  return (
    <div className="ask-penny-rendered">
      {paragraphs(text).map((paragraph, index) => (
        <div className={paragraph.startsWith("- ") ? "ask-penny-rendered-line is-bullet" : "ask-penny-rendered-line"} key={index}>
          {renderParts(tokenizeMath(paragraph), index)}
        </div>
      ))}
    </div>
  );
}

export function tokenizeMath(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let index = 0;

  while (index < text.length) {
    const next = nextMathDelimiter(text, index);

    if (!next) {
      pushTextPart(parts, text.slice(index));
      break;
    }

    pushTextPart(parts, text.slice(index, next.start));
    parts.push({ kind: "math", value: next.value.trim(), display: next.display });
    index = next.end;
  }

  return parts;
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .flatMap((block) => block.split(/\n(?=-\s+)/))
    .map((block) => block.trim())
    .filter(Boolean);
}

function renderParts(parts: TextPart[], baseKey: number): ReactNode[] {
  return parts.map((part, index) => {
    if (part.kind === "text") {
      return <span key={`${baseKey}-text-${index}`}>{part.value}</span>;
    }

    return (
      <span className={part.display ? "ask-penny-math is-display" : "ask-penny-math"} key={`${baseKey}-math-${index}`}>
        {renderMath(part.value)}
      </span>
    );
  });
}

function renderMath(value: string): ReactNode[] {
  const normalized = normalizeLatex(value);
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < normalized.length) {
    if (normalized.startsWith("\\frac", index)) {
      const fraction = readCommandPair(normalized, index + "\\frac".length);

      if (fraction) {
        nodes.push(
          <span className="ask-penny-frac" key={`frac-${index}`}>
            <span>{renderMath(fraction.first)}</span>
            <span>{renderMath(fraction.second)}</span>
          </span>,
        );
        index = fraction.end;
        continue;
      }
    }

    if (normalized.startsWith("\\sqrt", index)) {
      const radicand = readBraced(normalized, index + "\\sqrt".length);

      if (radicand) {
        nodes.push(
          <span className="ask-penny-root" key={`sqrt-${index}`}>
            <span>{renderMath(radicand.value)}</span>
          </span>,
        );
        index = radicand.end;
        continue;
      }
    }

    if (normalized[index] === "^" || normalized[index] === "_") {
      const script = readScript(normalized, index + 1);

      if (script) {
        const Element = normalized[index] === "^" ? "sup" : "sub";
        nodes.push(<Element key={`script-${index}`}>{renderMath(script.value)}</Element>);
        index = script.end;
        continue;
      }
    }

    if (normalized[index] === "\\") {
      const command = normalized.slice(index + 1).match(/^[A-Za-z]+/);
      const symbol = command ? greekSymbols[command[0]] : null;

      if (symbol) {
        nodes.push(<span className={`ask-penny-symbol is-${symbol}`} key={`symbol-${index}`} />);
        index += command![0].length + 1;
        continue;
      }
    }

    nodes.push(<span key={`char-${index}`}>{normalized[index]}</span>);
    index += 1;
  }

  return nodes;
}

function nextMathDelimiter(text: string, startAt: number): { start: number; end: number; value: string; display: boolean } | null {
  const delimiters = [
    { open: "$$", close: "$$", display: true },
    { open: "\\[", close: "\\]", display: true },
    { open: "\\(", close: "\\)", display: false },
    { open: "$", close: "$", display: false },
  ];
  let best: { start: number; end: number; value: string; display: boolean } | null = null;

  for (const delimiter of delimiters) {
    const start = text.indexOf(delimiter.open, startAt);

    if (start === -1 || (best && start >= best.start)) {
      continue;
    }

    if (delimiter.open === "$" && text[start + 1] === "$") {
      continue;
    }

    const contentStart = start + delimiter.open.length;
    const end = text.indexOf(delimiter.close, contentStart);

    if (end === -1 || (delimiter.open === "$" && text[end + 1] === "$")) {
      continue;
    }

    const value = text.slice(contentStart, end);

    if (delimiter.open === "$" && !looksLikeMath(value)) {
      continue;
    }

    best = { start, end: end + delimiter.close.length, value, display: delimiter.display };
  }

  return best;
}

function looksLikeMath(value: string): boolean {
  return /\\[A-Za-z]+|[=+\-*/^_<>]|[A-Za-z]\d|\d[A-Za-z]/.test(value);
}

function pushTextPart(parts: TextPart[], value: string): void {
  if (!value) {
    return;
  }

  const previous = parts.at(-1);

  if (previous?.kind === "text") {
    previous.value += value;
  } else {
    parts.push({ kind: "text", value });
  }
}

function normalizeLatex(value: string): string {
  return value
    .replace(/\\cdot/g, "·")
    .replace(/\\times/g, "×")
    .replace(/\\div/g, "÷")
    .replace(/\\leq/g, "≤")
    .replace(/\\geq/g, "≥")
    .replace(/\\neq/g, "≠")
    .replace(/\\approx/g, "≈")
    .replace(/\\to/g, "→")
    .replace(/\\infty/g, "∞")
    .replace(/\\left|\\right/g, "");
}

function readCommandPair(text: string, start: number): { first: string; second: string; end: number } | null {
  const first = readBraced(text, start);
  const second = first ? readBraced(text, first.end) : null;

  return first && second ? { first: first.value, second: second.value, end: second.end } : null;
}

function readBraced(text: string, start: number): { value: string; end: number } | null {
  if (text[start] !== "{") {
    return null;
  }

  let depth = 0;

  for (let index = start; index < text.length; index += 1) {
    if (text[index] === "{") {
      depth += 1;
    } else if (text[index] === "}") {
      depth -= 1;

      if (depth === 0) {
        return { value: text.slice(start + 1, index), end: index + 1 };
      }
    }
  }

  return null;
}

function readScript(text: string, start: number): { value: string; end: number } | null {
  const braced = readBraced(text, start);

  if (braced) {
    return braced;
  }

  const value = text[start];

  return value ? { value, end: start + 1 } : null;
}
