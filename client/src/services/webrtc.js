// WebRTC peer-connection config (M2).
//
// STUN servers let each browser discover its own public IP:port for NAT
// traversal. No media flows through them — they answer "what does the world
// see as your address?" so the two peers can find a direct path. For
// symmetric-NAT cases that STUN can't solve we'd add a TURN relay (M6).
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function createPeerConnection() {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}
