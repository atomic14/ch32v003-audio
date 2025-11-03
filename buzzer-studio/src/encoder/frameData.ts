/**
 * FrameData - encodes LPC parameters for a single frame
 * Based on BlueWizard's FrameData
 */

import { Reflector } from './reflector';
import { CodingTable } from '../tmsTables';
import { findClosestValue } from './closestValueFinder';

export class FrameData {
  public reflector: Reflector;
  public codingTable: CodingTable;
  public pitch: number;
  public repeat: boolean;

  constructor(reflector: Reflector, pitch: number, repeat: boolean) {
    this.reflector = reflector;
    this.codingTable = reflector.codingTable;
    this.pitch = pitch;
    this.repeat = repeat;
  }

  /**
   * Create a stop frame (silence)
   */
  stopFrame(): FrameData {
    const reflector = new Reflector(this.codingTable, this.reflector.unvoicedThreshold);
    reflector.rms = this.codingTable.rms[this.codingTable.kStopFrameIndex];
    return new FrameData(reflector, 0, false);
  }

  /**
   * Get encoded parameters for this frame
   * Returns a map of parameter names to quantized values
   */
  parameters(): Record<string, number> {
    const parameters: Record<string, number> = {};

    // Gain (energy) parameter
    parameters['kParameterGain'] = this.parameterizedValueForRMS(this.reflector.rms);

    if (parameters['kParameterGain'] > 0) {
      // Repeat flag
      parameters['kParameterRepeat'] = this.repeat ? 1 : 0;

      // Pitch parameter
      parameters['kParameterPitch'] = this.parameterizedValueForPitch(this.pitch);

      if (!this.repeat) {
        // K1-K4 (always included for non-repeat frames)
        for (let k = 1; k <= 4; k++) {
          parameters[`kParameterK${k}`] = this.parameterizedValueForK(this.reflector.ks[k], k);
        }

        // K5-K10 (only for voiced frames)
        if (parameters['kParameterPitch'] !== 0 && this.reflector.isVoiced()) {
          for (let k = 5; k <= 10; k++) {
            parameters[`kParameterK${k}`] = this.parameterizedValueForK(this.reflector.ks[k], k);
          }
        }
      }
    }

    return parameters;
  }

  private parameterizedValueForK(k: number, binNo: number): number {
    return findClosestValue(k, this.codingTable.kBinFor(binNo));
  }

  private parameterizedValueForRMS(rms: number): number {
    const rmsArray = Array.from(this.codingTable.rms);
    return findClosestValue(rms, rmsArray);
  }

  private parameterizedValueForPitch(pitch: number): number {
    if (this.reflector.isUnvoiced() || pitch === 0) {
      return 0;
    }
    const index = findClosestValue(pitch, this.codingTable.pitch);
    if (index > 63) return 63;
    if (index < 0) return 0;
    return index;
  }
}
