/**
 * @module rendering/staticWorld
 */

/** Snapshot level-static bounds once, retaining painter order at the leaves. */
export function buildStaticWorldIndex(platforms, coins) {
  const entries = [...platforms, ...coins]
    .map((object, order) => ({
      object,
      order,
      minX: object.x,
      maxX: object.x + object.width,
      minY: object.y,
      maxY: object.y + object.height
    }))
    .sort((a, b) => a.minX - b.minX || a.order - b.order);
  const build = (start, end) => {
    if (start === end) {
      return null;
    }
    if (end - start === 1) {
      return entries[start];
    }
    const mid = (start + end) >>> 1;
    const left = build(start, mid);
    const right = build(mid, end);
    return {
      left,
      right,
      minX: Math.min(left.minX, right.minX),
      maxX: Math.max(left.maxX, right.maxX),
      minY: Math.min(left.minY, right.minY),
      maxY: Math.max(left.maxY, right.maxY)
    };
  };
  return build(0, entries.length);
}

/**
 * Query in world space, including touching edges and a two-pixel stroke margin.
 * Collected coins retain their static leaf; Coin.draw owns collected visibility.
 */
export function visibleStaticObjects(index, camera) {
  const margin = 2;
  const candidates = [];
  const visit = node => {
    if (
      !node ||
      node.minX > camera.x + camera.width + margin ||
      node.maxX < camera.x - margin ||
      node.minY > camera.y + camera.height + margin ||
      node.maxY < camera.y - margin
    ) {
      return;
    }
    if (node.object) {
      candidates.push(node);
    } else {
      visit(node.left);
      visit(node.right);
    }
  };
  visit(index);
  return candidates
    .sort((a, b) => a.order - b.order)
    .map(entry => entry.object);
}
