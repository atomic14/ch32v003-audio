/**
 * LPC Encoder - Converts WAV files to TMS5220/TMS5100 LPC bitstreams
 *
 * Modular architecture based on BlueWizard
 * Each component is separated into its own module for maintainability
 */

import { CodingTable } from './tmsTables';
import { parseWav } from './encoder/wavParser';
import * as AudioPreprocessor from './encoder/audioPreprocessor';
import { getCoefficients } from './encoder/autocorrelator';
import { estimatePitch } from './encoder/pitchEstimator';
import { Reflector } from './encoder/reflector';
import { FrameData } from './encoder/frameData';
import { encodeFramesToBinary } from './encoder/binaryEncoder';
import { nibblesToHex } from './encoder/hexConverter';
import {
  TMS_SAMPLE_RATE,
  ORIGINAL_ENERGY_SCALE,
  EMPHASIZED_ENERGY_DIVISOR,
  PITCH_ESTIMATION_LOWPASS_HZ,
  PITCH_ESTIMATION_FILTER_ORDER,
  SILENCE_ENERGY_THRESHOLD,
} from './encoder/constants';

export interface FrameAnalysis {
  frameNumber: number;
  isVoiced: boolean;
  pitch: number; // Period in samples
  pitchHz: number; // Frequency in Hz
  pitchQuality: number; // Autocorrelation coefficient (0-1)
  originalEnergy: number;
  emphasizedEnergy: number;
  energyRatio: number;
  rms: number;
  ks: number[]; // Reflection coefficients k1-k10
  // Criterion results
  criterion1Pass: boolean; // Energy >= threshold
  criterion2Pass: boolean; // Energy ratio >= threshold
  criterion3Pass: boolean; // Pitch quality >= threshold
  detectionMethod: 'energy-based' | 'k1-based';
}

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
  // Pitch settings
  minPitchHz: number;
  maxPitchHz: number;
  subMultipleThreshold: number;
  overridePitch: boolean;
  pitchValue: number;
  pitchOffset: number;
  // RMS normalization settings
  voicedRmsLimit: number;
  unvoicedRmsLimit: number;
  unvoicedMultiplier: number;
  // Advanced settings
  highpassCutoff: number;
  lowpassCutoff: number;
  speed: number;
  gain: number;
  rawExcitation: boolean;
  // Output options
  trimSilence: boolean;
  includeHexPrefix: boolean;
  startSample: number;
  endSample: number;
  // Multi-criteria voiced/unvoiced detection thresholds
  minEnergyThreshold: number; // Criterion 1: minimum energy for voiced
  energyRatioThreshold: number; // Criterion 2: original/emphasized energy ratio
  pitchQualityThreshold: number; // Criterion 3: minimum autocorrelation for valid pitch
}

/**
 * Main LPC Encoder
 * Orchestrates the encoding pipeline
 */
export class LPCEncoder {
  private settings: EncoderSettings;
  private codingTable: CodingTable;

  constructor(settings: EncoderSettings) {
    this.settings = settings;
    this.codingTable = new CodingTable(settings.tablesVariant);
  }

  /**
   * Load and resample WAV for preview (without full encoding)
   */
  loadAndResampleWav(arrayBuffer: ArrayBuffer): Float32Array | null {
    const wavData = parseWav(arrayBuffer);
    if (!wavData) {
      return null;
    }

    let samples = wavData.samples;

    if (wavData.sampleRate !== TMS_SAMPLE_RATE) {
      samples = AudioPreprocessor.resample(samples, wavData.sampleRate, TMS_SAMPLE_RATE);
    }

    return samples;
  }

  /**
   * Encode WAV file to LPC hex data
   */
  encodeWav(arrayBuffer: ArrayBuffer): {
    hex: string;
    rawSamples: Float32Array;
    preprocessedSamples: Float32Array;
    frameAnalysis: FrameAnalysis[];
  } {
    // Parse WAV file
    const wavData = parseWav(arrayBuffer);
    if (!wavData) {
      throw new Error(
        'Failed to parse WAV file (expecting PCM RIFF/WAVE, 8/16/24/32-bit integer).'
      );
    }

    // Resample to 8kHz if needed
    let samples = wavData.samples;
    if (wavData.sampleRate !== TMS_SAMPLE_RATE) {
      console.log(`Resampling from ${wavData.sampleRate} Hz to ${TMS_SAMPLE_RATE} Hz`);
      samples = AudioPreprocessor.resample(samples, wavData.sampleRate, TMS_SAMPLE_RATE);
    }

    // Store raw samples (after resampling)
    const rawSamples = new Float32Array(samples);

    // Apply sample range trimming
    if (this.settings.startSample > 0 || this.settings.endSample > 0) {
      const start = this.settings.startSample;
      const end = this.settings.endSample > 0 ? this.settings.endSample : samples.length;
      console.log(`Trimming samples: ${start} to ${end}`);
      samples = samples.slice(start, end);
    }

    // Apply speed adjustment
    if (this.settings.speed !== 1.0) {
      console.log(`Applying speed adjustment: ${this.settings.speed}x`);
      const newLength = Math.floor(samples.length / this.settings.speed);
      const resampled = new Float32Array(newLength);
      for (let i = 0; i < newLength; i++) {
        const srcPos = i * this.settings.speed;
        const srcIndex = Math.floor(srcPos);
        const frac = srcPos - srcIndex;
        if (srcIndex + 1 < samples.length) {
          resampled[i] = samples[srcIndex] * (1 - frac) + samples[srcIndex + 1] * frac;
        } else {
          resampled[i] = samples[srcIndex];
        }
      }
      samples = resampled;
    }

    // PREPROCESSING PIPELINE (following BlueWizard's order)
    // High-pass filter (skip if cutoff is 0 or invalid)
    if (this.settings.highpassCutoff > 0 && this.settings.highpassCutoff < 4000) {
      samples = AudioPreprocessor.applyHighPassFilter(samples, this.settings.highpassCutoff, TMS_SAMPLE_RATE);
    }

    // Low-pass filter (skip if cutoff is above Nyquist or invalid)
    if (this.settings.lowpassCutoff > 0 && this.settings.lowpassCutoff <= 4000) {
      samples = AudioPreprocessor.applyLowPassFilter(samples, this.settings.lowpassCutoff, TMS_SAMPLE_RATE);
    }

    // Apply gain
    if (this.settings.gain !== 1.0) {
      samples = samples.map((s) => s * this.settings.gain);
    }

    // CRITICAL: Create pitch buffer BEFORE pre-emphasis (BlueWizard line 33)
    // Pitch estimation uses original non-pre-emphasized signal
    const pitchBuffer = new Float32Array(samples);

    // Pre-emphasis if enabled (applied to main buffer only, not pitch buffer)
    if (this.settings.preEmphasis) {
      samples = AudioPreprocessor.applyPreEmphasis(samples, this.settings.preEmphasisAlpha);
    }

    // Prepare pitch buffer with lowpass filter for pitch estimation
    let pitchSamples = AudioPreprocessor.applyLowPassFilterHighOrder(
      pitchBuffer,
      PITCH_ESTIMATION_LOWPASS_HZ,
      TMS_SAMPLE_RATE,
      PITCH_ESTIMATION_FILTER_ORDER
    );

    // Store preprocessed samples
    const preprocessedSamples = new Float32Array(samples);

    // Calculate frame size based on frame rate
    const frameSize = Math.floor(TMS_SAMPLE_RATE / this.settings.frameRate);

    // Process frames (pass main buffer, pitch buffer, and original buffer for energy calculation)
    console.log(`Processing ${Math.floor(samples.length / frameSize)} frames...`);
    let { frames, frameAnalysis } = this.processFrames(samples, pitchBuffer, pitchSamples, frameSize);

    // RMS Normalization (BlueWizard lines 71-74)
    if (this.settings.normalizeVoiced) {
      this.normalizeVoicedRMS(frames);
    }
    if (this.settings.normalizeUnvoiced) {
      this.normalizeUnvoicedRMS(frames);
    }

    // ALWAYS apply unvoiced multiplier (BlueWizard line 74)
    this.applyUnvoicedMultiplier(frames);

    // Trim silence from beginning and end if requested
    if (this.settings.trimSilence) {
      const energyThreshold = SILENCE_ENERGY_THRESHOLD;
      let firstVoiced = 0;
      let lastVoiced = frames.length - 1;

      // Find first voiced/energetic frame
      for (let i = 0; i < frames.length; i++) {
        if (frames[i].reflector.isVoiced() || frames[i].reflector.rms > energyThreshold) {
          firstVoiced = i;
          break;
        }
      }

      // Find last voiced/energetic frame
      for (let i = frames.length - 1; i >= 0; i--) {
        if (frames[i].reflector.isVoiced() || frames[i].reflector.rms > energyThreshold) {
          lastVoiced = i;
          break;
        }
      }

      if (firstVoiced <= lastVoiced) {
        frames = frames.slice(firstVoiced, lastVoiced + 1);
      }
    }

    // Add stop frame if requested
    if (this.settings.includeExplicitStopFrame && frames.length > 0) {
      frames.push(frames[frames.length - 1].stopFrame());
    }

    // Convert frames to parameters
    const parametersList = frames.map((frame) => frame.parameters());

    // Encode to binary
    const nibbles = encodeFramesToBinary(this.codingTable, parametersList);

    // Convert to hex
    let hex = nibblesToHex(nibbles);
    console.log(`Encoding complete: ${frames.length} frames`);

    // Add or remove hex prefix based on setting
    if (!this.settings.includeHexPrefix) {
      hex = hex.replace(/0x/g, '');
    }

    return {
      hex,
      rawSamples,
      preprocessedSamples,
      frameAnalysis,
    };
  }

  /**
   * Calculate frame energy for voiced/unvoiced detection
   * For original (pre-pre-emphasis): sqrt(sum_of_squares * ORIGINAL_ENERGY_SCALE)
   * For emphasized: sqrt(sum_of_squares / EMPHASIZED_ENERGY_DIVISOR)
   */
  private calculateFrameEnergy(frame: Float32Array, isOriginal: boolean): number {
    let sumSquares = 0;
    for (let i = 0; i < frame.length; i++) {
      sumSquares += frame[i] * frame[i];
    }

    if (isOriginal) {
      return Math.sqrt(sumSquares * ORIGINAL_ENERGY_SCALE);
    } else {
      return Math.sqrt(sumSquares / EMPHASIZED_ENERGY_DIVISOR);
    }
  }

  /**
   * Process audio samples into LPC frames
   * Following BlueWizard's algorithm with multi-criteria energy-based voiced/unvoiced detection:
   * - LPC analysis uses pre-emphasized buffer with user's windowWidth
   * - Pitch estimation uses non-pre-emphasized buffer with windowWidth=2
   * - Energy calculated from both original and emphasized buffers for v/uv detection
   */
  private processFrames(
    emphasizedSamples: Float32Array,
    originalSamples: Float32Array,
    pitchSamples: Float32Array,
    frameSize: number
  ): { frames: FrameData[]; frameAnalysis: FrameAnalysis[] } {
    const frames: FrameData[] = [];
    const frameAnalysis: FrameAnalysis[] = [];

    // LPC analysis window size (user's windowWidth)
    const hopSize = frameSize;
    const analysisWindowSize = frameSize * this.settings.windowWidth;

    // Pitch estimation ALWAYS uses windowWidth=2 (BlueWizard line 109)
    const pitchWindowSize = frameSize * 2;

    for (let i = 0; i + frameSize <= emphasizedSamples.length; i += hopSize) {
      // Calculate frame energy for voiced/unvoiced detection
      // Energy calculated over the 200-sample frame (not the windowed analysis frame)
      const energyFrameStart = i;
      const energyFrameEnd = Math.min(emphasizedSamples.length, i + frameSize);
      const originalEnergyFrame = originalSamples.slice(energyFrameStart, energyFrameEnd);
      const emphasizedEnergyFrame = emphasizedSamples.slice(energyFrameStart, energyFrameEnd);

      const originalEnergy = this.calculateFrameEnergy(originalEnergyFrame, true);
      const emphasizedEnergy = this.calculateFrameEnergy(emphasizedEnergyFrame, false);

      // Extract LPC analysis window from pre-emphasized buffer
      const windowStart = Math.max(0, i - Math.floor((analysisWindowSize - frameSize) / 2));
      const windowEnd = Math.min(emphasizedSamples.length, windowStart + analysisWindowSize);
      const frame = emphasizedSamples.slice(windowStart, windowEnd);

      // Extract pitch window from non-pre-emphasized buffer (windowWidth=2)
      // BlueWizard's Segmenter.m line 41: starts at hop position, NOT centered!
      // sampleIndex = index * self.size + i  → starts at frame position
      const pitchWindowStart = i;
      const pitchWindowEnd = Math.min(pitchSamples.length, i + pitchWindowSize);
      const pitchFrame = pitchSamples.slice(pitchWindowStart, pitchWindowEnd);

      // Apply Hamming window to LPC frame
      const windowed = AudioPreprocessor.applyHammingWindow(frame);

      // Calculate autocorrelation coefficients up to order 10 (r[0..10])
      const autocorr = getCoefficients(windowed, 11);

      // Get reflection coefficients via Leroux-Gueguen algorithm
      const reflector = Reflector.translateCoefficients(
        this.codingTable,
        autocorr,
        frame.length,
        this.settings.unvoicedThreshold
      );

      // Store energy values for multi-criteria voiced/unvoiced detection
      // Always use multi-criteria detection (Criteria 1 & 3 work without pre-emphasis)
      // Only Criterion 2 (energy ratio) requires pre-emphasis
      reflector.originalEnergy = originalEnergy;
      reflector.emphasizedEnergy = emphasizedEnergy;
      reflector.useEnergyBasedDetection = true;
      reflector.skipEnergyRatioCheck = !this.settings.preEmphasis;

      // Apply detection threshold settings
      reflector.minEnergyThreshold = this.settings.minEnergyThreshold;
      reflector.energyRatioThreshold = this.settings.energyRatioThreshold;
      reflector.pitchQualityThreshold = this.settings.pitchQualityThreshold;

      // Estimate pitch from pitch buffer (non-pre-emphasized, 800Hz lowpass)
      let pitch: number;
      let pitchQuality: number;

      if (this.settings.overridePitch) {
        pitch = this.settings.pitchValue;
        pitchQuality = 1.0; // Assume perfect quality for overridden pitch
      } else {
        const pitchResult = estimatePitch(pitchFrame, {
          sampleRate: 8000,
          minPitchHz: this.settings.minPitchHz,
          maxPitchHz: this.settings.maxPitchHz,
          subMultipleThreshold: this.settings.subMultipleThreshold,
          pitchQualityThreshold: this.settings.pitchQualityThreshold,
        });

        pitch = pitchResult.period;
        pitchQuality = pitchResult.quality;
      }

      // Apply pitch offset
      if (pitch > 0 && this.settings.pitchOffset !== 0) {
        pitch = Math.max(0, pitch + this.settings.pitchOffset);
      }

      // Store pitch quality for Criterion 3 (periodicity check)
      reflector.pitchQuality = pitchQuality;

      // NOTE: BlueWizard uses RMS directly from Leroux-Gueguen algorithm (Reflector.m)
      // Do NOT recalculate RMS here - the value from translateCoefficients is correct!
      // RMS normalization happens AFTER all frames are created (BlueWizard Processor.m lines 151-171)

      // Create frame data
      const frameData = new FrameData(reflector, pitch, false);
      frames.push(frameData);

      // Capture frame analysis for visualization
      const energyRatio = reflector.originalEnergy / reflector.emphasizedEnergy;
      const isVoiced = !reflector.isUnvoiced();

      const analysis: FrameAnalysis = {
        frameNumber: frames.length - 1,
        isVoiced,
        pitch,
        pitchHz: pitch > 0 ? 8000 / pitch : 0,
        pitchQuality,
        originalEnergy: reflector.originalEnergy,
        emphasizedEnergy: reflector.emphasizedEnergy,
        energyRatio,
        rms: reflector.rms,
        ks: reflector.ks.slice(), // Copy reflection coefficients
        // Criterion results (only valid when energy-based detection is used)
        criterion1Pass: reflector.originalEnergy >= reflector.minEnergyThreshold,
        criterion2Pass: energyRatio >= reflector.energyRatioThreshold,
        criterion3Pass: pitchQuality >= reflector.pitchQualityThreshold,
        detectionMethod: reflector.useEnergyBasedDetection ? 'energy-based' : 'k1-based',
      };
      frameAnalysis.push(analysis);
    }

    return { frames, frameAnalysis };
  }

  /**
   * Normalize voiced RMS using peak normalization (BlueWizard RMSNormalizer.m lines 9-22)
   * Finds max RMS across all voiced frames and scales to rmsLimit
   */
  private normalizeVoicedRMS(frames: FrameData[]): void {
    // Find maximum RMS across all voiced frames
    let max = 0.0;
    for (const frame of frames) {
      if (!frame.reflector.isUnvoiced() && frame.reflector.rms > max) {
        max = frame.reflector.rms;
      }
    }

    if (max <= 0.0) return;

    // Calculate scale factor to reach rmsLimit
    const limitIndex = Math.min(this.settings.voicedRmsLimit, this.codingTable.rms.length - 1);
    const scale = this.codingTable.rms[limitIndex] / max;

    // Scale all voiced frames
    for (const frame of frames) {
      if (!frame.reflector.isUnvoiced()) {
        frame.reflector.rms = frame.reflector.rms * scale;
      }
    }
  }

  /**
   * Normalize unvoiced RMS using peak normalization (BlueWizard RMSNormalizer.m lines 24-37)
   * Finds max RMS across all unvoiced frames and scales to unvoicedRMSLimit
   */
  private normalizeUnvoicedRMS(frames: FrameData[]): void {
    // Find maximum RMS across all unvoiced frames
    let max = 0.0;
    for (const frame of frames) {
      if (frame.reflector.isUnvoiced() && frame.reflector.rms > max) {
        max = frame.reflector.rms;
      }
    }

    if (max <= 0.0) return;

    // Calculate scale factor to reach unvoicedRMSLimit
    const limitIndex = Math.min(this.settings.unvoicedRmsLimit, this.codingTable.rms.length - 1);
    const scale = this.codingTable.rms[limitIndex] / max;

    // Scale all unvoiced frames
    for (const frame of frames) {
      if (frame.reflector.isUnvoiced()) {
        frame.reflector.rms = frame.reflector.rms * scale;
      }
    }
  }

  /**
   * Apply unvoiced multiplier to all unvoiced frames (BlueWizard RMSNormalizer.m lines 39-44)
   * This is ALWAYS applied, regardless of normalization settings
   */
  private applyUnvoicedMultiplier(frames: FrameData[]): void {
    const multiplier = this.settings.unvoicedMultiplier;
    for (const frame of frames) {
      if (frame.reflector.isUnvoiced()) {
        frame.reflector.rms *= multiplier;
      }
    }
  }
}
