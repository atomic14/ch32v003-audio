/**
 * Advanced pitch estimation using normalized autocorrelation
 * Based on BlueWizard's PitchEstimator with sub-multiple detection
 */

import { getNormalizedCoefficients } from './autocorrelator';

export interface PitchEstimatorConfig {
  sampleRate: number;
  minPitchHz: number; // Minimum pitch (male voice ~50Hz)
  maxPitchHz: number; // Maximum pitch (female/child voice ~500Hz)
  subMultipleThreshold: number; // Threshold for octave error detection (0.9 = 90%)
  pitchQualityThreshold: number; // Minimum autocorrelation for valid pitch (typically 0.5)
  centerClipRatio?: number; // Center clipping threshold as fraction of peak (e.g., 0.3)
  useYin?: boolean; // Enable YIN fallback when NACF is weak
  yinThreshold?: number; // YIN threshold for first dip (e.g., 0.1)
}

export interface PitchEstimatorResult {
  period: number; // Pitch period in samples (0 if unvoiced)
  quality: number; // Normalized autocorrelation coefficient at best period (0-1)
}

const DEFAULT_CONFIG: PitchEstimatorConfig = {
  sampleRate: 8000,
  minPitchHz: 50,
  maxPitchHz: 500,
  subMultipleThreshold: 0.9,
  pitchQualityThreshold: 0.5, // Autocorrelation quality threshold
  centerClipRatio: 0.35,
  useYin: true,
  yinThreshold: 0.1,
};

/**
 * Estimate pitch period in samples using normalized autocorrelation
 * Returns pitch period and quality, or period=0 if unvoiced/unpitched
 */
export function estimatePitch(
  frame: Float32Array,
  config: Partial<PitchEstimatorConfig> = {},
  debug: boolean = false
): PitchEstimatorResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Calculate period range from pitch range
  const minPeriod = Math.floor(cfg.sampleRate / cfg.maxPitchHz) - 1;
  const maxPeriod = Math.floor(cfg.sampleRate / cfg.minPitchHz) + 1;

  // Center clipping to reduce formant dominance
  const clipped = centerClip(frame, cfg.centerClipRatio ?? 0.35);

  // Get normalized autocorrelation coefficients on clipped signal
  const normalizedCoeffs = getNormalizedCoefficients(clipped, minPeriod, maxPeriod);

  // Find the period with maximum normalized autocorrelation
  const bestPeriod = findBestPeriod(normalizedCoeffs, minPeriod, maxPeriod);
  const bestQuality = normalizedCoeffs[bestPeriod];

  if (debug) {
    console.log('=== PITCH DEBUG ===');
    console.log('minPeriod:', minPeriod, 'maxPeriod:', maxPeriod);
    console.log('bestPeriod:', bestPeriod);
    console.log('bestQuality (normalized autocorr):', bestQuality);
    console.log('Normalized coeffs around bestPeriod:',
      Array.from(normalizedCoeffs.slice(Math.max(0, bestPeriod - 5), Math.min(normalizedCoeffs.length, bestPeriod + 6))));

    // Also show coefficients around period 51 (BlueWizard's result)
    console.log('Normalized coeffs around period 51:',
      Array.from(normalizedCoeffs.slice(46, 57)));

    // Show all coefficients in range 15-115 to see the full picture
    console.log('All normalized coeffs [15-115]:');
    for (let i = 15; i <= 115; i += 10) {
      console.log(`  periods ${i}-${i+9}:`, Array.from(normalizedCoeffs.slice(i, i+10)).map(v => v.toFixed(4)));
    }
  }

  // If NACF weak, optionally try YIN as fallback
  if (bestQuality < cfg.pitchQualityThreshold && cfg.useYin) {
    const yinPeriod = yinEstimate(clipped, minPeriod, maxPeriod, cfg.yinThreshold ?? 0.1);
    if (yinPeriod > 0) {
      return { period: yinPeriod, quality: bestQuality };
    }
  }

  // Criterion 3: Check if we have a valid peak (autocorrelation quality threshold)
  if (bestQuality < cfg.pitchQualityThreshold) {
    if (debug) console.log(`Peak too weak (${bestQuality.toFixed(3)} < ${cfg.pitchQualityThreshold}), returning 0`);
    return { period: 0, quality: bestQuality }; // Too weak, likely unvoiced
  }

  // Apply parabolic interpolation for sub-sample precision
  let interpolatedPeriod = interpolatePitch(normalizedCoeffs, bestPeriod);

  if (debug) {
    console.log('interpolatedPeriod:', interpolatedPeriod);
  }

  // Check for NaN
  if (!isFinite(interpolatedPeriod) || interpolatedPeriod <= 0) {
    if (debug) console.log('interpolatedPeriod invalid, returning 0');
    return { period: 0, quality: bestQuality };
  }

  // Sub-multiple detection (octave error correction)
  const finalPeriod = correctOctaveErrors(
    interpolatedPeriod,
    bestPeriod,
    normalizedCoeffs,
    minPeriod,
    cfg.subMultipleThreshold,
    debug
  );

  if (debug) {
    console.log('finalPeriod after octave correction:', finalPeriod);
  }

  return { period: finalPeriod, quality: bestQuality };
}

/**
 * Find the period with maximum autocorrelation
 */
function findBestPeriod(coefficients: Float32Array, minPeriod: number, maxPeriod: number): number {
  let bestPeriod = minPeriod;

  for (let period = minPeriod + 1; period < maxPeriod; period++) {
    if (coefficients[period] > coefficients[bestPeriod]) {
      bestPeriod = period;
    }
  }

  return bestPeriod;
}

/**
 * Parabolic interpolation for sub-sample pitch precision
 * Uses three points around the peak to estimate true maximum
 */
function interpolatePitch(coefficients: Float32Array, bestPeriod: number): number {
  if (bestPeriod <= 0 || bestPeriod >= coefficients.length - 1) {
    return bestPeriod;
  }

  const middle = coefficients[bestPeriod];
  const left = coefficients[bestPeriod - 1];
  const right = coefficients[bestPeriod + 1];

  // Parabolic interpolation formula
  const denominator = 2 * middle - left - right;

  if (Math.abs(denominator) < 1e-10) {
    return bestPeriod;
  }

  const delta = (0.5 * (right - left)) / denominator;

  // Sanity check: delta should be small
  if (Math.abs(delta) > 1.0) {
    return bestPeriod;
  }

  return bestPeriod + delta;
}

/**
 * Sub-multiple detection for octave error correction
 * Checks if the detected pitch is actually a harmonic of the true pitch
 */
function correctOctaveErrors(
  interpolatedPeriod: number,
  bestPeriod: number,
  coefficients: Float32Array,
  minPeriod: number,
  threshold: number,
  debug: boolean = false
): number {
  const maxMultiple = Math.floor(bestPeriod / minPeriod);
  let finalPeriod = interpolatedPeriod;

  if (debug) {
    console.log('Octave correction: maxMultiple =', maxMultiple, ', threshold =', threshold);
  }

  for (let multiple = maxMultiple; multiple >= 1; multiple--) {
    let subMultiplesAreStrong = true;

    // Check if all sub-multiples have strong correlation
    for (let i = 0; i < multiple; i++) {
      const subMultiplePeriod = Math.floor(((i + 1) * interpolatedPeriod) / multiple + 0.5);

      if (
        subMultiplePeriod < coefficients.length &&
        coefficients[subMultiplePeriod] < threshold * coefficients[bestPeriod]
      ) {
        subMultiplesAreStrong = false;
        if (debug) {
          console.log(`  multiple=${multiple}, i=${i}: subMultiplePeriod=${subMultiplePeriod}, coeff=${coefficients[subMultiplePeriod].toFixed(4)} < ${(threshold * coefficients[bestPeriod]).toFixed(4)} => weak`);
        }
        break;
      }
    }

    if (subMultiplesAreStrong) {
      finalPeriod = interpolatedPeriod / multiple;
      if (debug) {
        console.log(`  multiple=${multiple}: ALL submultiples strong, dividing ${interpolatedPeriod} / ${multiple} = ${finalPeriod}`);
      }
      break;
    }
  }

  return finalPeriod;
}

/**
 * Center-clipping to emphasize periodic excitation and reduce formant influence
 */
function centerClip(input: Float32Array, ratio: number): Float32Array {
  if (ratio <= 0) return input;
  let peak = 0;
  for (let i = 0; i < input.length; i++) {
    const a = Math.abs(input[i]);
    if (a > peak) peak = a;
  }
  const threshold = peak * ratio;
  if (threshold <= 0) return input;
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = input[i];
    if (s > threshold) out[i] = s - threshold;
    else if (s < -threshold) out[i] = s + threshold;
    else out[i] = 0;
  }
  return out;
}

/**
 * Minimal YIN implementation (difference function + CMND) returning period or 0 if none
 */
function yinEstimate(
  input: Float32Array,
  minPeriod: number,
  maxPeriod: number,
  threshold: number
): number {
  const n = input.length;
  const maxTau = Math.min(maxPeriod, n - 2);
  if (maxTau <= minPeriod) return 0;

  // Difference function d(tau)
  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < n - tau; i++) {
      const diff = input[i] - input[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // Cumulative mean normalized difference function d'(tau)
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let cumulative = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    cumulative += d[tau];
    cmnd[tau] = d[tau] * tau / (cumulative || 1);
  }

  // Absolute threshold
  let bestTau = 0;
  for (let tau = minPeriod; tau <= maxTau; tau++) {
    if (cmnd[tau] < threshold) {
      // Parabolic interpolation around local minimum
      const tauMinus = Math.max(minPeriod, tau - 1);
      const tauPlus = Math.min(maxTau, tau + 1);
      const a = cmnd[tauMinus];
      const b = cmnd[tau];
      const c = cmnd[tauPlus];
      const denom = (a - 2 * b + c);
      const delta = Math.abs(denom) > 1e-12 ? 0.5 * (a - c) / denom : 0;
      bestTau = tau + delta;
      break;
    }
  }

  return bestTau > 0 ? bestTau : 0;
}
