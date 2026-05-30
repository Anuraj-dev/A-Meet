const turnDomain = import.meta.env.VITE_TURN_DOMAIN;
const turnUsername = import.meta.env.VITE_TURN_USERNAME;
const turnSecret = import.meta.env.VITE_TURN_SECRET;

const turnServer = turnDomain && turnSecret
  ? [{ urls: `turn:${turnDomain}:3478`, username: turnUsername, credential: turnSecret }]
  : [];

export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  ...turnServer,
];

export function createPeerConnection() {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}
