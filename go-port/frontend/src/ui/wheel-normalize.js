const PIXELS_PER_NOTCH = 100;

const LINE_HEIGHT = 40;
const PAGE_HEIGHT = 800;

export function normalizeWheel(event) {
  let pixelX = event.deltaX;
  let pixelY = event.deltaY;

  if (event.deltaMode === 1 ) {
    pixelX *= LINE_HEIGHT;
    pixelY *= LINE_HEIGHT;
  } else if (event.deltaMode === 2 ) {
    pixelX *= PAGE_HEIGHT;
    pixelY *= PAGE_HEIGHT;
  }

  return {
    pixelX,
    pixelY,
    spinX: pixelX / PIXELS_PER_NOTCH,
    spinY: pixelY / PIXELS_PER_NOTCH,
  };
}
