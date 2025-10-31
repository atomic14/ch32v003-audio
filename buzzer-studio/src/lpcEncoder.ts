// LPC Encoder - Converts WAV files to TMS5220/TMS5100 LPC bitstreams
//
// This is a TypeScript port of the LPC encoding algorithms from:
// - Python Wizard: https://github.com/ptwz/python_wizard
// - BlueWizard: https://github.com/patrick99e99/BlueWizard
//
// The core LPC analysis, Levinson-Durbin recursion, and bitstream encoding
// are based on these excellent open-source implementations.

import { CodingTable } from './tmsTables';

export interface EncoderSettings {
  tablesVariant: 'tms5220' | 'tms5100';
  frameRate: number;
  unvoicedThreshold: number;
  windowWidth: number;
  preEmphasis: boolean;
  preEmphasisAlpha: number;
  normalizeUnvoiced: boolean;
  normalizeVoiced: boolean;
  includeExplicitStopFrame: boolean;
  // Preprocessing options
  highPassFilter: boolean;
  highPassCutoff: number;
  lowPassFilter: boolean;
  lowPassCutoff: number;
  medianFilter: boolean;
  medianFilterWindow: number;
}

interface WavData {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  samples: Float32Array;
}

// Helper function to find closest value in a table
function closestValueFinder(actual: number, table: number[]): number {
  if (actual <= table[0]) return 0;
  let minDiff = Infinity;
  let minIndex = 0;
  for (let i = 0; i < table.length; i++) {
    const diff = Math.abs(table[i] - actual);
    if (diff < minDiff) {
      minDiff = diff;
      minIndex = i;
    }
  }
  return minIndex;
}

// Helper class for binary conversion
class BitHelpers {
  static valueToBinary(value: number, bits: number): string {
    // Clamp to field width to prevent overflow into subsequent fields
    const mask = bits >= 31 ? 0x7fffffff : (1 << bits) - 1;
    const v = (value & mask) >>> 0;
    return v.toString(2).padStart(bits, '0');
  }

  static valueForBinary(binary: string): number {
    return parseInt(binary, 2);
  }
}

// Reflector class - LPC reflection coeffs and RMS
class Reflector {
  public ks: number[] = new Array<number>(11).fill(0); // 1..10 used
  private _rms: number = 0;
  private limitRMS: boolean = false;
  public codingTable: CodingTable;
  public unvoicedThreshold: number;

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

  static formattedRMS(residualEnergy: number, numberOfSamples: number): number {
    // Scale to 16-bit amplitude space
    const val = Math.sqrt(Math.max(0, residualEnergy) / Math.max(1, numberOfSamples)) * (1 << 15);
    return isFinite(val) ? val : 0;
  }

  /**
   * Levinson–Durbin recursion to compute reflection coefficients (order = 10)
   * r: autocorrelation array r[0..p]
   */
  static translateCoefficients(
    codingTable: CodingTable,
    r: Float32Array,
    numberOfSamples: number,
    unvoicedThreshold: number
  ): Reflector {
    const p = 10;
    const k: number[] = new Array<number>(11).fill(0); // 1..10
    // Guard: silent or degenerate frame
    if (!isFinite(r[0]) || r[0] === 0) {
      const refl = new Reflector(codingTable, unvoicedThreshold);
      refl.rms = 0;
      return refl;
    }

    // Work arrays: LPC a[1..p], tmp
    const a: number[] = new Array<number>(p + 1).fill(0); // a[0] unused
    let E = r[0];

    for (let i = 1; i <= p; i++) {
      let acc = 0;
      for (let j = 1; j < i; j++) {
        acc += a[j] * r[i - j];
      }
      // reflection coefficient
      let ki = -(r[i] + acc) / E;

      // Numerical safety: keep within (-1, 1)
      if (!isFinite(ki)) ki = 0;
      ki = Math.max(-0.9999, Math.min(0.9999, ki));

      // Update LPCs: a_i' = a_i + k_i * a_{i-j}, and a_i = k_i
      const aPrev = a.slice();
      for (let j = 1; j < i; j++) {
        a[j] = aPrev[j] + ki * aPrev[i - j];
      }
      a[i] = ki;

      // Update residual energy
      E = E * (1 - ki * ki);
      if (E <= 1e-12 || !isFinite(E)) {
        // Early stop on numerical issues; fill remaining ks with zeros
        for (let t = i + 1; t <= p; t++) k[t] = 0;
        k[i] = ki;
        break;
      }

      k[i] = ki;
    }

    const rms = Reflector.formattedRMS(E, numberOfSamples);
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

  isUnvoiced(): boolean {
    // Keep original behavior (threshold on k1). If you prefer |k1|, change to Math.abs(this.ks[1]) <= this.unvoicedThreshold
    return this.ks[1] >= this.unvoicedThreshold;
  }
}

// FrameData class - encodes LPC parameters for a single frame
class FrameData {
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

  stopFrame(): FrameData {
    const reflector = new Reflector(this.codingTable, this.reflector.unvoicedThreshold);
    reflector.rms = this.codingTable.rms[this.codingTable.kStopFrameIndex];
    return new FrameData(reflector, 0, false);
  }

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
    return closestValueFinder(k, this.codingTable.kBinFor(binNo));
  }

  private parameterizedValueForRMS(rms: number): number {
    const rmsArray = Array.from(this.codingTable.rms);
    return closestValueFinder(rms, rmsArray);
  }

  private parameterizedValueForPitch(pitch: number): number {
    if (this.reflector.isUnvoiced() || pitch === 0) {
      return 0;
    }
    const index = closestValueFinder(pitch, this.codingTable.pitch);
    if (index > 63) return 63;
    if (index < 0) return 0;
    return index;
  }
}

// Binary encoder - converts frame parameters to bitstream
class FrameDataBinaryEncoder {
  static process(codingTable: CodingTable, parametersList: Record<string, number>[]): string[] {
    const bits = codingTable.bits;
    let binary = '';

    for (const parameters of parametersList) {
      const params = CodingTable.parameters();
      for (let idx = 0; idx < params.length; idx++) {
        const paramName = params[idx];
        if (!(paramName in parameters)) break;
        const value = parameters[paramName];
        const binaryValue = BitHelpers.valueToBinary(value, bits[idx]);
        binary += binaryValue;
      }
    }

    return this.nibblesFrom(binary);
  }

  static nibblesFrom(binary: string): string[] {
    const nibbles: string[] = [];
    // Pad to a full nibble so nothing is silently dropped
    const rem = binary.length % 4;
    if (rem !== 0) binary = binary.padEnd(binary.length + (4 - rem), '0');

    for (let i = 0; i < binary.length; i += 4) {
      nibbles.push(binary.slice(i, i + 4));
    }
    return nibbles;
  }
}

// Hex converter - converts nibbles to hex bytes
class HexConverter {
  static preprocess(nibbles: string[]): number[] {
    const result: number[] = [];
    const n = nibbles.slice();
    if (n.length % 2 === 1) n.push('0000'); // pad to full byte

    // Process pairs of nibbles
    for (let i = 0; i < n.length; i += 2) {
      const upper = n[i];
      const lower = n[i + 1];
      // Reverse and concatenate nibbles (bit order as in original)
      const raw = (upper + lower).split('').reverse().join('');
      result.push(parseInt(raw, 2));
    }

    return result;
  }

  static process(nibbles: string[]): string {
    const bytes = this.preprocess(nibbles);
    return bytes.map((b) => '0x' + b.toString(16).padStart(2, '0').toUpperCase()).join(',');
  }
}

// Main LPC Encoder
export class LPCEncoder {
  private settings: EncoderSettings;
  private codingTable: CodingTable;

  constructor(settings: EncoderSettings) {
    this.settings = settings;
    this.codingTable = new CodingTable(settings.tablesVariant);
  }

  // Helper method to parse and resample WAV for preview
  loadAndResampleWav(arrayBuffer: ArrayBuffer): Float32Array | null {
    const wavData = this.parseWav(arrayBuffer);
    if (!wavData) {
      return null;
    }

    // Auto-convert to mono if needed (already done in parseWav)
    let samples = wavData.samples;

    if (wavData.sampleRate !== 8000) {
      samples = this.resample(samples, wavData.sampleRate, 8000);
    }

    return samples;
  }

  encodeWav(arrayBuffer: ArrayBuffer): {
    hex: string;
    rawSamples: Float32Array;
    preprocessedSamples: Float32Array;
  } {
    // Parse WAV file
    const wavData = this.parseWav(arrayBuffer);
    if (!wavData) {
      throw new Error(
        'Failed to parse WAV file (expecting PCM RIFF/WAVE, 8/16/24/32-bit integer).'
      );
    }

    console.log(
      'WAV parsed:',
      wavData.sampleRate,
      'Hz,',
      wavData.numChannels,
      'channel(s) ->',
      wavData.samples.length,
      'samples (mono)'
    );

    // Resample to 8kHz if needed
    let samples = wavData.samples;
    if (wavData.sampleRate !== 8000) {
      console.log('Resampling from', wavData.sampleRate, 'to 8000 Hz');
      samples = this.resample(samples, wavData.sampleRate, 8000);
      console.log('Resampled to', samples.length, 'samples');
    }

    // Store raw samples (after resampling)
    console.log('Storing raw samples, length:', samples.length);
    const rawSamples = new Float32Array(samples);

    // PREPROCESSING PIPELINE
    console.log('=== PREPROCESSING PIPELINE ===');

    // 1. DC offset removal (always on)
    console.log('1. Removing DC offset');
    samples = this.removeDCOffset(samples);

    // 2. High-pass filter
    if (this.settings.highPassFilter) {
      console.log(`2. Applying high-pass filter at ${this.settings.highPassCutoff} Hz`);
      samples = this.applyHighPassFilter(samples, this.settings.highPassCutoff, 8000);
    } else {
      console.log('2. High-pass filter: DISABLED');
    }

    // 3. Low-pass filter
    if (this.settings.lowPassFilter) {
      console.log(`3. Applying low-pass filter at ${this.settings.lowPassCutoff} Hz`);
      samples = this.applyLowPassFilter(samples, this.settings.lowPassCutoff, 8000);
    } else {
      console.log('3. Low-pass filter: DISABLED');
    }

    // 4. Median filter
    if (this.settings.medianFilter) {
      console.log(`4. Applying median filter (window size: ${this.settings.medianFilterWindow})`);
      samples = this.applyMedianFilter(samples, this.settings.medianFilterWindow);
    } else {
      console.log('4. Median filter: DISABLED');
    }

    // 5. Peak normalization (always on)
    console.log('5. Normalizing peak amplitude');
    samples = this.normalizePeak(samples);

    // 6. Pre-emphasis if enabled
    if (this.settings.preEmphasis) {
      console.log(`6. Applying pre-emphasis (alpha: ${this.settings.preEmphasisAlpha})`);
      samples = this.applyPreEmphasis(samples, this.settings.preEmphasisAlpha);
    } else {
      console.log('6. Pre-emphasis: DISABLED');
    }

    console.log('=== ENCODING SETTINGS ===');
    console.log(`Tables: ${this.settings.tablesVariant}`);
    console.log(`Frame rate: ${this.settings.frameRate} fps`);
    console.log(`Unvoiced threshold: ${this.settings.unvoicedThreshold}`);
    console.log(`Window width: ${this.settings.windowWidth}`);
    console.log(`Normalize voiced: ${this.settings.normalizeVoiced}`);
    console.log(`Normalize unvoiced: ${this.settings.normalizeUnvoiced}`);
    console.log(`Include stop frame: ${this.settings.includeExplicitStopFrame}`);

    // Store preprocessed samples (before LPC encoding)
    const preprocessedSamples = new Float32Array(samples);

    // Calculate frame size based on frame rate
    const frameSize = Math.floor(8000 / this.settings.frameRate);
    console.log('Frame size:', frameSize, 'samples, frame rate:', this.settings.frameRate, 'fps');

    // Process frames
    console.log('Processing frames...');
    const frames = this.processFrames(samples, frameSize);
    console.log('Processed', frames.length, 'frames');

    // Add stop frame if requested
    if (this.settings.includeExplicitStopFrame && frames.length > 0) {
      frames.push(frames[frames.length - 1].stopFrame());
    }

    // Convert frames to parameters
    const parametersList = frames.map((frame) => frame.parameters());

    // Encode to binary
    const nibbles = FrameDataBinaryEncoder.process(this.codingTable, parametersList);

    // Convert to hex
    const hex = HexConverter.process(nibbles);

    return {
      hex,
      rawSamples,
      preprocessedSamples,
    };
  }

  private processFrames(samples: Float32Array, frameSize: number): FrameData[] {
    const frames: FrameData[] = [];

    // windowWidth controls the analysis window size, but NOT the output frame rate
    // We always hop by frameSize to maintain the correct playback speed
    const hopSize = frameSize;
    const analysisWindowSize = frameSize * this.settings.windowWidth;

    console.log(
      `Processing with windowWidth=${this.settings.windowWidth}, hopSize=${hopSize}, analysisWindow=${analysisWindowSize}`
    );

    for (let i = 0; i + frameSize <= samples.length; i += hopSize) {
      // Extract analysis window (may be larger than hopSize for overlap)
      const windowStart = Math.max(0, i - Math.floor((analysisWindowSize - frameSize) / 2));
      const windowEnd = Math.min(samples.length, windowStart + analysisWindowSize);
      const frame = samples.slice(windowStart, windowEnd);

      // Extract hop-sized segment for per-frame RMS estimation (matches synth frame length)
      const hopSegment = samples.slice(i, i + frameSize);

      // Apply Hamming window
      const windowed = this.applyHammingWindow(frame);

      // Calculate autocorrelation coefficients up to order 10 (r[0..10])
      const autocorr = this.calculateAutocorrelation(windowed, 11);

      // Get reflection coefficients via Levinson–Durbin
      const reflector = Reflector.translateCoefficients(
        this.codingTable,
        autocorr,
        frame.length,
        this.settings.unvoicedThreshold
      );

      // Estimate pitch (returns period-in-samples at 8kHz)
      const pitch = this.estimatePitch(frame);

      // Apply RMS normalization if enabled
      if (reflector.isVoiced() && this.settings.normalizeVoiced) {
        // Normalize voiced frames to consistent RMS
        reflector.rms = this.codingTable.rms[8]; // Mid-range energy
      } else if (reflector.isUnvoiced() && this.settings.normalizeUnvoiced) {
        // Normalize unvoiced frames to consistent RMS
        reflector.rms = this.codingTable.rms[6]; // Lower energy for unvoiced
      } else {
        // Default: drive energy from original (pre-LPC) hop segment RMS
        reflector.rms = Reflector.formattedRMS(
          // original energy = sum of squares; reuse helper scaling with sqrt(energy/numSamples)
          // (autocorr[0] is energy of the windowed frame; we intentionally use unwindowed hop)
          hopSegment.reduce((acc, v) => acc + v * v, 0),
          hopSegment.length
        );
      }

      // Create frame data
      const frameData = new FrameData(reflector, pitch, false);
      frames.push(frameData);
    }

    console.log(
      `Generated ${frames.length} frames (should be ~${Math.floor(samples.length / frameSize)} for correct playback speed)`
    );
    return frames;
  }

  private parseWav(arrayBuffer: ArrayBuffer): WavData | null {
    const view = new DataView(arrayBuffer);

    // Check RIFF header
    const riff = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3)
    );
    if (riff !== 'RIFF') return null;

    // Check WAVE format
    const wave = String.fromCharCode(
      view.getUint8(8),
      view.getUint8(9),
      view.getUint8(10),
      view.getUint8(11)
    );
    if (wave !== 'WAVE') return null;

    // Find fmt chunk
    let offset = 12;
    while (offset + 8 <= view.byteLength) {
      const chunkId = String.fromCharCode(
        view.getUint8(offset),
        view.getUint8(offset + 1),
        view.getUint8(offset + 2),
        view.getUint8(offset + 3)
      );
      const chunkSize = view.getUint32(offset + 4, true);

      if (chunkId === 'fmt ') {
        const audioFormat = view.getUint16(offset + 8, true);
        // We accept PCM integer only (1). If you want IEEE float (3), add support in readSamples.
        if (audioFormat !== 1) return null;

        const numChannels = view.getUint16(offset + 10, true);
        const sampleRate = view.getUint32(offset + 12, true);
        const bitsPerSample = view.getUint16(offset + 22, true);

        // Find data chunk
        let dataOffset = offset + 8 + chunkSize;
        while (dataOffset + 8 <= view.byteLength) {
          const dataChunkId = String.fromCharCode(
            view.getUint8(dataOffset),
            view.getUint8(dataOffset + 1),
            view.getUint8(dataOffset + 2),
            view.getUint8(dataOffset + 3)
          );
          const dataChunkSize = view.getUint32(dataOffset + 4, true);

          if (dataChunkId === 'data') {
            // Read sample data
            const samples = this.readSamples(
              view,
              dataOffset + 8,
              dataChunkSize,
              bitsPerSample,
              numChannels
            );

            return {
              sampleRate,
              numChannels,
              bitsPerSample,
              samples,
            };
          }

          dataOffset += 8 + dataChunkSize;
        }

        return null;
      }

      offset += 8 + chunkSize;
    }

    return null;
  }

  private readSamples(
    view: DataView,
    offset: number,
    size: number,
    bitsPerSample: number,
    numChannels: number
  ): Float32Array {
    const bytesPerSample = bitsPerSample / 8;
    if (bytesPerSample <= 0) return new Float32Array(0);

    const numFrames = Math.floor(size / (bytesPerSample * numChannels));
    const samples = new Float32Array(numFrames);

    for (let i = 0; i < numFrames; i++) {
      let sum = 0;

      // Read all channels and average them (stereo to mono conversion)
      for (let ch = 0; ch < numChannels; ch++) {
        const sampleOffset = offset + (i * numChannels + ch) * bytesPerSample;

        let sample = 0;
        if (bitsPerSample === 8) {
          sample = (view.getUint8(sampleOffset) - 128) / 128.0;
        } else if (bitsPerSample === 16) {
          sample = view.getInt16(sampleOffset, true) / 32768.0;
        } else if (bitsPerSample === 24) {
          const b0 = view.getUint8(sampleOffset);
          const b1 = view.getUint8(sampleOffset + 1);
          const b2 = view.getUint8(sampleOffset + 2);
          let int24 = (b2 << 16) | (b1 << 8) | b0;
          if (int24 & 0x800000) int24 |= 0xff000000; // sign extend to 32 bits
          sample = int24 / 8388608.0; // 2^23
        } else if (bitsPerSample === 32) {
          // 32-bit integer PCM; if you ever allow IEEE float (audioFormat==3), use view.getFloat32(..., true)
          sample = view.getInt32(sampleOffset, true) / 2147483648.0; // 2^31
        } else {
          sample = 0;
        }

        sum += sample;
      }

      // Average all channels to create mono
      samples[i] = sum / numChannels;
    }

    return samples;
  }

  private resample(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
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

  private applyPreEmphasis(samples: Float32Array, alpha: number): Float32Array {
    const output = new Float32Array(samples.length);
    output[0] = samples[0];

    for (let i = 1; i < samples.length; i++) {
      output[i] = samples[i] - alpha * samples[i - 1];
    }

    return output;
  }

  private applyHammingWindow(frame: Float32Array): Float32Array {
    const windowed = new Float32Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
      windowed[i] = frame[i] * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (frame.length - 1)));
    }
    return windowed;
  }

  private calculateAutocorrelation(samples: Float32Array, maxLag: number): Float32Array {
    const autocorr = new Float32Array(maxLag);

    for (let lag = 0; lag < maxLag; lag++) {
      let sum = 0;
      for (let i = 0; i < samples.length - lag; i++) {
        sum += samples[i] * samples[i + lag];
      }
      autocorr[lag] = sum;
    }

    return autocorr;
  }

  private estimatePitch(frame: Float32Array): number {
    // Simplified pitch estimation using autocorrelation (period in samples @8kHz)
    const autocorr = this.calculateAutocorrelation(frame, 160);

    let maxVal = 0;
    let maxLag = 0;

    // Look for peak in autocorrelation (pitch period)
    for (let lag = 20; lag < autocorr.length; lag++) {
      if (autocorr[lag] > maxVal) {
        maxVal = autocorr[lag];
        maxLag = lag;
      }
    }

    return maxLag; // period (samples)
  }

  // PREPROCESSING FUNCTIONS

  private removeDCOffset(samples: Float32Array): Float32Array {
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

  private normalizePeak(samples: Float32Array): Float32Array {
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

  private applyHighPassFilter(
    samples: Float32Array,
    cutoffHz: number,
    sampleRate: number
  ): Float32Array {
    // Simple first-order IIR high-pass filter
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

  private applyLowPassFilter(
    samples: Float32Array,
    cutoffHz: number,
    sampleRate: number
  ): Float32Array {
    // Simple first-order IIR low-pass filter
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

  private applyMedianFilter(samples: Float32Array, windowSize: number): Float32Array {
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
}
