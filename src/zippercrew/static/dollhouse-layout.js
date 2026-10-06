// Presentation geometry only. Bays grow; people never shrink with crew count.
export const ROLE_DEFINITIONS = [{
  name: 'Implementer',
  key: 'implementer',
  color: 0xeb7954,
  access: 'Write access',
  description: 'Makes the change, tests it, and responds to the review.'
}, {
  name: 'Reviewer',
  key: 'reviewer',
  color: 0x35a8b0,
  access: 'Read-only access',
  description: 'Inspects the repository and challenges the proposal.'
}, {
  name: 'Human',
  key: 'human',
  color: 0xa37ab5,
  access: 'Process decisions',
  description: 'Listens to the crew and sets the direction.'
}, ];
// Each annex uses the approved Linked Studio stage at the same authored size.
export const STUDIO_WIDTH = 1836;
export const STUDIO_HEIGHT = 800;
export const FOREGROUND_POLYGONS = [
  [[671,618],[690,605],[717,595],[1132,595],[1164,614],[1164,640],
   [1143,649],[1143,689],[1113,689],[1113,650],[732,650],[732,688],
   [708,688],[708,650],[674,643]],
  [[699,580],[716,578],[718,560],[730,557],[735,562],[730,579],[736,583],[736,618],[701,622]],
  [[755,555],[766,549],[846,553],[854,559],[865,600],[893,608],[896,615],[874,625],[767,624]],
];
export function buildLayout(roles = ROLE_DEFINITIONS) {
  const ordered = [...roles.filter(r => r.name === 'Human'), ...roles.filter(r => r.name !== 'Human')];
  const rooms = Math.max(1, Math.ceil(ordered.length / 3));
  const stations = new Map(), obstacles = [], destinations = {};
  const anchors = [510, 932, 1395];
  ordered.forEach((r, i) => {
    const room = Math.floor(i / 3), offset = room * STUDIO_WIDTH;
    const x = anchors[i % 3] + offset;
    stations.set(r.name, {
      seat: [x, 665], rest: [x, 665], approach: [x + 35, 653],
      kind: i % 3 === 1 ? 'desk' : 'standing', room,
      destinations: {
        coffee: [offset + 352, 668], window: [offset + 400, 649],
        board: [offset + 1200, 650], pace: [x + (i % 3 === 2 ? -80 : 80), 652],
      },
    });
  });
  for (let room = 0; room < rooms; room++) {
    const x = room * STUDIO_WIDTH;
    // Low footprint at the base of the table leaves a continuous back aisle.
    // Actors behind the tabletop are occluded by the separate foreground.
    obstacles.push({ id: `desk-${room}`, x: x + 670, y: 684, w: 495, h: 15 });
    obstacles.push({ id: `stool-${room}`, x: x + 94, y: 657, w: 117, h: 32 });
    for (const [name, point] of Object.entries({ coffee:[352,668], window:[400,649], board:[1200,650] }))
      destinations[room ? `${name}-${room}` : name] = [point[0] + x, point[1]];
  }
  return { width: rooms * STUDIO_WIDTH, height: STUDIO_HEIGHT, rooms, stations, obstacles,
    bounds: { left: 235, right: rooms * STUDIO_WIDTH - 30, top: 645, bottom: 710 },
    destinations, brief: [922, 307], bayWidth: STUDIO_WIDTH };
}
export function blocked(point, obstacles, radius = 13) {
  return obstacles.some(o => point[0] > o.x - radius && point[0] < o.x + o.w + radius &&
    point[1] > o.y - radius && point[1] < o.y + o.h + radius);
}
export function clearSegment(a, b, obstacles, radius = 13) {
  // Slab intersection against inflated footprints; continuous, no tunnelling.
  return obstacles.every(o => {
    let low = 0,
      high = 1;
    for (const [axis, min, max] of [
        [0, o.x - radius, o.x + o.w + radius],
        [1, o.y - radius, o.y + o.h + radius]
      ]) {
      const delta = b[axis] - a[axis];
      if (Math.abs(delta) < 1e-8) {
        if (a[axis] <= min || a[axis] >= max) return true;
      } else {
        const t1 = (min - a[axis]) / delta,
          t2 = (max - a[axis]) / delta;
        low = Math.max(low, Math.min(t1, t2));
        high = Math.min(high, Math.max(t1, t2));
      }
      if (low >= high) return true;
    }
    return false;
  });
}
export function route(a, b, layout) {
  const {
    obstacles,
    bounds
  } = layout;
  const valid = p => p[0] >= bounds.left && p[0] <= bounds.right && p[1] >= bounds.top &&
    p[1] <= bounds.bottom && !blocked(p, obstacles);
  if (!valid(a) || !valid(b)) return null;
  if (clearSegment(a, b, obstacles)) return [
    [...b]
  ];
  const nodes = [a, b];
  for (const o of obstacles)
    for (const x of [o.x - 15, o.x + o.w + 15])
      for (const y of [o.y - 15, o.y + o.h + 15])
        if (valid([x, y])) nodes.push([x, y]);
  const distance = nodes.map(() => Infinity),
    previous = [],
    pending = new Set(nodes.map((_, i) => i));
  distance[0] = 0;
  while (pending.size) {
    const u = [...pending].reduce((best, i) => distance[i] < distance[best] ? i : best);
    if (!Number.isFinite(distance[u])) break;
    pending.delete(u);
    if (u === 1) break;
    for (const v of pending)
      if (clearSegment(nodes[u], nodes[v], obstacles)) {
        const candidate = distance[u] + Math.hypot(nodes[v][0] - nodes[u][0], nodes[v][1] - nodes[u][1]);
        if (candidate < distance[v]) {
          distance[v] = candidate;
          previous[v] = u;
        }
      }
  }
  if (!Number.isFinite(distance[1])) return null;
  const path = [];
  for (let i = 1; i !== 0; i = previous[i]) path.unshift([...nodes[i]]);
  return path;
}
