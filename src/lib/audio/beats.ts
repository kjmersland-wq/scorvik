// Tempo and beat-grid estimation from raw audio (onset envelope + autocorrelation), used to cut on the beat.

export interface BeatGrid {
  bpm: number;
  /** seconds from the start of the analysed audio to the first beat */
  offset: number;
  period: number;
  /** 0..1, how regular the pulse is */
  confidence: number;
}

export function estimateBeatGrid(samples: Float32Array, rate: number): BeatGrid | undefined {
  const decimate = Math.max(1, Math.floor(rate / 11025));
  const hop = 256;
  const frameRate = rate / decimate / hop;
  const frames = Math.floor(samples.length / decimate / hop);
  if (frames < frameRate * 8) return undefined;
  const energy = new Float64Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    let previous = 0;
    for (let i = 0; i < hop; i += 1) {
      let value = 0;
      const base = (frame * hop + i) * decimate;
      for (let d = 0; d < decimate; d += 1) value += samples[base + d] ?? 0;
      value /= decimate;
      const delta = value - previous; // emphasise transients
      sum += delta * delta;
      previous = value;
    }
    energy[frame] = Math.log1p(sum * 1000);
  }
  const onset = new Float64Array(frames);
  for (let frame = 1; frame < frames; frame += 1) onset[frame] = Math.max(0, energy[frame] - energy[frame - 1]);
  const window = Math.round(frameRate * 1.5);
  const raw = Float64Array.from(onset);
  for (let frame = 0; frame < frames; frame += 1) { // subtract a local mean so loud passages don't dominate
    let mean = 0, n = 0;
    for (let k = Math.max(0, frame - window); k < Math.min(frames, frame + window); k += 4) { mean += raw[k]; n += 1; }
    onset[frame] = Math.max(0, raw[frame] - mean / Math.max(1, n));
  }
  const autocorrelation = (lag: number) => {
    const lower = Math.floor(lag), fraction = lag - lower;
    let total = 0;
    for (let frame = 0; frame + lower + 1 < frames; frame += 1) total += onset[frame] * (onset[frame + lower] * (1 - fraction) + onset[frame + lower + 1] * fraction);
    return total;
  };
  const zero = autocorrelation(0) || 1;
  let best = { bpm: 0, score: 0 };
  for (let bpm = 60; bpm <= 180; bpm += 0.5) {
    const lag = (60 / bpm) * frameRate;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 110) / 0.7, 2)); // people tap around 110 BPM; avoids half/double-tempo errors
    const score = (autocorrelation(lag) / zero) * prior;
    if (score > best.score) best = { bpm, score };
  }
  if (!best.bpm) return undefined;
  // Refine tempo and phase together: the comb of beats that collects the most onset energy wins.
  let comb = { bpm: best.bpm, at: 0, score: -1 };
  for (let bpm = best.bpm - 2; bpm <= best.bpm + 2; bpm += 0.1) {
    const period = (60 / bpm) * frameRate;
    for (let start = 0; start < period; start += 0.5) {
      let score = 0;
      for (let position = start; position < frames - 1; position += period) score += onset[Math.round(position)];
      if (score > comb.score) comb = { bpm, at: start, score };
    }
  }
  return { bpm: Math.round(comb.bpm * 10) / 10, offset: comb.at / frameRate, period: 60 / comb.bpm, confidence: Math.min(1, (autocorrelation((60 / best.bpm) * frameRate) / zero) * 2) };
}

/**
 * Moves each internal cut onto the music: a bar line (every 4 beats) when one is close enough, otherwise the nearest beat,
 * keeping every scene at least `minLength` long. `starts[0]` stays 0. Returns new start times.
 */
export function snapToBeats(starts: number[], grid: BeatGrid, total: number, maxShift = 0.4, minLength = 1.5, beatsPerBar = 4, barsOnly = false): number[] {
  const snapped = [...starts];
  for (let index = 1; index < starts.length; index += 1) {
    const earliest = snapped[index - 1] + minLength;
    const latest = (starts[index + 1] ?? total) - minLength;
    const candidates = (barsOnly ? [grid.period * beatsPerBar] : [grid.period * beatsPerBar, grid.period]).map((step) => grid.offset + Math.round((starts[index] - grid.offset) / step) * step);
    const pick = candidates.find((time) => Math.abs(time - starts[index]) <= maxShift * (time === candidates[0] ? 1.3 : 1) && time >= earliest && time <= latest);
    if (pick !== undefined) snapped[index] = pick;
  }
  return snapped;
}
