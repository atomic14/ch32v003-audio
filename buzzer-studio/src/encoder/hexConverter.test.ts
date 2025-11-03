/**
 * Tests for HexConverter
 * Ported from BlueWizard's HexConverterTests.m
 */

import { describe, it, expect } from 'vitest';
import { nibblesToHex } from './hexConverter';

describe('HexConverter', () => {
  it('converts binary nibbles to hex', () => {
    // Test data from BlueWizard
    const binary = [
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

    // Expected values with TMS5220 nibble swapping applied
    const expected = [
      '0x09',
      '0xD4',
      '0x66',
      '0x66',
      '0x81',
      '0x05',
      '0x4B',
      '0xA5',
      '0xA0',
      '0x6A',
      '0x5D',
      '0xB5',
      '0xB6',
      '0x5E',
      '0xA6',
      '0x45',
      '0x17',
      '0xA8',
      '0x5E',
      '0x0C',
    ];

    const result = nibblesToHex(binary);
    const resultArray = result.split(',');

    expect(resultArray).toEqual(expected);
  });

  it('pads odd number of nibbles', () => {
    // Single nibble should be padded to form complete byte
    const binary = ['1010'];
    const result = nibblesToHex(binary);

    // Should produce valid hex
    expect(result).toMatch(/^0x[0-9A-F]{2}$/);
  });

  it('handles empty input', () => {
    const binary: string[] = [];
    const result = nibblesToHex(binary);

    expect(result).toBe('');
  });
});
