export function formatLabel(value: string | undefined): string {
  if (!value) {
    return "";
  }

  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function shortId(value: string | undefined): string {
  if (!value) {
    return "";
  }

  return value.length > 8 ? value.slice(0, 8) : value;
}
