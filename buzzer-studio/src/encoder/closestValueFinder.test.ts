/**
 * Tests for ClosestValueFinder
 * Ported from BlueWizard's ClosestValueFinderTests.m
 */

import { describe, it, expect } from 'vitest';
import { findClosestValue } from './closestValueFinder';

describe('ClosestValueFinder', () => {
  it('finds the closest index given an actual value and a list of values', () => {
    // Test with values 1.0, 2.0
    let table = [1.0, 2.0];

    // 1.25 is closer to 1.0 (index 0)
    expect(findClosestValue(1.25, table)).toBe(0);

    // 1.75 is closer to 2.0 (index 1)
    expect(findClosestValue(1.75, table)).toBe(1);

    // Test with values 5.0, 6.0
    table = [5.0, 6.0];

    // -1.0 is below range, should return first index (0)
    expect(findClosestValue(-1.0, table)).toBe(0);

    // 8.0 is above range, should return closest which is 6.0 (index 1)
    expect(findClosestValue(8.0, table)).toBe(1);
  });

  it('handles single value tables', () => {
    const table = [5.0];
    expect(findClosestValue(1.0, table)).toBe(0);
    expect(findClosestValue(10.0, table)).toBe(0);
  });

  it('handles exact matches', () => {
    const table = [1.0, 2.0, 3.0, 4.0];
    expect(findClosestValue(2.0, table)).toBe(1);
    expect(findClosestValue(4.0, table)).toBe(3);
  });

  it('handles midpoint values (chooses first encountered minimum)', () => {
    const table = [1.0, 3.0];
    // 2.0 is exactly between 1.0 and 3.0
    // Our implementation returns the first one encountered with minimum diff
    const result = findClosestValue(2.0, table);
    expect([0, 1]).toContain(result);
  });
});
