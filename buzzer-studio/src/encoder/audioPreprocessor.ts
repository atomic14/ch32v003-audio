/**
 * Audio preprocessing functions
 * DC removal, normalization, filtering, resampling
 */

/**
 * Remove DC offset from signal
 */
export function removeDCOffset(samples: Float32Array): Float32Array {
  // Calculate mean
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i];
  }
  const mean = sum / Math.max(1, samples.length);

  // Subtract mean from all samples
  const output = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    output[i] = samples[i] - mean;
  }

  return output;
}

/**
 * Normalize peak amplitude to 0.95 (leaving headroom)
 */
export function normalizePeak(samples: Float32Array): Float32Array {
  // Find peak absolute value
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }

  // Avoid division by zero
  if (peak < 0.00001) {
    return samples;
  }

  // Normalize to 0.95 to leave some headroom
  const scale = 0.95 / peak;
  const output = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    output[i] = samples[i] * scale;
  }

  return output;
}

/**
 * Apply pre-emphasis filter
 * output[i] = input[i] - alpha * input[i-1]
 * Boosts high frequencies before LPC analysis
 */
export function applyPreEmphasis(samples: Float32Array, alpha: number): Float32Array {
  const output = new Float32Array(samples.length);
  output[0] = samples[0];

  for (let i = 1; i < samples.length; i++) {
    output[i] = samples[i] - alpha * samples[i - 1];
  }

  return output;
}

/**
 * Apply Hamming window to a frame
 */
export function applyHammingWindow(frame: Float32Array): Float32Array {
  const windowed = new Float32Array(frame.length);
  for (let i = 0; i < frame.length; i++) {
    windowed[i] = frame[i] * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frame.length - 1)));
  }
  return windowed;
}

/**
 * Simple first-order IIR high-pass filter
 */
export function applyHighPassFilter(
  samples: Float32Array,
  cutoffHz: number,
  sampleRate: number
): Float32Array {
  const RC = 1.0 / (cutoffHz * 2 * Math.PI);
  const dt = 1.0 / sampleRate;
  const alpha = RC / (RC + dt);

  const output = new Float32Array(samples.length);
  output[0] = samples[0];

  for (let i = 1; i < samples.length; i++) {
    output[i] = alpha * (output[i - 1] + samples[i] - samples[i - 1]);
  }

  return output;
}

/**
 * Simple first-order IIR low-pass filter
 */
export function applyLowPassFilter(
  samples: Float32Array,
  cutoffHz: number,
  sampleRate: number
): Float32Array {
  const RC = 1.0 / (cutoffHz * 2 * Math.PI);
  const dt = 1.0 / sampleRate;
  const alpha = dt / (RC + dt);

  const output = new Float32Array(samples.length);
  output[0] = samples[0];

  for (let i = 1; i < samples.length; i++) {
    output[i] = output[i - 1] + alpha * (samples[i] - output[i - 1]);
  }

  return output;
}

/**
 * 2nd-order Butterworth low-pass biquad filter
 * Uses direct form II transposed structure
 */
export function applyButterworthLowPass2ndOrder(
  samples: Float32Array,
  cutoffHz: number,
  sampleRate: number
): Float32Array {
  // Calculate filter coefficients for 2nd-order Butterworth
  const omega = (2 * Math.PI * cutoffHz) / sampleRate;
  const cos_omega = Math.cos(omega);
  const sin_omega = Math.sin(omega);
  const alpha = sin_omega / Math.sqrt(2); // Q = 1/sqrt(2) for Butterworth

  // Calculate biquad coefficients
  const b0 = (1 - cos_omega) / 2;
  const b1 = 1 - cos_omega;
  const b2 = (1 - cos_omega) / 2;
  const a0 = 1 + alpha;
  const a1 = -2 * cos_omega;
  const a2 = 1 - alpha;

  // Normalize
  const b0_norm = b0 / a0;
  const b1_norm = b1 / a0;
  const b2_norm = b2 / a0;
  const a1_norm = a1 / a0;
  const a2_norm = a2 / a0;

  // Apply filter using Direct Form II Transposed
  const output = new Float32Array(samples.length);
  let s1 = 0; // state variable 1
  let s2 = 0; // state variable 2

  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = b0_norm * x + s1;
    s1 = b1_norm * x - a1_norm * y + s2;
    s2 = b2_norm * x - a2_norm * y;
    output[i] = y;
  }

  return output;
}

/**
 * Higher-order Butterworth low-pass filter using cascaded 2nd-order stages
 * This matches Apple's AudioUnit Butterworth filter used by BlueWizard
 * For pitch detection (800Hz), we need steep rolloff to isolate fundamental
 */
export function applyLowPassFilterHighOrder(
  samples: Float32Array,
  cutoffHz: number,
  sampleRate: number,
  order: number = 8
): Float32Array {
  let output = samples;

  // Cascade 2nd-order Butterworth sections
  // order=8 means 4 cascaded 2nd-order filters = 8th order Butterworth
  const numSections = Math.floor(order / 2);
  for (let i = 0; i < numSections; i++) {
    output = applyButterworthLowPass2ndOrder(output, cutoffHz, sampleRate);
  }

  return output;
}

/**
 * Median filter for impulse noise removal
 */
export function applyMedianFilter(samples: Float32Array, windowSize: number): Float32Array {
  if (windowSize < 3 || windowSize % 2 === 0) {
    windowSize = 3; // Use minimum odd window size
  }

  const halfWindow = Math.floor(windowSize / 2);
  const output = new Float32Array(samples.length);

  for (let i = 0; i < samples.length; i++) {
    const window: number[] = [];

    // Collect samples in window
    for (let j = -halfWindow; j <= halfWindow; j++) {
      const idx = i + j;
      if (idx >= 0 && idx < samples.length) {
        window.push(samples[idx]);
      }
    }

    // Sort and find median
    window.sort((a, b) => a - b);
    const medianIdx = Math.floor(window.length / 2);
    output[i] = window[medianIdx];
  }

  return output;
}

/**
 * Soft noise gate with smooth knee.
 * Attenuates samples below a threshold without hard-clipping to zero.
 * threshold: linear amplitude in [0, 1], knee controls curvature (>1 = softer).
 */
export function applySoftNoiseGate(
  samples: Float32Array,
  threshold: number,
  knee: number = 2.0
): Float32Array {
  if (threshold <= 0) return samples;
  const out = new Float32Array(samples.length);
  const thr = Math.max(1e-6, Math.min(1.0, threshold));
  const k = Math.max(1.0, knee);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const mag = Math.abs(s);
    const g = mag >= thr ? 1.0 : Math.pow(mag / thr, k);
    out[i] = s * g;
  }
  return out;
}

/**
 * Resample audio using linear interpolation
 */
export function resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return samples;

  const ratio = fromRate / toRate;
  const newLength = Math.floor(samples.length / ratio);

  if (newLength <= 0 || !isFinite(newLength)) {
    throw new Error(
      `Invalid resampling: fromRate=${fromRate}, toRate=${toRate}, samples=${samples.length}, newLength=${newLength}`
    );
  }

  const resampled = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, samples.length - 1);
    const frac = srcIndex - srcIndexFloor;

    resampled[i] = samples[srcIndexFloor] * (1 - frac) + samples[srcIndexCeil] * frac;
  }

  return resampled;
}
