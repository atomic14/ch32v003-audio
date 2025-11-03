/**
 * Finds the closest value in a quantization table
 * Used for encoding continuous values into discrete table indices
 */
export function findClosestValue(actual: number, table: number[]): number {
  if (actual <= table[0]) return 0;

  let minDiff = Infinity;
  let minIndex = 0;

  for (let i = 0; i < table.length; i++) {
    const diff = Math.abs(table[i] - actual);
    if (diff < minDiff) {
      minDiff = diff;
      minIndex = i;
    }
  }

  return minIndex;
}
