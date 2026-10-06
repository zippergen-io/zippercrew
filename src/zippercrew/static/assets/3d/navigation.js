/* Pure floor navigation. Rectangles and interaction transforms share the GLB
 * authoring layout. No workflow state, physics engine or invented lifeline events. */
import { LAYOUT } from "./layout.js";
export { LAYOUT };
export function local(station, x, z) {
  const c = Math.cos(station.yaw),
    s = Math.sin(station.yaw);
  return [station.seat[0] + x * c + z * s, station.seat[1] - x * s + z * c];
}
function coordinates(p, box) {
  const x = p[0] - box.center[0],
    z = p[1] - box.center[1],
    c = Math.cos(box.yaw),
    s = Math.sin(box.yaw);
  return [x * c - z * s, x * s + z * c];
}
export function contains(p, box, radius = LAYOUT.radius) {
  const q = coordinates(p, box);
  return (
    Math.abs(q[0]) < box.half[0] + radius &&
    Math.abs(q[1]) < box.half[1] + radius
  );
}
export function furniture(offsets = {}) {
  const out = LAYOUT.fixed.map((o) => ({ ...o }));
  for (const [role, station] of Object.entries(LAYOUT.stations)) {
    out.push({
      id: role + "-chair",
      center: local(station, 0, station.fixedSeat ? 0 : offsets[role] || 0),
      half: station.chairHalf || [0.63, 0.79],
      yaw: station.yaw,
    });
    out.push(
      role === "Human"
        ? {
            id: "table",
            center: local(station, station.tableX || 0, -LAYOUT.tableOffset),
            half: [0.96, 0.96],
            yaw: station.yaw,
          }
        : {
            id: role + "-desk",
            center: local(station, 0, -1.6),
            half: [1.4, 1.0],
            yaw: station.yaw,
          },
    );
  }
  return out;
}
export function clearSegment(a, b, obstacles, radius = LAYOUT.radius) {
  const [x0, z0, x1, z1] = LAYOUT.bounds;
  if (
    [a, b].some(
      (p) =>
        p[0] < x0 + radius ||
        p[0] > x1 - radius ||
        p[1] < z0 + radius ||
        p[1] > z1 - radius,
    )
  )
    return false;
  for (const box of obstacles) {
    const p = coordinates(a, box),
      q = coordinates(b, box);
    let low = 0,
      high = 1;
    for (let k = 0; k < 2; k++) {
      const extent = box.half[k] + radius,
        d = q[k] - p[k];
      if (Math.abs(d) < 1e-9) {
        if (Math.abs(p[k]) >= extent) {
          low = 2;
          break;
        }
      } else {
        const v1 = (-extent - p[k]) / d,
          v2 = (extent - p[k]) / d;
        low = Math.max(low, Math.min(v1, v2));
        high = Math.min(high, Math.max(v1, v2));
      }
    }
    if (low <= high && low <= 1 && high >= 0) return false;
  }
  return true;
}
export function route(start, end, obstacles = furniture()) {
  if (
    !clearSegment(start, start, obstacles) ||
    !clearSegment(end, end, obstacles)
  )
    return null;
  if (clearSegment(start, end, obstacles)) return [end];
  const nodes = [start, end];
  for (const box of obstacles)
    for (const x of [-1, 1])
      for (const z of [-1, 1]) {
        const p = local(
          { seat: box.center, yaw: box.yaw },
          x * (box.half[0] + LAYOUT.radius + 0.025),
          z * (box.half[1] + LAYOUT.radius + 0.025),
        );
        if (clearSegment(p, p, obstacles)) nodes.push(p);
      }
  const distance = nodes.map(() => Infinity),
    previous = nodes.map(() => -1),
    done = new Set();
  distance[0] = 0;
  while (done.size < nodes.length) {
    let at = -1;
    for (let i = 0; i < nodes.length; i++)
      if (!done.has(i) && (at < 0 || distance[i] < distance[at])) at = i;
    if (at < 0 || !Number.isFinite(distance[at])) return null;
    if (at === 1) {
      const path = [];
      for (let i = 1; i !== 0; i = previous[i]) path.unshift(nodes[i]);
      return path;
    }
    done.add(at);
    for (let i = 0; i < nodes.length; i++)
      if (!done.has(i) && clearSegment(nodes[at], nodes[i], obstacles)) {
        const d =
          distance[at] +
          Math.hypot(nodes[at][0] - nodes[i][0], nodes[at][1] - nodes[i][1]);
        if (d < distance[i]) {
          distance[i] = d;
          previous[i] = at;
        }
      }
  }
  return null;
}
