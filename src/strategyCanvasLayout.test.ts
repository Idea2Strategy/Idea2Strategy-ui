import { describe, expect, test } from 'vitest';
import {
  BASIC_CARD_MIN_Y,
  BASIC_SECTION_PADDING,
  resolveBasicCardCollision,
} from './lib/strategyCanvasLayout';

describe('Basic strategy card placement', () => {
  test('keeps cards below partition controls and inside the left boundary', () => {
    expect(resolveBasicCardCollision(
      { x: -30, y: 0 },
      { width: 280, height: 260 },
      [],
    )).toEqual({ x: BASIC_SECTION_PADDING, y: BASIC_CARD_MIN_Y });
  });

  test('moves a dropped card to the nearest free position instead of overlapping', () => {
    const resolved = resolveBasicCardCollision(
      { x: 24, y: BASIC_CARD_MIN_Y },
      { width: 280, height: 260 },
      [{
        position: { x: 24, y: BASIC_CARD_MIN_Y },
        size: { width: 280, height: 260 },
      }],
    );

    expect(resolved).toEqual({ x: 320, y: BASIC_CARD_MIN_Y });
  });
});
