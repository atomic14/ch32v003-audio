/**
 * Tests for FrameData
 * Ported from BlueWizard's FrameDataTests.m
 */

import { describe, it, expect } from 'vitest';
import { FrameData } from './frameData';
import { Reflector } from './reflector';
import { CodingTable } from '../tmsTables';

describe('FrameData', () => {
  const codingTable = new CodingTable('tms5220');

  it('has all parameters for voiced frame', () => {
    const ks = new Array(11).fill(0);
    ks[1] = 0.1; // K1 small = voiced
    const reflector = new Reflector(codingTable, 0.3, ks, 32, false);

    const frameData = new FrameData(reflector, 32, false);
    const params = frameData.parameters();

    // Should have all parameters for voiced frame
    expect(params).toHaveProperty('kParameterGain');
    expect(params).toHaveProperty('kParameterRepeat');
    expect(params).toHaveProperty('kParameterPitch');
    expect(params).toHaveProperty('kParameterK1');
    expect(params).toHaveProperty('kParameterK2');
    expect(params).toHaveProperty('kParameterK3');
    expect(params).toHaveProperty('kParameterK4');
    expect(params).toHaveProperty('kParameterK5');
    expect(params).toHaveProperty('kParameterK6');
    expect(params).toHaveProperty('kParameterK7');
    expect(params).toHaveProperty('kParameterK8');
    expect(params).toHaveProperty('kParameterK9');
    expect(params).toHaveProperty('kParameterK10');
  });

  it('has unvoiced parameters when K1 is large', () => {
    const ks = new Array(11).fill(0);
    ks[1] = 5.0; // K1 large = unvoiced (>= threshold 0.3)
    const reflector = new Reflector(codingTable, 0.3, ks, 32, false);

    expect(reflector.isUnvoiced()).toBe(true);

    const frameData = new FrameData(reflector, 32, false);
    const params = frameData.parameters();

    // Should have K1-K4 only (unvoiced)
    expect(params).toHaveProperty('kParameterGain');
    expect(params).toHaveProperty('kParameterRepeat');
    expect(params).toHaveProperty('kParameterPitch');
    expect(params).toHaveProperty('kParameterK1');
    expect(params).toHaveProperty('kParameterK2');
    expect(params).toHaveProperty('kParameterK3');
    expect(params).toHaveProperty('kParameterK4');
    expect(params).not.toHaveProperty('kParameterK5');
    expect(params).not.toHaveProperty('kParameterK6');
    expect(params).not.toHaveProperty('kParameterK7');
    expect(params).not.toHaveProperty('kParameterK8');
    expect(params).not.toHaveProperty('kParameterK9');
    expect(params).not.toHaveProperty('kParameterK10');
  });

  it('has unvoiced parameters when pitch is zero', () => {
    const ks = new Array(11).fill(0);
    ks[1] = 0.1; // K1 small, but pitch=0 forces unvoiced
    const reflector = new Reflector(codingTable, 0.3, ks, 32, false);

    const frameData = new FrameData(reflector, 0, false); // pitch = 0
    const params = frameData.parameters();

    // Should have K1-K4 only (unvoiced due to pitch=0)
    expect(params).toHaveProperty('kParameterGain');
    expect(params).toHaveProperty('kParameterRepeat');
    expect(params).toHaveProperty('kParameterPitch');
    expect(params).toHaveProperty('kParameterK1');
    expect(params).toHaveProperty('kParameterK2');
    expect(params).toHaveProperty('kParameterK3');
    expect(params).toHaveProperty('kParameterK4');
    expect(params).not.toHaveProperty('kParameterK5');
    expect(params).not.toHaveProperty('kParameterK6');
    expect(params).not.toHaveProperty('kParameterK7');
    expect(params).not.toHaveProperty('kParameterK8');
    expect(params).not.toHaveProperty('kParameterK9');
    expect(params).not.toHaveProperty('kParameterK10');
  });

  it('has gain-only parameters when gain is zero', () => {
    const ks = new Array(11).fill(0);
    const reflector = new Reflector(codingTable, 0.3, ks, 0, false); // rms = 0

    const frameData = new FrameData(reflector, 0, false);
    const params = frameData.parameters();

    // Should only have gain parameter (silent frame)
    expect(params).toHaveProperty('kParameterGain');
    expect(params['kParameterGain']).toBe(0); // Zero energy
    expect(params).not.toHaveProperty('kParameterRepeat');
    expect(params).not.toHaveProperty('kParameterPitch');
    expect(params).not.toHaveProperty('kParameterK1');
    expect(params).not.toHaveProperty('kParameterK2');
    expect(params).not.toHaveProperty('kParameterK3');
    expect(params).not.toHaveProperty('kParameterK4');
  });

  it('has repeat parameters (no K coefficients)', () => {
    const ks = new Array(11).fill(0);
    const reflector = new Reflector(codingTable, 0.3, ks, 32, false);

    const frameData = new FrameData(reflector, 32, true); // repeat = true
    const params = frameData.parameters();

    // Repeat frame: should only have gain, repeat, pitch
    expect(params).toHaveProperty('kParameterGain');
    expect(params).toHaveProperty('kParameterRepeat');
    expect(params).toHaveProperty('kParameterPitch');
    expect(params['kParameterRepeat']).toBe(1); // Repeat flag set
    expect(params).not.toHaveProperty('kParameterK1');
    expect(params).not.toHaveProperty('kParameterK2');
    expect(params).not.toHaveProperty('kParameterK3');
    expect(params).not.toHaveProperty('kParameterK4');
  });

  it('creates stop frame correctly', () => {
    const ks = new Array(11).fill(0);
    const reflector = new Reflector(codingTable, 0.3, ks, 100, false);
    const frameData = new FrameData(reflector, 32, false);

    const stopFrame = frameData.stopFrame();

    // Stop frame should have stop frame RMS value
    expect(stopFrame.reflector.rms).toBe(codingTable.rms[codingTable.kStopFrameIndex]);
    expect(stopFrame.pitch).toBe(0);
    expect(stopFrame.repeat).toBe(false);
  });

  it('quantizes RMS to closest table value', () => {
    const ks = new Array(11).fill(0);
    // RMS = 50, should quantize to closest value in RMS table
    const reflector = new Reflector(codingTable, 0.3, ks, 50, false);
    const frameData = new FrameData(reflector, 32, false);

    const params = frameData.parameters();

    // Gain should be quantized index (not the actual RMS value)
    expect(params['kParameterGain']).toBeGreaterThanOrEqual(0);
    expect(params['kParameterGain']).toBeLessThan(codingTable.rms.length);
  });
});
