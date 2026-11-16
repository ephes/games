/**
 * @module rendering/staticWorld
 */

/** Snapshot level-static bounds once, retaining painter order at the leaves. */
export function buildStaticWorldIndex(platforms, coins) {
  const entries = [...platforms, ...coins]
    .map((object, order) => ({
      object,
      order,
      platforms: order < platforms.length ? 1 : 0,
      coins: order < platforms.length ? 0 : 1,
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
    const node = {
      left,
      right,
      platforms: left.platforms + right.platforms,
      coins: left.coins + right.coins,
      minX: Math.min(left.minX, right.minX),
      maxX: Math.max(left.maxX, right.maxX),
      minY: Math.min(left.minY, right.minY),
      maxY: Math.max(left.maxY, right.maxY)
    };
    left.parent = node;
    right.parent = node;
    return node;
  };
  const root = build(0, entries.length);
  if (root) {
    root.coinEntries = new WeakMap(
      entries.filter(entry => entry.coins).map(entry => [entry.object, entry])
    );
  }
  return root;
}

/**
 * Query in world space, including touching edges and a two-pixel stroke margin.
 * Collected coins retain their static leaf; Coin.draw owns collected visibility.
 */
export function visibleStaticObjects(index, camera) {
  const margin = 2;
  return queryStaticWorld(index, {
    minX: camera.x - margin,
    maxX: camera.x + camera.width + margin,
    minY: camera.y - margin,
    maxY: camera.y + camera.height + margin
  });
}

/** Query inclusive static bounds in original level order, optionally by kind. */
export function queryStaticWorld(index, bounds, kind) {
  const candidates = [];
  const visit = node => {
    if (
      !node ||
      (kind && !node[kind]) ||
      node.minX > bounds.maxX ||
      node.maxX < bounds.minX ||
      node.minY > bounds.maxY ||
      node.maxY < bounds.minY
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

/** Conservative rectangle covering both ends of a linear motion. */
export function sweptBounds(object, previous = object) {
  return {
    minX: Math.min(object.x, previous.x),
    maxX: Math.max(object.x, previous.x) + object.width,
    minY: Math.min(object.y, previous.y),
    maxY: Math.max(object.y, previous.y) + object.height
  };
}

/** Retire a collected coin in O(tree height), pruning future collision queries. */
export function retireStaticCoin(index, coin) {
  let node = index?.coinEntries.get(coin);
  if (!node?.coins) {
    return;
  }
  while (node) {
    node.coins--;
    node = node.parent;
  }
}
