export const BASIC_SECTION_HEADER_HEIGHT = 96;
export const BASIC_SECTION_MIN_WIDTH = 600;
export const BASIC_SECTION_PADDING = 24;
export const BASIC_CARD_MIN_Y = 136;
export const BASIC_STRATEGY_CARD_WIDTH = 344;
export const BASIC_STRATEGY_CARD_FALLBACK_HEIGHT = 286;

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface CardMoveGesture {
  originX: number;
  originY: number;
  startX: number;
  startY: number;
}

export const getDefaultBasicCardPosition = (index: number): CanvasPoint => ({
  x: BASIC_SECTION_PADDING + (index % 3) * (BASIC_STRATEGY_CARD_WIDTH + 26),
  y: BASIC_CARD_MIN_Y + Math.floor(index / 3) * (BASIC_STRATEGY_CARD_FALLBACK_HEIGHT + 24),
});

export const getMovedBasicCardPosition = (
  move: CardMoveGesture,
  clientX: number,
  clientY: number,
  zoom: number,
): CanvasPoint => ({
  x: Math.max(BASIC_SECTION_PADDING, move.originX + (clientX - move.startX) / zoom),
  y: Math.max(BASIC_CARD_MIN_Y, move.originY + (clientY - move.startY) / zoom),
});

export const getStrategyCanvasWheelZoom = (
  zoom: number,
  pan: CanvasPoint,
  deltaY: number,
  cursorX: number,
  cursorY: number,
): { zoom: number; pan: CanvasPoint } | null => {
  const direction = deltaY < 0 ? 1 : -1;
  const nextZoom = Math.max(.5, Math.min(2, Number((zoom + direction * .1).toFixed(1))));
  if (nextZoom === zoom) return null;

  const worldX = (cursorX - pan.x) / zoom;
  const worldY = (cursorY - pan.y) / zoom;
  return {
    zoom: nextZoom,
    pan: {
      x: Number((cursorX - worldX * nextZoom).toFixed(2)),
      y: Number((cursorY - worldY * nextZoom).toFixed(2)),
    },
  };
};

export const getBasicSectionLayout = (
  cardIds: string[],
  getPosition: (cardId: string, index: number) => CanvasPoint,
  cardSizes: Record<string, CanvasSize | undefined>,
): CanvasSize => {
  const bounds = cardIds.reduce((current, cardId, index) => {
    const position = getPosition(cardId, index);
    const size = cardSizes[cardId] ?? {
      width: BASIC_STRATEGY_CARD_WIDTH,
      height: BASIC_STRATEGY_CARD_FALLBACK_HEIGHT,
    };
    return {
      right: Math.max(current.right, position.x + size.width),
      bottom: Math.max(current.bottom, position.y + size.height),
    };
  }, { right: 0, bottom: BASIC_SECTION_HEADER_HEIGHT });

  return {
    width: Math.max(BASIC_SECTION_MIN_WIDTH, Math.ceil(bounds.right + BASIC_SECTION_PADDING)),
    height: Math.max(
      BASIC_SECTION_HEADER_HEIGHT + 120,
      Math.ceil(bounds.bottom + BASIC_SECTION_PADDING),
    ),
  };
};
