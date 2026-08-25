import { describe, expect, test } from 'vitest';
import corpus from './test/contracts/basic-element-conformance.v1.json';
import { BASIC_EXECUTABLE_ELEMENT_CODES } from './lib/basicStrategyDocument';

describe('Basic strategy shared conformance contract', () => {
  test('publishes exactly the executable elements exposed by the Basic UI', () => {
    expect(corpus.schemaVersion).toBe('basic-element-conformance/v1');
    expect(corpus.catalogVersion).toBe('basic-elements:2026-08-25');
    expect(corpus.cases.map(({ elementCode }) => elementCode)).toEqual(BASIC_EXECUTABLE_ELEMENT_CODES);
  });

  test('keeps literal valid, invalid, runtime and review examples for every UI element', () => {
    for (const testCase of corpus.cases) {
      expect(testCase.containers.length, testCase.elementCode).toBeGreaterThan(0);
      expect(testCase.validParameters, testCase.elementCode).toBeTypeOf('object');
      expect(testCase.invalidParameters.length, testCase.elementCode).toBeGreaterThan(0);
      expect(testCase.operation, testCase.elementCode).not.toBe('');
      expect(testCase.trueInputs, testCase.elementCode).toBeTypeOf('object');
      expect(testCase.falseInputs, testCase.elementCode).toBeTypeOf('object');
      expect(testCase.expectedReviewKo, testCase.elementCode).not.toBe('');
    }
  });
});
