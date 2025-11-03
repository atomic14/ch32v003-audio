/**
 * Binary encoder - converts frame parameters to bitstream
 * Based on BlueWizard's FrameDataBinaryEncoder
 */

import { CodingTable } from '../tmsTables';
import { BitHelpers } from './bitHelpers';

/**
 * Encode frame parameters to binary nibbles
 */
export function encodeFramesToBinary(
  codingTable: CodingTable,
  parametersList: Record<string, number>[]
): string[] {
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

  return nibblesFromBinary(binary);
}

/**
 * Convert binary string to array of 4-bit nibbles
 */
function nibblesFromBinary(binary: string): string[] {
  const nibbles: string[] = [];
  // Pad to a full nibble so nothing is silently dropped
  const rem = binary.length % 4;
  if (rem !== 0) binary = binary.padEnd(binary.length + (4 - rem), '0');

  for (let i = 0; i < binary.length; i += 4) {
    nibbles.push(binary.slice(i, i + 4));
  }
  return nibbles;
}
