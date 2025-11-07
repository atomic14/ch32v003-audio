/**
 * Reflector - LPC reflection coefficients and RMS
 * Based on BlueWizard's Reflector using Leroux-Gueguen algorithm
 */

import { CodingTable } from '../tmsTables';

export class Reflector {
  public ks: number[] = new Array<number>(11).fill(0); // K1..K10 (index 1-10)
  private _rms: number = 0;
  private limitRMS: boolean = false;
  public codingTable: CodingTable;
  public unvoicedThreshold: number;

  // Energy values for multi-criteria voiced/unvoiced detection
  public originalEnergy: number = 0; // Energy before pre-emphasis
  public emphasizedEnergy: number = 0; // Energy after pre-emphasis
  public energyRatioThreshold: number = 1.2; // bass_energy / treble_energy threshold
  // Minimum energy for voiced (scaled for normalized [-1,1] samples)
  // Original formula used 3.0 for 16-bit samples
  // Adjusted for float samples: 3.0 / 32768 ≈ 0.0001
  public minEnergyThreshold: number = 0.0001; // Very quiet threshold
  public pitchQuality: number = 0; // Normalized autocorrelation at pitch period (0-1)
  public pitchQualityThreshold: number = 0.5; // Autocorrelation threshold for periodicity
  public useEnergyBasedDetection: boolean = true; // Use multi-criteria vs k1-only
  public skipEnergyRatioCheck: boolean = false; // Skip Criterion 2 when pre-emphasis is off

  constructor(
    codingTable: CodingTable,
    unvoicedThreshold: number,
    k?: number[],
    rms?: number,
    limitRMS?: boolean
  ) {
    this.codingTable = codingTable;
    this.unvoicedThreshold = unvoicedThreshold;
    if (k !== undefined && rms !== undefined && limitRMS !== undefined) {
      this.ks = k;
      this._rms = rms;
      this.limitRMS = limitRMS;
    }
  }

  /**
   * Format RMS from residual energy
   * Scale to 16-bit amplitude space
   */
  static formattedRMS(residualEnergy: number, numberOfSamples: number): number {
    const val = Math.sqrt(Math.max(0, residualEnergy) / Math.max(1, numberOfSamples)) * (1 << 15);
    return isFinite(val) ? val : 0;
  }

  /**
   * Leroux-Gueguen algorithm for finding reflection coefficients
   * This is a more numerically stable variant of Levinson-Durbin
   *
   * @param codingTable - TMS coding table
   * @param r - autocorrelation array r[0..10]
   * @param numberOfSamples - number of samples in the frame
   * @param unvoicedThreshold - threshold for voiced/unvoiced detection
   * @returns Reflector with K coefficients and RMS
   */
  static translateCoefficients(
    codingTable: CodingTable,
    r: Float32Array,
    numberOfSamples: number,
    unvoicedThreshold: number
  ): Reflector {
    // Guard: silent or degenerate frame
    if (!isFinite(r[0]) || r[0] === 0) {
      const refl = new Reflector(codingTable, unvoicedThreshold);
      refl.rms = 0;
      return refl;
    }

    // Leroux-Gueguen algorithm
    const k = new Array<number>(11).fill(0);
    const b = new Array<number>(11).fill(0);
    const d = new Array<number>(12).fill(0);
    const epsilon = 1e-12;

    // Initialize
    k[1] = -r[1] / (Math.abs(r[0]) > epsilon ? r[0] : r[0] >= 0 ? epsilon : -epsilon);
    d[1] = r[1];
    d[2] = r[0] + k[1] * r[1];

    // Iterate from order 2 to 10
    let i = 2;
    while (i <= 10) {
      let y = r[i];
      b[1] = y;

      let j = 1;
      while (j <= i - 1) {
        b[j + 1] = d[j] + k[j] * y;
        y = y + k[j] * d[j];
        d[j] = b[j];
        j += 1;
      }

      const denom =
        Math.abs(d[i]) > epsilon && isFinite(d[i]) ? d[i] : d[i] >= 0 ? epsilon : -epsilon;
      k[i] = -y / denom;
      if (!isFinite(k[i])) k[i] = 0;
      if (k[i] > 0.999) k[i] = 0.999;
      if (k[i] < -0.999) k[i] = -0.999;
      d[i + 1] = d[i] + k[i] * y;
      d[i] = b[i];
      if (!isFinite(d[i + 1]) || d[i + 1] <= 0) {
        for (let t = i + 1; t <= 10; t++) {
          k[t] = 0;
        }
        break;
      }
      i += 1;
    }

    // Calculate RMS from final residual energy d[11]
    const finalResidual = isFinite(d[11]) && d[11] > 0 ? d[11] : 0;
    const rms = Reflector.formattedRMS(finalResidual, numberOfSamples);

    return new Reflector(codingTable, unvoicedThreshold, k, rms, true);
  }

  get rms(): number {
    if (this.limitRMS) {
      const capIdx = Math.max(
        0,
        Math.min(this.codingTable.kStopFrameIndex - 1, this.codingTable.rms.length - 1)
      );
      const cap = this.codingTable.rms[capIdx];
      return this._rms >= cap ? cap : this._rms;
    }
    return this._rms;
  }

  set rms(value: number) {
    this._rms = value;
  }

  isVoiced(): boolean {
    return !this.isUnvoiced();
  }

  /**
   * Voiced/unvoiced detection using 2 criteria
   *
   * Uses two criteria:
   * 1. Low energy: originalEnergy < minEnergyThreshold → unvoiced (always checked)
   * 3. Weak pitch: pitchQuality < pitchQualityThreshold → unvoiced (always checked)
   *
   * Criterion 2 (energy ratio) is always skipped (skipEnergyRatioCheck=true).
   * The pitch quality criterion is sufficient for distinguishing periodic (voiced)
   * from aperiodic (unvoiced) signals.
   *
   * The pitch quality criterion catches:
   * - Consonants with some low-frequency energy but no clear pitch
   * - Buzzy sounds like 's', 'sh', 'f' that lack periodicity
   * - Transitions between voiced and unvoiced speech
   */
  isUnvoiced(): boolean {
    if (this.useEnergyBasedDetection && this.originalEnergy > 0 && this.emphasizedEnergy > 0) {
      // Criterion 1: Very low energy → unvoiced
      if (this.originalEnergy < this.minEnergyThreshold) {
        return true;
      }

      // Criterion 2: Energy ratio check (only if pre-emphasis is enabled)
      // If pre-emphasis doesn't reduce energy much, it's high-frequency (unvoiced)
      if (!this.skipEnergyRatioCheck) {
        const energyRatio = this.originalEnergy / this.emphasizedEnergy;
        if (energyRatio < this.energyRatioThreshold) {
          return true;
        }
      }

      // Criterion 3: Weak pitch detection (autocorrelation threshold)
      // Even if energy looks good, if there's no clear pitch, it's unvoiced
      if (this.pitchQuality < this.pitchQualityThreshold) {
        return true;
      }

      // All criteria passed → voiced
      return false;
    }

    // Fallback to k1-based detection (BlueWizard's original method)
    return this.ks[1] >= this.unvoicedThreshold;
  }
}
