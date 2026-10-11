export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function fitDistance(width, height, aspect, fov) {
  const tangent = Math.tan(fov * Math.PI / 360);
  return Math.max(height / (2 * tangent), width / (2 * tangent * aspect)) * 1.48 + .22;
}
export function shortestAngle(from, to) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
export function joystickVector(dx, dy, radius) {
  const length = Math.hypot(dx, dy), ratio = length > radius ? radius / length : 1;
  return { x: dx * ratio / radius, y: dy * ratio / radius };
}
export function canOpen(selected, clicked, moving, distance, yawError, pitch) {
  return selected === clicked && !moving && distance < .18 && Math.abs(yawError) < .06 && Math.abs(pitch) < .06;
}
