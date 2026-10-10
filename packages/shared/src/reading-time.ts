const READING_UNITS_PER_MINUTE = 400;

function stripMarkdownNoise(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~\-[\]()!]/g, ' ')
    .trim();
}

export function countReadingUnits(text: string) {
  const normalized = stripMarkdownNoise(text);
  const cjkCharacters = normalized.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const latinWords = normalized
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;

  return cjkCharacters + latinWords;
}

export function estimateReadingTimeMinutes(text: string) {
  return Math.max(1, Math.ceil(countReadingUnits(text) / READING_UNITS_PER_MINUTE));
}
