// Reading-time engine: every scene lasts long enough to read its text comfortably (about 2.5 words a second, plus 1 s of padding).

export const wordsPerSecond = 2.5;

export function countWords(text: string): number {
  return (text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
}

/** Whole seconds a viewer needs for `text`; 0 for scenes without text. */
export function readingSeconds(text: string, padding = 1): number {
  const words = countWords(text);
  return words ? Math.ceil(words / wordsPerSecond + padding) : 0;
}

/** Splits `total` seconds across scenes so no scene gets less than its reading minimum; integer seconds that add up exactly. */
export function fitDurations(minimums: number[], total: number): { durations: number[]; fits: boolean } {
  const count = minimums.length;
  if (!count) return { durations: [], fits: true };
  const floor = minimums.map((value) => Math.max(1, value));
  const needed = floor.reduce((sum, value) => sum + value, 0);
  const fits = needed <= total;
  // Equal shares first, never below the minimum; the surplus is then shared out by how much each scene can give.
  let durations = floor.map((value) => Math.max(value, total / count));
  const excess = durations.reduce((sum, value) => sum + value, 0) - total;
  if (excess > 0) {
    const slack = durations.map((value, index) => value - floor[index]);
    const room = slack.reduce((sum, value) => sum + value, 0);
    if (room > 0) durations = durations.map((value, index) => value - Math.min(slack[index], (excess * slack[index]) / room));
  }
  if (!fits) durations = floor.map((value) => (value * total) / needed); // too much text for the time: read a little faster rather than overrun
  const whole = durations.map((value) => Math.max(1, Math.floor(value)));
  let rest = total - whole.reduce((sum, value) => sum + value, 0);
  const order = durations.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((left, right) => right.fraction - left.fraction);
  for (let step = 0; rest > 0; step += 1, rest -= 1) whole[order[step % count].index] += 1;
  for (let step = count - 1; rest < 0 && step >= 0; step -= 1) { if (whole[step] > 1) { whole[step] -= 1; rest += 1; } if (step === 0 && rest < 0) step = count; }
  return { durations: whole, fits };
}
