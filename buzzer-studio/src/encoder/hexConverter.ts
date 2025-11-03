/**
 * Hex converter - converts nibbles to hex bytes
 * Based on BlueWizard's HexConverter, NibbleBitReverser, and NibbleSwitcher
 */

/**
 * Reverse bits within a 4-bit nibble
 * Example: 0010 (2) → 0100 (4)
 */
function reverseBitsInNibble(nibble: string): string {
  if (nibble.length !== 4) {
    throw new Error(`Expected 4-bit nibble, got ${nibble.length} bits`);
  }
  return nibble.split('').reverse().join('');
}

/**
 * Convert nibbles to hex string (comma-separated bytes)
 * Applies TMS5220 bit ordering transformations:
 * 1. Reverse bits within each nibble
 * 2. Switch high/low nibbles in each byte
 */
export function nibblesToHex(nibbles: string[]): string {
  if (nibbles.length === 0) return '';

  const hex: string[] = [];

  // Step 1: Reverse bits in each nibble and convert to hex digit
  for (const nibble of nibbles) {
    const reversed = reverseBitsInNibble(nibble);
    const value = parseInt(reversed, 2);
    hex.push(value.toString(16));
  }

  // Pad if odd number of nibbles
  if (hex.length % 2 === 1) {
    hex.push('0');
  }

  // Step 2: Group in pairs and SWITCH nibbles (swap high/low for TMS5220)
  const grouped: string[] = [];
  for (let i = 0; i <= hex.length - 2; i += 2) {
    // Switch: low nibble first, then high nibble (TMS5220 ordering)
    const byte = hex[i + 1] + hex[i];
    grouped.push('0x' + byte.toUpperCase());
  }

  return grouped.join(',');
}
