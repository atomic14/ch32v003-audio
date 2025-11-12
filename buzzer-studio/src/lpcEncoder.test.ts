/**
 * Integration tests for LPCEncoder
 * Tests the complete encoding pipeline
 */

import { describe, it, expect } from 'vitest';
import { LPCEncoder } from './lpcEncoder';
import type { EncoderSettings } from './lpcEncoder';

describe('LPCEncoder Integration', () => {
  /**
   * Helper to get max absolute value from Float32Array
   */
  function getMaxAbsolute(samples: Float32Array): number {
    let max = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > max) max = abs;
    }
    return max;
  }

  /**
   * Helper to create default settings with all required fields
   */
  function getDefaultSettings(overrides: Partial<EncoderSettings> = {}): EncoderSettings {
    return {
      tablesVariant: 'tms5220',
      frameRate: 40,
      unvoicedThreshold: 0.3,
      windowWidth: 2,
      preEmphasis: false,
      preEmphasisAlpha: 0.95,
      normalizeUnvoiced: false,
      normalizeVoiced: false,
      includeExplicitStopFrame: true,
      minPitchHz: 50,
      maxPitchHz: 500,
      subMultipleThreshold: 0.9,
      overridePitch: false,
      pitchValue: 0,
      pitchOffset: 0,
      voicedRmsLimit: 8,
      unvoicedRmsLimit: 6,
      unvoicedMultiplier: 1.0,
      highpassCutoff: 100,
      lowpassCutoff: 3500,
      trimSilence: false,
      includeHexPrefix: true,
      startSample: 0,
      endSample: 0,
      minEnergyThreshold: 0.0001,
      energyRatioThreshold: 1.2,
      pitchQualityThreshold: 0.5,
      silenceThreshold: 26.0,
      detectionMethod: 'energy-based',
      ...overrides,
    };
  }

  /**
   * Create a minimal valid WAV file in memory
   * PCM, 8000 Hz, 16-bit, mono
   */
  function createTestWav(samples: number[]): ArrayBuffer {
    const numChannels = 1;
    const sampleRate = 8000;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * bytesPerSample;
    const fileSize = 36 + dataSize;

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    view.setUint8(0, 'R'.charCodeAt(0));
    view.setUint8(1, 'I'.charCodeAt(0));
    view.setUint8(2, 'F'.charCodeAt(0));
    view.setUint8(3, 'F'.charCodeAt(0));
    view.setUint32(4, fileSize, true);

    // WAVE format
    view.setUint8(8, 'W'.charCodeAt(0));
    view.setUint8(9, 'A'.charCodeAt(0));
    view.setUint8(10, 'V'.charCodeAt(0));
    view.setUint8(11, 'E'.charCodeAt(0));

    // fmt chunk
    view.setUint8(12, 'f'.charCodeAt(0));
    view.setUint8(13, 'm'.charCodeAt(0));
    view.setUint8(14, 't'.charCodeAt(0));
    view.setUint8(15, ' '.charCodeAt(0));
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // audio format (PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    view.setUint8(36, 'd'.charCodeAt(0));
    view.setUint8(37, 'a'.charCodeAt(0));
    view.setUint8(38, 't'.charCodeAt(0));
    view.setUint8(39, 'a'.charCodeAt(0));
    view.setUint32(40, dataSize, true);

    // Write samples
    for (let i = 0; i < samples.length; i++) {
      view.setInt16(44 + i * 2, Math.floor(samples[i] * 32767), true);
    }

    return buffer;
  }

  it('encodes a simple sine wave', () => {
    // Generate a 100Hz sine wave at 8kHz for 0.25 seconds (2000 samples)
    const sampleRate = 8000;
    const duration = 0.25; // seconds
    const frequency = 100; // Hz
    const numSamples = Math.floor(sampleRate * duration);

    const samples: number[] = [];
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const sample = Math.sin(2 * Math.PI * frequency * t) * 0.5;
      samples.push(sample);
    }

    const wavBuffer = createTestWav(samples);

    const settings = getDefaultSettings({
      windowWidth: 2,
    });

    const encoder = new LPCEncoder(settings);
    const result = encoder.encodeWav(wavBuffer);

    // Verify output
    expect(result.hex).toBeTruthy();
    expect(result.hex).toContain('0x');
    expect(result.hex).toContain(',');

    // Check raw samples
    expect(result.rawSamples.length).toBe(numSamples);

    // Check preprocessed samples
    expect(result.preprocessedSamples.length).toBe(numSamples);

    // Verify hex output is valid
    const hexBytes = result.hex.split(',');
    expect(hexBytes.length).toBeGreaterThan(0);
    hexBytes.forEach((byte) => {
      expect(byte).toMatch(/^0x[0-9A-F]{2}$/);
    });
  });

  it('handles silent audio', () => {
    // Generate 0.1 seconds of silence
    const numSamples = 800; // 0.1s at 8kHz
    const samples = Array.from<number>({ length: numSamples }).fill(0);

    const wavBuffer = createTestWav(samples);

    const settings = getDefaultSettings({
      tablesVariant: 'tms5100',
      windowWidth: 1,
    });

    const encoder = new LPCEncoder(settings);
    const result = encoder.encodeWav(wavBuffer);

    // Should still encode (with zero/low energy frames)
    expect(result.hex).toBeTruthy();

    // Preprocessed samples should be silent (or near-silent after normalization)
    const maxAmplitude = getMaxAbsolute(result.preprocessedSamples);
    expect(maxAmplitude).toBeLessThan(0.01);
  });

  it('handles different table variants', () => {
    // Generate a 150Hz sine wave to test pitch encoding (different pitch tables)
    const sampleRate = 8000;
    const duration = 0.05; // 0.05 seconds
    const frequency = 150; // Hz
    const numSamples = Math.floor(sampleRate * duration);

    const samples: number[] = [];
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const sample = Math.sin(2 * Math.PI * frequency * t) * 0.5;
      samples.push(sample);
    }

    const wavBuffer = createTestWav(samples);

    // Test TMS5220
    const settings5220 = getDefaultSettings({
      windowWidth: 1,
      includeExplicitStopFrame: false,
    });

    const encoder5220 = new LPCEncoder(settings5220);
    const result5220 = encoder5220.encodeWav(wavBuffer);
    expect(result5220.hex).toBeTruthy();

    // Test TMS5100
    const settings5100 = getDefaultSettings({
      tablesVariant: 'tms5100',
      windowWidth: 1,
      includeExplicitStopFrame: false,
    });
    const encoder5100 = new LPCEncoder(settings5100);
    const result5100 = encoder5100.encodeWav(wavBuffer);
    expect(result5100.hex).toBeTruthy();

    // Both should produce valid output
    // TMS5220 has 6-bit pitch (64 values), TMS5100 has 5-bit pitch (32 values)
    // So encoding may differ for pitched sounds
    expect(result5220.hex.length).toBeGreaterThan(0);
    expect(result5100.hex.length).toBeGreaterThan(0);
  });

  it('applies preprocessing correctly', () => {
    const numSamples = 800;
    const samples: number[] = [];

    // Generate sawtooth wave (lots of harmonics)
    for (let i = 0; i < numSamples; i++) {
      samples.push((i % 80) / 80 - 0.5);
    }

    const wavBuffer = createTestWav(samples);

    const settings = getDefaultSettings({
      windowWidth: 1,
      preEmphasis: true,
      includeExplicitStopFrame: false,
    });

    const encoder = new LPCEncoder(settings);
    const result = encoder.encodeWav(wavBuffer);

    // Verify preprocessing was applied
    expect(result.rawSamples).not.toEqual(result.preprocessedSamples);

    // Preprocessed samples should be normalized
    const maxAmplitude = getMaxAbsolute(result.preprocessedSamples);
    expect(maxAmplitude).toBeGreaterThan(0.5); // Should be normalized to ~0.95
  });

  it('loads and resamples WAV without full encoding', () => {
    const numSamples = 400;
    const samples = Array.from<number>({ length: numSamples }).fill(0.5);
    const wavBuffer = createTestWav(samples);

    const settings = getDefaultSettings({
      windowWidth: 1,
      includeExplicitStopFrame: false,
    });

    const encoder = new LPCEncoder(settings);
    const resampled = encoder.loadAndResampleWav(wavBuffer);

    expect(resampled).toBeTruthy();
    expect(resampled!.length).toBe(numSamples); // Already 8kHz, no resampling
  });
});
