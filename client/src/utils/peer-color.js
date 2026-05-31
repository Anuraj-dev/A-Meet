// Deterministic per-participant color for camera-off tiles (Meet-style
// full-bleed colored background). Saturated, legible against white text.
// Shared by VideoTile and the Picture-in-Picture canvas so a person keeps the
// same color in the main grid and the mini player.
export const PEER_COLORS = [
  '#1a73e8', '#1e8e3e', '#d93025', '#e37400',
  '#9334e6', '#d01884', '#129eaf', '#c5221f',
];

export function getPeerColor(name) {
  if (!name) return PEER_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PEER_COLORS[h % PEER_COLORS.length];
}
