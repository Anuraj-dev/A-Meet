// Centralised ICE configuration, used by BOTH the live mediasoup SFU transports
// (useMediasoup) and the legacy peer-to-peer code (webrtc.js).
//
// Why this matters: a mediasoup client normally connects DIRECTLY to the SFU's
// UDP port range. On strict networks (corporate firewalls, some mobile/CGNAT)
// that direct path is blocked, so media silently never connects — the classic
// "I can see them in the list but there's no video/audio" across networks. With
// a TURN server in `iceServers`, the browser gathers relay candidates and ICE
// falls back to relaying through coturn when the direct path fails.

const turnDomain = import.meta.env.VITE_TURN_DOMAIN;
const turnUsername = import.meta.env.VITE_TURN_USERNAME;
const turnSecret = import.meta.env.VITE_TURN_SECRET;
const turnTransport = import.meta.env.VITE_TURN_TRANSPORT;

const hasTurn = Boolean(turnDomain && turnSecret);

const configuredTurnServers = [
      // UDP relay (lowest latency) ...
      { transport: 'udp', server: { urls: `turn:${turnDomain}:3478?transport=udp`, username: turnUsername, credential: turnSecret } },
      // ... TCP relay for when UDP is blocked ...
      { transport: 'tcp', server: { urls: `turn:${turnDomain}:3478?transport=tcp`, username: turnUsername, credential: turnSecret } },
      // ... and TLS relay on 5349 for networks that only allow outbound 443/TLS.
      { transport: 'tls', server: { urls: `turns:${turnDomain}:5349?transport=tcp`, username: turnUsername, credential: turnSecret } },
    ];

const turnServers: RTCIceServer[] = hasTurn
  ? configuredTurnServers
      .filter(({ transport }) => !turnTransport || transport === turnTransport)
      .map(({ server }) => server)
  : [];

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  ...turnServers,
];

// Debug switch: set VITE_FORCE_RELAY=1 (and configure TURN) to force ALL media
// through the relay. Proves the coturn path works end-to-end during testing.
// Ignored unless TURN is actually configured, so it can't accidentally break a
// dev build with no relay candidates.
// Set VITE_TURN_TRANSPORT to udp, tcp, or tls only while verifying one relay
// path at a time; omit it in normal builds to advertise every transport.
export const ICE_TRANSPORT_POLICY: RTCIceTransportPolicy =
  hasTurn && import.meta.env.VITE_FORCE_RELAY === '1' ? 'relay' : 'all';
