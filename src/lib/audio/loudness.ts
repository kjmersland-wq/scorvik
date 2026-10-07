// Loudness per ITU-R BS.1770 (K-weighting, 400 ms blocks, absolute and relative gates), filter coefficients for 48 kHz.
function kWeight(samples: Float32Array): Float64Array {
  const stage = (input: Float64Array, b: number[], a: number[]) => {
    const output = new Float64Array(input.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < input.length; i += 1) {
      const x0 = input[i];
      const y0 = b[0] * x0 + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
      output[i] = y0;
      x2 = x1; x1 = x0; y2 = y1; y1 = y0;
    }
    return output;
  };
  const shelf = stage(Float64Array.from(samples), [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]);
  return stage(shelf, [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]);
}

export function integratedLoudness(channels: Float32Array[], rate: number): number {
  const weighted = channels.map(kWeight);
  const block = Math.round(rate * 0.4);
  const hop = Math.round(rate * 0.1);
  const energies: number[] = [];
  for (let start = 0; start + block <= weighted[0].length; start += hop) {
    let sum = 0;
    for (const channel of weighted) {
      let square = 0;
      for (let i = start; i < start + block; i += 1) square += channel[i] * channel[i];
      sum += square / block;
    }
    energies.push(sum);
  }
  const toLufs = (energy: number) => -0.691 + 10 * Math.log10(energy);
  const absolute = energies.filter((energy) => energy > 0 && toLufs(energy) > -70);
  if (!absolute.length) return -Infinity;
  const relativeThreshold = toLufs(absolute.reduce((total, value) => total + value, 0) / absolute.length) - 10;
  const gated = absolute.filter((energy) => toLufs(energy) > relativeThreshold);
  return gated.length ? toLufs(gated.reduce((total, value) => total + value, 0) / gated.length) : -Infinity;
}
