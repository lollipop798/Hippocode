const TOKEN_PATTERN = /[\p{L}\p{N}_./:-]{2,}/gu;

export function uniqueStrings(values: Iterable<string>): string[] {
  return [...new Set([...values].filter((value) => value.length > 0))];
}

export function tokenizeText(input: string): string[] {
  return uniqueStrings(
    (input.match(TOKEN_PATTERN) ?? []).map((token) => token.toLowerCase())
  );
}

export function slugify(input: string, fallback = "entry"): string {
  const collapsed = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return collapsed.length > 0 ? collapsed : fallback;
}

export function summarizeText(input: string, maxLength = 160): string {
  const collapsed = input.replace(/\s+/g, " ").trim();

  if (collapsed.length <= maxLength) {
    return collapsed;
  }

  return `${collapsed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function clampScore(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}
