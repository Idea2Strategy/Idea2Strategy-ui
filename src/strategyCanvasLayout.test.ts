import { describe, expect, test } from 'vitest';
import {
  BASIC_CARD_MIN_Y,
  BASIC_SECTION_PADDING,
  getMovedBasicCardPosition,
} from './lib/strategyCanvasLayout';

describe('Basic strategy card placement', () => {
  test('keeps cards below partition controls and inside the left boundary', () => {
    expect(getMovedBasicCardPosition(
      { originX: 24, originY: BASIC_CARD_MIN_Y, startX: 300, startY: 300 },
      0,
      0,
      1,
    )).toEqual({ x: BASIC_SECTION_PADDING, y: BASIC_CARD_MIN_Y });
  });

  test('keeps the requested position without collision avoidance', () => {
    expect(getMovedBasicCardPosition(
      { originX: 384, originY: BASIC_CARD_MIN_Y, startX: 384, startY: BASIC_CARD_MIN_Y },
      24,
      BASIC_CARD_MIN_Y,
      1,
    )).toEqual({ x: 24, y: BASIC_CARD_MIN_Y });
  });
});
