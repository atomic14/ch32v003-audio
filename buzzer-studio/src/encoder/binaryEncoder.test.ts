/**
 * Tests for BinaryEncoder
 * Ported from BlueWizard's FrameDataBinaryEncoderTests.m
 */

import { describe, it, expect } from 'vitest';
import { encodeFramesToBinary } from './binaryEncoder';
import { CodingTable } from '../tmsTables';

describe('BinaryEncoder', () => {
  it('converts frames into binary nibbles', () => {
    // Test data from BlueWizard
    // Note: Using TMS5100 (5-bit pitch) as in the original test
    const codingTable = new CodingTable('tms5100');

    const frameData: Record<string, number>[] = [
      {
        kParameterGain: 9,
        kParameterRepeat: 0,
        kParameterPitch: 0,
        kParameterK1: 21,
        kParameterK2: 22,
        kParameterK3: 6,
        kParameterK4: 6,
      },
      { kParameterGain: 6, kParameterRepeat: 1, kParameterPitch: 0 },
      { kParameterGain: 6, kParameterRepeat: 1, kParameterPitch: 0 },
      {
        kParameterGain: 13,
        kParameterRepeat: 0,
        kParameterPitch: 10,
        kParameterK1: 18,
        kParameterK2: 16,
        kParameterK3: 5,
        kParameterK4: 5,
        kParameterK5: 6,
        kParameterK6: 11,
        kParameterK7: 10,
        kParameterK8: 5,
        kParameterK9: 3,
        kParameterK10: 2,
      },
      { kParameterGain: 13, kParameterRepeat: 1, kParameterPitch: 11 },
      {
        kParameterGain: 13,
        kParameterRepeat: 0,
        kParameterPitch: 12,
        kParameterK1: 22,
        kParameterK2: 17,
        kParameterK3: 7,
        kParameterK4: 4,
        kParameterK5: 0,
        kParameterK6: 10,
        kParameterK7: 11,
        kParameterK8: 6,
        kParameterK9: 4,
        kParameterK10: 3,
      },
      { kParameterGain: 0 },
    ];

    const expected = [
      '1001',
      '0000',
      '0010',
      '1011',
      '0110',
      '0110',
      '0110',
      '0110',
      '1000',
      '0001',
      '1010',
      '0000',
      '1101',
      '0010',
      '1010',
      '0101',
      '0000',
      '0101',
      '0101',
      '0110',
      '1011',
      '1010',
      '1010',
      '1101',
      '0110',
      '1101',
      '0111',
      '1010',
      '0110',
      '0101',
      '1010',
      '0010',
      '1110',
      '1000',
      '0001',
      '0101',
      '0111',
      '1010',
      '0011',
      '0000',
    ];

    const result = encodeFramesToBinary(codingTable, frameData);

    expect(result).toEqual(expected);
  });

  it('handles single frame with all parameters', () => {
    const codingTable = new CodingTable('tms5220');

    const frameData: Record<string, number>[] = [
      {
        kParameterGain: 8,
        kParameterRepeat: 0,
        kParameterPitch: 32,
        kParameterK1: 16,
        kParameterK2: 16,
        kParameterK3: 8,
        kParameterK4: 8,
        kParameterK5: 8,
        kParameterK6: 8,
        kParameterK7: 8,
        kParameterK8: 4,
        kParameterK9: 4,
        kParameterK10: 4,
      },
    ];

    const result = encodeFramesToBinary(codingTable, frameData);

    // Should produce valid 4-bit nibbles
    expect(result.length).toBeGreaterThan(0);
    result.forEach((nibble) => {
      expect(nibble).toMatch(/^[01]{4}$/);
    });
  });

  it('handles silent frame (gain only)', () => {
    const codingTable = new CodingTable('tms5220');

    const frameData: Record<string, number>[] = [{ kParameterGain: 0 }];

    const result = encodeFramesToBinary(codingTable, frameData);

    // Silent frame should only encode energy (4 bits)
    expect(result.length).toBe(1); // One nibble
    expect(result[0]).toBe('0000'); // Zero energy
  });

  it('handles repeat frame', () => {
    const codingTable = new CodingTable('tms5220');

    const frameData: Record<string, number>[] = [
      {
        kParameterGain: 10,
        kParameterRepeat: 1,
        kParameterPitch: 20,
      },
    ];

    const result = encodeFramesToBinary(codingTable, frameData);

    // Repeat frame: energy (4) + repeat (1) + pitch (6) = 11 bits = 3 nibbles (padded)
    expect(result.length).toBeGreaterThanOrEqual(3);
    result.forEach((nibble) => {
      expect(nibble).toMatch(/^[01]{4}$/);
    });
  });
});
