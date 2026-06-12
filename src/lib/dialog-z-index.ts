let zIndexCounter = 50;

export function getNextZIndex(): number {
  zIndexCounter += 1;
  return zIndexCounter;
}
