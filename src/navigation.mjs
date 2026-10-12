export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function mouseLook(yaw, pitch, dx, dy) {
  return {yaw: yaw - dx * .002, pitch: clamp(pitch - dy * .002, -Math.PI / 2 + .05, Math.PI / 2 - .05)};
}
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
export function canOpen(selected, clicked, moving, distance) {
  // The picking ray already confirms which artwork is under the interaction point.
  return selected === clicked && !moving && distance < .18;
}
