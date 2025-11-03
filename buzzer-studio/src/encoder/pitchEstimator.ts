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

  // Get normalized autocorrelation coefficients
  const normalizedCoeffs = getNormalizedCoefficients(frame, minPeriod, maxPeriod);

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
