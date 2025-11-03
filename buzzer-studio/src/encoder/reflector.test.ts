/**
 * Tests for Reflector
 * Ported from BlueWizard's ReflectorTests.m
 */

import { describe, it, expect } from 'vitest';
import { Reflector } from './reflector';
import { CodingTable } from '../tmsTables';

describe('Reflector', () => {
  it('does not allow stop frames to get generated', () => {
    const codingTable = new CodingTable('tms5220');
    const reflector = new Reflector(codingTable, 0.3);

    // Set RMS to stop frame value (index 15)
    const stopFrameRMS = codingTable.rms[15];
    reflector.rms = stopFrameRMS;

    // Without limitRMS, should return the set value
    expect(reflector.rms).toBe(stopFrameRMS);

    // Create new reflector with limitRMS enabled
    const limitedReflector = new Reflector(
      codingTable,
      0.3,
      new Array(11).fill(0),
      stopFrameRMS,
      true // limitRMS = true
    );

    // With limitRMS, should cap at index 14 (kStopFrameIndex - 1)
    expect(limitedReflector.rms).toBe(codingTable.rms[14]);
  });

  it('computes reflection coefficients using Leroux-Gueguen', () => {
    const codingTable = new CodingTable('tms5220');

    // Simple autocorrelation test data
    // r[0] = energy, r[1..10] = autocorrelation lags
    const r = new Float32Array([100, -20, 15, -10, 5, -3, 2, -1, 0.5, -0.2, 0.1]);

    const reflector = Reflector.translateCoefficients(codingTable, r, 200, 0.3);

    // Check that K coefficients are computed
    expect(reflector.ks).toBeDefined();
    expect(reflector.ks.length).toBe(11);

    // K1 should be -r[1]/r[0] = -(-20)/100 = 0.2
    expect(reflector.ks[1]).toBeCloseTo(0.2, 5);

    // All Ks should be in range [-1, 1]
    for (let i = 1; i <= 10; i++) {
      expect(reflector.ks[i]).toBeGreaterThanOrEqual(-1.0);
      expect(reflector.ks[i]).toBeLessThanOrEqual(1.0);
    }

    // RMS should be computed and positive
    expect(reflector.rms).toBeGreaterThan(0);
  });

  it('handles silent frame (r[0] = 0)', () => {
    const codingTable = new CodingTable('tms5220');

    // Silent frame: all zeros
    const r = new Float32Array(11).fill(0);

    const reflector = Reflector.translateCoefficients(codingTable, r, 200, 0.3);

    // Should return zero RMS for silent frame
    expect(reflector.rms).toBe(0);

    // Ks should all be zero
    for (let i = 1; i <= 10; i++) {
      expect(reflector.ks[i]).toBe(0);
    }
  });

  it('determines voiced vs unvoiced based on K1 threshold', () => {
    const codingTable = new CodingTable('tms5220');
    const threshold = 0.3;

    // Create reflector with K1 < threshold (voiced)
    const voicedReflector = new Reflector(codingTable, threshold);
    voicedReflector.ks[1] = 0.2; // Below threshold
    expect(voicedReflector.isVoiced()).toBe(true);
    expect(voicedReflector.isUnvoiced()).toBe(false);

    // Create reflector with K1 >= threshold (unvoiced)
    const unvoicedReflector = new Reflector(codingTable, threshold);
    unvoicedReflector.ks[1] = 0.5; // Above threshold
    expect(unvoicedReflector.isVoiced()).toBe(false);
    expect(unvoicedReflector.isUnvoiced()).toBe(true);

    // Edge case: exactly at threshold
    const edgeReflector = new Reflector(codingTable, threshold);
    edgeReflector.ks[1] = 0.3; // Exactly at threshold
    expect(edgeReflector.isUnvoiced()).toBe(true); // >= threshold means unvoiced
  });

  it('formats RMS correctly', () => {
    // Test RMS formatting: sqrt(energy / samples) * 2^15
    const energy = 10000;
    const samples = 200;
    const expectedRMS = Math.sqrt(energy / samples) * (1 << 15);

    const formattedRMS = Reflector.formattedRMS(energy, samples);

    expect(formattedRMS).toBeCloseTo(expectedRMS, 5);
  });
});
