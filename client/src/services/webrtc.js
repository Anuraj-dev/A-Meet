// ICE config now lives in one place (services/ice-config.js) so the SFU and
// this legacy P2P helper can't drift apart.
import { ICE_SERVERS } from './ice-config';

export { ICE_SERVERS };

export function createPeerConnection() {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}
