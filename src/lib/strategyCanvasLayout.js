export const BASIC_SECTION_HEADER_HEIGHT = 96;
export const BASIC_SECTION_MIN_WIDTH = 600;
export const BASIC_SECTION_PADDING = 24;
export const BASIC_STRATEGY_CARD_WIDTH = 260;
export const BASIC_STRATEGY_CARD_FALLBACK_HEIGHT = 286;

export const getDefaultBasicCardPosition = (index) => ({
  x: BASIC_SECTION_PADDING + (index % 3) * (BASIC_STRATEGY_CARD_WIDTH + 26),
  y: 112 + Math.floor(index / 3) * (BASIC_STRATEGY_CARD_FALLBACK_HEIGHT + 24),
});

export const getMovedBasicCardPosition = (move, clientX, clientY, zoom) => ({
  x: Math.max(0, move.originX + (clientX - move.startX) / zoom),
  y: Math.max(BASIC_SECTION_HEADER_HEIGHT, move.originY + (clientY - move.startY) / zoom),
});

export const getStrategyCanvasWheelZoom = (zoom, pan, deltaY, cursorX, cursorY) => {
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

export const getBasicSectionLayout = (cardIds, getPosition, cardSizes) => {
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
