const MAX_FULL_LEVENSHTEIN_LENGTH = 4000;
const WINDOW_SIZE = 2000;

/**
 * Computes space-optimized Levenshtein edit distance between two strings.
 * Uses a single 1D rolling DP array so memory is O(min(n, m)).
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let shorter = a;
  let longer = b;
  if (a.length > b.length) {
    shorter = b;
    longer = a;
  }

  const m = shorter.length;
  const n = longer.length;
  const prev = new Uint32Array(m + 1);
  const curr = new Uint32Array(m + 1);

  for (let j = 0; j <= m; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    const longerChar = longer.charCodeAt(i - 1);

    for (let j = 1; j <= m; j++) {
      const cost = shorter.charCodeAt(j - 1) === longerChar ? 0 : 1;
      const del = (prev[j] ?? 0) + 1;
      const ins = (curr[j - 1] ?? 0) + 1;
      const sub = (prev[j - 1] ?? 0) + cost;
      curr[j] = Math.min(del, ins, sub);
    }

    prev.set(curr);
  }

  return prev[m] ?? 0;
}

/**
 * Computes normalized similarity in [0, 1] using Levenshtein distance.
 * Fast-rejects pairs whose lengths differ by > 50% and chunks oversized inputs.
 */
export function computeSimilarity(code1: string, code2: string): number {
  if (code1.length === 0 && code2.length === 0) return 1;
  if (code1.length === 0 || code2.length === 0) return 0;
  if (code1 === code2) return 1;

  const maxLen = Math.max(code1.length, code2.length);
  const minLen = Math.min(code1.length, code2.length);

  // Length difference > 50% guarantees similarity < 0.50
  if (maxLen - minLen > maxLen * 0.5) {
    return minLen / maxLen;
  }

  if (maxLen <= MAX_FULL_LEVENSHTEIN_LENGTH) {
    const distance = levenshteinDistance(code1, code2);
    return 1 - distance / maxLen;
  }

  // Windowed Levenshtein for oversized normalized strings to avoid slow O(n^2) CPU spikes
  let totalSimilarity = 0;
  let windows = 0;
  for (let offset = 0; offset < maxLen; offset += WINDOW_SIZE) {
    const slice1 = code1.slice(offset, offset + WINDOW_SIZE);
    const slice2 = code2.slice(offset, offset + WINDOW_SIZE);
    const winMax = Math.max(slice1.length, slice2.length);
    if (winMax === 0) continue;
    const dist = levenshteinDistance(slice1, slice2);
    totalSimilarity += 1 - dist / winMax;
    windows++;
  }

  return windows > 0 ? totalSimilarity / windows : 0;
}
