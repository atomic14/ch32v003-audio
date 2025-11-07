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
  isSilent: boolean; // True if RMS will quantize to 0 (SILENCE frame)
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
  tablesVariant: 'tms5220' | 'tms5100' | 'tms5200';
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
  // Input conditioning
  removeDC?: boolean;
  peakNormalize?: boolean;
  medianFilterWindow?: number; // 0 or undefined disables
  noiseGateEnable?: boolean;
  noiseGateThreshold?: number; // linear amplitude [0..1]
  noiseGateKnee?: number; // >1 softer
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

    // PREPROCESSING PIPELINE
    // Always remove DC offset for stable thresholds
    samples = AudioPreprocessor.removeDCOffset(samples);

    // Optional: median filter for impulse noise
    if ((this.settings.medianFilterWindow ?? 0) > 0) {
      samples = AudioPreprocessor.applyMedianFilter(
        samples,
        this.settings.medianFilterWindow as number
      );
    }

    // Optional: light peak normalization (pre-analysis)
    if (this.settings.peakNormalize) {
      samples = AudioPreprocessor.normalizePeak(samples);
    }

    // High-pass filter (skip if cutoff is 0 or invalid)
    if (this.settings.highpassCutoff > 0 && this.settings.highpassCutoff < 4000) {
      samples = AudioPreprocessor.applyHighPassFilter(
        samples,
        this.settings.highpassCutoff,
        TMS_SAMPLE_RATE
      );
    }

    // Low-pass filter (skip if cutoff is above Nyquist or invalid)
    if (this.settings.lowpassCutoff > 0 && this.settings.lowpassCutoff <= 4000) {
      samples = AudioPreprocessor.applyLowPassFilter(
        samples,
        this.settings.lowpassCutoff,
        TMS_SAMPLE_RATE
      );
    }

    // Apply gain
    if (this.settings.gain !== 1.0) {
      samples = samples.map((s) => s * this.settings.gain);
    }

    // Optional: soft noise gate (after linear filters and gain, before pre-emphasis)
    if (this.settings.noiseGateEnable && (this.settings.noiseGateThreshold ?? 0) > 0) {
      const knee = this.settings.noiseGateKnee ?? 2.0;
      samples = AudioPreprocessor.applySoftNoiseGate(
        samples,
        this.settings.noiseGateThreshold as number,
        knee
      );
    }

    // CRITICAL: Keep original samples for pitch estimation and unvoiced frames
    const originalSamples = new Float32Array(samples);

    // Apply pre-emphasis to create emphasized buffer (for voiced frames and energy ratio)
    let emphasizedSamples = samples;
    if (this.settings.preEmphasis) {
      emphasizedSamples = AudioPreprocessor.applyPreEmphasis(samples, this.settings.preEmphasisAlpha);
    }

    // Prepare pitch buffer with lowpass filter for pitch estimation (uses original)
    let pitchSamples = AudioPreprocessor.applyLowPassFilterHighOrder(
      originalSamples,
      PITCH_ESTIMATION_LOWPASS_HZ,
      TMS_SAMPLE_RATE,
      PITCH_ESTIMATION_FILTER_ORDER
    );

    // Store preprocessed samples (original for display)
    const preprocessedSamples = new Float32Array(originalSamples);

    // Calculate frame size based on frame rate
    const frameSize = Math.floor(TMS_SAMPLE_RATE / this.settings.frameRate);

    // Process frames (use emphasized for voiced, original for unvoiced)
    console.log(`Processing ${Math.floor(originalSamples.length / frameSize)} frames...`);
    let { frames, frameAnalysis } = this.processFrames(
      originalSamples,
      emphasizedSamples,
      pitchSamples,
      frameSize
    );

    // Temporal smoothing and hysteresis before normalization/trim
    this.applyVoicedUnvoicedSmoothing(frames);
    this.applyPitchSmoothing(frames);
    // this.applyCoefficientSmoothing(frames);

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
        if (this.frameIsVoiced(frames[i]) || frames[i].reflector.rms > energyThreshold) {
          firstVoiced = i;
          break;
        }
      }

      // Find last voiced/energetic frame
      for (let i = frames.length - 1; i >= 0; i--) {
        if (this.frameIsVoiced(frames[i]) || frames[i].reflector.rms > energyThreshold) {
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
   * Can calculate from original or emphasized signal
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
   * Following BlueWizard's algorithm with selective buffer usage:
   * - Voiced/unvoiced detection uses BOTH original and emphasized for full 3-criterion check
   * - LPC analysis uses emphasized buffer for VOICED frames, original for UNVOICED
   * - Pitch estimation uses original non-pre-emphasized buffer with windowWidth=2
   * - Energy calculated from both buffers for energy ratio criterion
   */
  private processFrames(
    originalSamples: Float32Array,
    emphasizedSamples: Float32Array,
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

    for (let i = 0; i + frameSize <= originalSamples.length; i += hopSize) {
      // Step 1: Calculate frame energy from BOTH original and emphasized signals
      // Energy calculated over the 200-sample frame (not the windowed analysis frame)
      const energyFrameStart = i;
      const energyFrameEnd = Math.min(originalSamples.length, i + frameSize);
      const originalEnergyFrame = originalSamples.slice(energyFrameStart, energyFrameEnd);
      const emphasizedEnergyFrame = emphasizedSamples.slice(energyFrameStart, energyFrameEnd);

      const originalEnergy = this.calculateFrameEnergy(originalEnergyFrame, true);
      const emphasizedEnergy = this.calculateFrameEnergy(emphasizedEnergyFrame, false);

      // Step 2: Extract pitch window from pitch buffer and estimate pitch
      // BlueWizard's Segmenter.m line 41: starts at hop position, NOT centered!
      const pitchWindowStart = i;
      const pitchWindowEnd = Math.min(pitchSamples.length, i + pitchWindowSize);
      const pitchFrame = pitchSamples.slice(pitchWindowStart, pitchWindowEnd);

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

      // Step 3: Voiced/unvoiced determination using 2 criteria
      // Criterion 1: Minimum energy threshold (exclude silence)
      // Criterion 3: Pitch quality (periodic = voiced, aperiodic = unvoiced)
      // Criterion 2 (energy ratio) is skipped - pitch quality is sufficient
      const energyRatio = originalEnergy / emphasizedEnergy;
      const passesEnergyThreshold = originalEnergy >= this.settings.minEnergyThreshold;
      const passesEnergyRatio = energyRatio >= this.settings.energyRatioThreshold;
      const passesPitchQuality = pitchQuality >= this.settings.pitchQualityThreshold;

      // Frame is voiced if both criteria pass (skip energy ratio check)
      const isVoicedFrame = passesEnergyThreshold && passesPitchQuality;

      // Step 4: Extract LPC analysis window
      const windowStart = Math.max(0, i - Math.floor((analysisWindowSize - frameSize) / 2));
      const windowEnd = Math.min(originalSamples.length, windowStart + analysisWindowSize);

      // Use emphasized buffer for ALL frames when pre-emphasis is enabled
      // The TMS5220 decoder compensates for this during synthesis
      const sourceBuffer = this.settings.preEmphasis ? emphasizedSamples : originalSamples;
      const frame = sourceBuffer.slice(windowStart, Math.min(sourceBuffer.length, windowEnd));

      // Step 5: Apply Hamming window to LPC frame
      const windowed = AudioPreprocessor.applyHammingWindow(frame);

      // Step 6: Calculate autocorrelation coefficients up to order 10 (r[0..10])
      const autocorr = getCoefficients(windowed, 11);

      // Step 7: Get reflection coefficients via Leroux-Gueguen algorithm
      const reflector = Reflector.translateCoefficients(
        this.codingTable,
        autocorr,
        frame.length,
        this.settings.unvoicedThreshold
      );

      // Store energy and pitch quality for full 3-criterion detection
      reflector.originalEnergy = originalEnergy;
      reflector.emphasizedEnergy = emphasizedEnergy;
      reflector.pitchQuality = pitchQuality;
      reflector.useEnergyBasedDetection = true;
      reflector.skipEnergyRatioCheck = true; // Always skip energy ratio (criterion 2)

      // Apply detection threshold settings
      reflector.minEnergyThreshold = this.settings.minEnergyThreshold;
      reflector.energyRatioThreshold = this.settings.energyRatioThreshold;
      reflector.pitchQualityThreshold = this.settings.pitchQualityThreshold;

      // NOTE: BlueWizard uses RMS directly from Leroux-Gueguen algorithm (Reflector.m)
      // Do NOT recalculate RMS here - the value from translateCoefficients is correct!
      // RMS normalization happens AFTER all frames are created (BlueWizard Processor.m lines 151-171)

      // Create frame data
      const frameData = new FrameData(reflector, pitch, false);
      frames.push(frameData);

      // Capture frame analysis for visualization
      // A frame will be encoded as SILENCE if RMS < 26.0 (midpoint between RMS_TABLE[0]=0.0 and RMS_TABLE[1]=52.0)
      const isSilent = reflector.rms < 26.0;

      const analysis: FrameAnalysis = {
        frameNumber: frames.length - 1,
        isVoiced: isVoicedFrame,
        isSilent,
        pitch,
        pitchHz: pitch > 0 ? 8000 / pitch : 0,
        pitchQuality,
        originalEnergy,
        emphasizedEnergy,
        energyRatio,
        rms: reflector.rms,
        ks: reflector.ks.slice(), // Copy reflection coefficients
        // Criterion results
        criterion1Pass: passesEnergyThreshold,
        criterion2Pass: passesEnergyRatio,
        criterion3Pass: passesPitchQuality,
        detectionMethod: 'energy-based',
      };
      frameAnalysis.push(analysis);
    }

    return { frames, frameAnalysis };
  }

  /** Use voiced override on a frame if present */
  private frameIsVoiced(frame: FrameData): boolean {
    if (frame.voicedOverride !== null) return frame.voicedOverride;
    return frame.reflector.isVoiced();
  }

  /** Median-filter and hysteresis the voiced/unvoiced state to reduce toggling */
  private applyVoicedUnvoicedSmoothing(frames: FrameData[]): void {
    const initial: boolean[] = frames.map((f) => f.reflector.isVoiced());
    const window = 5;
    const half = Math.floor(window / 2);
    const smoothed: boolean[] = new Array<boolean>(initial.length).fill(false);

    for (let i = 0; i < initial.length; i++) {
      let voicedCount = 0;
      let total = 0;
      for (let j = -half; j <= half; j++) {
        const idx = i + j;
        if (idx >= 0 && idx < initial.length) {
          total += 1;
          voicedCount += initial[idx] ? 1 : 0;
        }
      }
      smoothed[i] = voicedCount >= Math.ceil(total / 2);
    }

    // Hysteresis: discourage rapid state flips by requiring two consecutive frames to flip
    let prev = smoothed.length > 0 ? smoothed[0] : false;
    for (let i = 0; i < smoothed.length; i++) {
      const current = smoothed[i];
      if (current !== prev) {
        const next = i + 1 < smoothed.length ? smoothed[i + 1] : current;
        if (next !== current) {
          smoothed[i] = prev; // suppress isolated flip
        }
      }
      prev = smoothed[i];
    }

    for (let i = 0; i < frames.length; i++) {
      frames[i].voicedOverride = smoothed[i];
      if (!smoothed[i]) {
        frames[i].pitch = 0; // ensure unvoiced pitch is zero after smoothing
      }
    }
  }

  /** Smooth pitch with continuity constraints and octave snap */
  private applyPitchSmoothing(frames: FrameData[]): void {
    let previousPitch = 0;
    let previousVoiced = false;
    for (let i = 0; i < frames.length; i++) {
      const isVoiced = this.frameIsVoiced(frames[i]);
      let pitch = frames[i].pitch;
      if (!isVoiced) {
        frames[i].pitch = 0;
        previousVoiced = false;
        previousPitch = 0;
        continue;
      }

      if (previousVoiced && previousPitch > 0 && pitch > 0) {
        const ratio = pitch / previousPitch;
        // Octave snap if very close to 2x or 0.5x
        if (ratio > 1.8 && ratio < 2.2) {
          pitch = previousPitch * 2;
        } else if (ratio > 0.45 && ratio < 0.55) {
          pitch = previousPitch * 0.5;
        }
        // Limit per-frame change to ±25%
        const minAllowed = previousPitch * 0.75;
        const maxAllowed = previousPitch * 1.25;
        if (pitch < minAllowed) pitch = minAllowed;
        if (pitch > maxAllowed) pitch = maxAllowed;
        // Low-pass smoothing
        pitch = 0.7 * previousPitch + 0.3 * pitch;
      }

      frames[i].pitch = pitch;
      previousPitch = pitch;
      previousVoiced = isVoiced;
    }
  }

  /**
   * Normalize voiced RMS using peak normalization (BlueWizard RMSNormalizer.m lines 9-22)
   * Finds max RMS across all voiced frames and scales to rmsLimit
   * IMPORTANT: Excludes SILENCE frames (RMS < 26.0) from normalization to preserve them
   */
  private normalizeVoicedRMS(frames: FrameData[]): void {
    const SILENCE_RMS_THRESHOLD = 26.0;

    // Find maximum RMS across all voiced frames (excluding SILENCE frames)
    let max = 0.0;
    for (const frame of frames) {
      if (
        !frame.reflector.isUnvoiced() &&
        frame.reflector.rms >= SILENCE_RMS_THRESHOLD &&
        frame.reflector.rms > max
      ) {
        max = frame.reflector.rms;
      }
    }

    if (max <= 0.0) return;

    // Calculate scale factor to reach rmsLimit
    const limitIndex = Math.min(this.settings.voicedRmsLimit, this.codingTable.rms.length - 1);
    const scale = this.codingTable.rms[limitIndex] / max;

    // Scale all voiced frames (excluding SILENCE frames)
    for (const frame of frames) {
      if (!frame.reflector.isUnvoiced() && frame.reflector.rms >= SILENCE_RMS_THRESHOLD) {
        frame.reflector.rms = frame.reflector.rms * scale;
      }
    }
  }

  /**
   * Normalize unvoiced RMS using peak normalization (BlueWizard RMSNormalizer.m lines 24-37)
   * Finds max RMS across all unvoiced frames and scales to unvoicedRMSLimit
   * IMPORTANT: Excludes SILENCE frames (RMS < 26.0) from normalization to preserve them
   */
  private normalizeUnvoicedRMS(frames: FrameData[]): void {
    const SILENCE_RMS_THRESHOLD = 26.0;

    // Find maximum RMS across all unvoiced frames (excluding SILENCE frames)
    let max = 0.0;
    for (const frame of frames) {
      if (
        frame.reflector.isUnvoiced() &&
        frame.reflector.rms >= SILENCE_RMS_THRESHOLD &&
        frame.reflector.rms > max
      ) {
        max = frame.reflector.rms;
      }
    }

    if (max <= 0.0) return;

    // Calculate scale factor to reach unvoicedRMSLimit
    const limitIndex = Math.min(this.settings.unvoicedRmsLimit, this.codingTable.rms.length - 1);
    const scale = this.codingTable.rms[limitIndex] / max;

    // Scale all unvoiced frames (excluding SILENCE frames)
    for (const frame of frames) {
      if (frame.reflector.isUnvoiced() && frame.reflector.rms >= SILENCE_RMS_THRESHOLD) {
        frame.reflector.rms = frame.reflector.rms * scale;
      }
    }
  }

  /**
   * Apply unvoiced multiplier to all unvoiced frames (BlueWizard RMSNormalizer.m lines 39-44)
   * This is ALWAYS applied, regardless of normalization settings
   * IMPORTANT: Excludes SILENCE frames (RMS < 26.0) to preserve them
   */
  private applyUnvoicedMultiplier(frames: FrameData[]): void {
    const SILENCE_RMS_THRESHOLD = 26.0;
    const multiplier = this.settings.unvoicedMultiplier;
    for (const frame of frames) {
      if (frame.reflector.isUnvoiced() && frame.reflector.rms >= SILENCE_RMS_THRESHOLD) {
        frame.reflector.rms *= multiplier;
      }
    }
  }
}
