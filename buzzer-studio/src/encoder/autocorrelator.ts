/**
 * Autocorrelation functions for LPC analysis and pitch estimation
 * Based on BlueWizard's Autocorrelator
 */

/**
 * Calculate standard autocorrelation coefficients up to order maxLag
 * Used for LPC analysis (Levinson-Durbin recursion)
 */
export function getCoefficients(samples: Float32Array, maxLag: number): Float32Array {
  const coefficients = new Float32Array(maxLag);

  for (let lag = 0; lag < maxLag; lag++) {
    coefficients[lag] = aForLag(samples, lag);
  }

  return coefficients;
}

/**
 * Calculate normalized autocorrelation coefficients for pitch estimation
 * Normalization: r[k] / sqrt(sumOfSquares[0..n-k] * sumOfSquares[k..n])
 * This is more robust than dividing by r[0]
 */
export function getNormalizedCoefficients(
  samples: Float32Array,
  minPeriod: number,
  maxPeriod: number
): Float32Array {
  const coefficients = new Float32Array(maxPeriod + 1);

  for (let lag = 0; lag <= maxPeriod; lag++) {
    if (lag < minPeriod) {
      coefficients[lag] = 0.0;
      continue;
    }

    let sum = 0.0;
    let sumOfSquaresBeginning = 0.0;
    let sumOfSquaresEnding = 0.0;

    const numSamples = samples.length - lag;

    for (let i = 0; i < numSamples; i++) {
      sum += samples[i] * samples[i + lag];
      sumOfSquaresBeginning += samples[i] * samples[i];
      sumOfSquaresEnding += samples[i + lag] * samples[i + lag];
    }

    // Normalize by geometric mean of energies
    const denominator = Math.sqrt(sumOfSquaresBeginning * sumOfSquaresEnding);
    coefficients[lag] = denominator > 0 ? sum / denominator : 0.0;
  }

  return coefficients;
}

/**
 * Calculate autocorrelation for a specific lag
 */
function aForLag(samples: Float32Array, lag: number): number {
  const numSamples = samples.length - lag;
  let sum = 0.0;

  for (let i = 0; i < numSamples; i++) {
    sum += samples[i] * samples[i + lag];
  }

  return sum;
}

/**
 * Calculate sum of squares (autocorrelation at lag 0)
 */
export function sumOfSquares(samples: Float32Array): number {
  return aForLag(samples, 0);
}
