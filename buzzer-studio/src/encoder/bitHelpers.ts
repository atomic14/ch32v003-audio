/**
 * Binary conversion utilities for LPC encoding
 */
export class BitHelpers {
  /**
   * Convert a value to binary string with specified bit width
   * Clamps value to prevent overflow
   */
  static valueToBinary(value: number, bits: number): string {
    // Clamp to field width to prevent overflow into subsequent fields
    const mask = bits >= 31 ? 0x7fffffff : (1 << bits) - 1;
    const v = (value & mask) >>> 0;
    return v.toString(2).padStart(bits, '0');
  }

  /**
   * Convert binary string to numeric value
   */
  static valueForBinary(binary: string): number {
    return parseInt(binary, 2);
  }
}
