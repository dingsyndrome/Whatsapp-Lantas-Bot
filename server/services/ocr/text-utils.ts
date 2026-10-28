export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeOcrText(input: string): string {
  return input
    .replace(/\r/g, '\n')
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[º˚]/g, '°')
    .replace(/[−–—]/g, '-')
    .replace(/\bJI\./g, 'Jl.')
    .replace(/\bJ1\./g, 'Jl.')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.replace(/^[|¦]+\s*|\s*[|¦]+$/g, '').trim())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && lines[index - 1]?.length > 0))
    .join('\n')
    .trim();
}

export function cleanField(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/^[\s:,;.\-]+/, '')
    .replace(/[\s:,;.\-]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function stripLabel(value: string, labels: string[]): string {
  let output = value.trim();
  for (const label of labels) {
    const pattern = new RegExp(`^\\s*(?:${label})\\s*[:.\\-]?\\s*`, 'i');
    output = output.replace(pattern, '');
  }
  return output.trim();
}

export function parseJsonLoose<T>(value: string): T | null {
  const trimmed = value.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
