// SFU signaling handlers (M4). The browser drives a fixed sequence; each step
// is a Socket.io event with an ack callback (request/response), so the client
// can `await` every round-trip. We never touch media bytes — mediasoup does —
// we only create/connect transports and wire producers to consumers.
//
// Error convention: every ack returns either the result or `{ error: msg }`;
// the client's request() helper rejects on `error`.

import { webRtcTransportOptions } from '../sfu/config.js';
import {
  getOrCreateRoom, getRoom, addPeer, getPeer,
  listOtherProducers, removePeer, closeRoomIfEmpty,
} from '../sfu/sfu-rooms.js';
import { Room } from '../models/Room.js';
import { isRoomAdmin } from '../rooms/room-admin.js';
import { logger } from '../config/logger.js';

// socketId → roomId, established on get-rtp-capabilities. SFU-scoped (independent
// of M1's room-manager) and set before any transport work, so it never races
// the chat effect's join-room.
const socketRoom = new Map();

export function registerSfuHandlers(io, socket) {
  // 1) Entry point: lazily create the room's Router, register this peer, and
  //    return the Router's rtpCapabilities so the client can load its Device.
  //    Also lazily creates the AudioLevelObserver on first peer join.
  socket.on('sfu-get-rtp-capabilities', async ({ roomId } = {}, callback) => {
    try {
      if (!roomId || typeof roomId !== 'string') throw new Error('roomId required');
      const room = await getOrCreateRoom(roomId);
      addPeer(roomId, socket.id, socket.user);
      socketRoom.set(socket.id, roomId);
      socket.join(roomId); // idempotent with chat's join; makes SFU self-sufficient
      logger.info({ event: 'peer.joined', roomId, socketId: socket.id, userId: socket.user?.id }, 'peer joined SFU room');

      // Set up AudioLevelObserver once per room (fires max 1 volume entry = loudest speaker).
      if (!room.audioLevelObserver) {
        room.audioLevelObserver = await room.router.createAudioLevelObserver({
          maxEntries: 1,
          threshold: -70,
          interval: 800,
        });
        room.audioProducerToSocket = new Map(); // producerId → socketId
        room.audioLevelObserver.on('volumes', (volumes) => {
          const sid = room.audioProducerToSocket.get(volumes[0].producer.id);
          if (sid) io.to(roomId).emit('sfu-active-speaker', { socketId: sid });
        });
        room.audioLevelObserver.on('silence', () => {
          io.to(roomId).emit('sfu-active-speaker', { socketId: null });
        });
      }

      callback({ rtpCapabilities: room.router.rtpCapabilities });
    } catch (err) {
      logger.warn({ event: 'peer.joinFailed', socketId: socket.id, err: err.message }, 'peer join failed');
      callback({ error: err.message });
    }
  });

  // 2) Create a send or recv WebRtcTransport for this peer. We return only the
  //    client-needed bits; the server keeps the Transport object.
  socket.on('sfu-create-transport', async ({ direction } = {}, callback) => {
    try {
      const roomId = socketRoom.get(socket.id);
      const room = getRoom(roomId);
      const peer = getPeer(roomId, socket.id);
      if (!room || !peer) throw new Error('not in room');
      if (direction !== 'send' && direction !== 'recv') throw new Error('bad direction');

      const transport = await room.router.createWebRtcTransport({
        ...webRtcTransportOptions,
        appData: { direction },
      });
      peer.transports.set(transport.id, transport);

      // Diagnostics: the selected ICE tuple reveals the negotiated media path
      // (direct UDP / TCP / relay) — the key signal when peers can't see or hear
      // each other across networks. We also surface ICE/DTLS failures.
      logger.debug(
        { event: 'transport.created', direction, transportId: transport.id, socketId: socket.id },
        'WebRTC transport created',
      );

      transport.on('iceselectedtuplechange', (tuple) => {
        logger.info({
          event: 'ice.tupleSelected',
          direction,
          socketId: socket.id,
          protocol: tuple?.protocol,
          remoteIp: tuple?.remoteIp,
          remotePort: tuple?.remotePort,
        }, 'ICE tuple selected');
      });
      transport.on('icestatechange', (iceState) => {
        const level = (iceState === 'disconnected' || iceState === 'failed') ? 'warn' : 'debug';
        logger[level]({ event: 'ice.stateChange', direction, socketId: socket.id, iceState }, `ICE ${iceState}`);
      });
      transport.on('dtlsstatechange', (dtlsState) => {
        // 'closed' is normal teardown on disconnect — only 'failed' is a real problem
        const level = dtlsState === 'failed' ? 'warn' : 'debug';
        logger[level]({ event: 'dtls.stateChange', direction, socketId: socket.id, dtlsState }, `DTLS ${dtlsState}`);
      });

      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (err) {
      logger.warn({ event: 'transport.createFailed', socketId: socket.id, err: err.message }, 'transport create failed');
      callback({ error: err.message });
    }
  });

  // 3) Complete the DTLS handshake using the client's dtlsParameters. Fires
  //    once per transport, the first time it's used.
  socket.on('sfu-connect-transport', async ({ transportId, dtlsParameters } = {}, callback) => {
    try {
      const peer = getPeer(socketRoom.get(socket.id), socket.id);
      const transport = peer?.transports.get(transportId);
      if (!transport) throw new Error('transport not found');
      await transport.connect({ dtlsParameters });
      callback({ connected: true });
    } catch (err) {
      callback({ error: err.message });
    }
  });

  // 4) The client produces a local track on its send transport. We create the
  //    server-side Producer, then tell everyone else to consume it.
  socket.on('sfu-produce', async ({ transportId, kind, rtpParameters, appData } = {}, callback) => {
    try {
      const roomId = socketRoom.get(socket.id);
      const room = getRoom(roomId);
      const peer = getPeer(roomId, socket.id);
      const transport = peer?.transports.get(transportId);
      if (!transport) throw new Error('send transport not found');

      const producer = await transport.produce({ kind, rtpParameters, appData });
      peer.producers.set(producer.id, producer);
      producer.on('transportclose', () => peer.producers.delete(producer.id));
      logger.info(
        { event: 'producer.created', kind, producerId: producer.id, source: appData?.source, socketId: socket.id, roomId },
        `${kind} producer created`,
      );

      // Register audio producers with the level observer (screen-share audio excluded).
      if (kind === 'audio' && appData?.source !== 'screen' && room?.audioLevelObserver) {
        room.audioProducerToSocket.set(producer.id, socket.id);
        producer.on('close', () => room.audioProducerToSocket?.delete(producer.id));
        try { await room.audioLevelObserver.addProducer({ producerId: producer.id }); } catch { /* ok */ }
      }

      socket.to(roomId).emit('sfu-new-producer', {
        producerId: producer.id,
        socketId: socket.id,
        user: socket.user,
        kind: producer.kind,
        paused: producer.paused,
        appData: producer.appData,
      });

      callback({ id: producer.id });
    } catch (err) {
      callback({ error: err.message });
    }
  });

  // 5) The client consumes someone else's producer on its recv transport.
  //    Created PAUSED — the client resumes (step 6) once the track is wired up,
  //    so the first keyframe isn't lost into a not-yet-ready element.
  socket.on('sfu-consume', async ({ transportId, producerId, rtpCapabilities } = {}, callback) => {
    try {
      const roomId = socketRoom.get(socket.id);
      const room = getRoom(roomId);
      const peer = getPeer(roomId, socket.id);
      if (!room || !peer) throw new Error('not in room');
      if (!room.router.canConsume({ producerId, rtpCapabilities })) {
        throw new Error('cannot consume this producer');
      }
      const transport = peer.transports.get(transportId);
      if (!transport) throw new Error('recv transport not found');

      const consumer = await transport.consume({ producerId, rtpCapabilities, paused: true });
      peer.consumers.set(consumer.id, consumer);

      // Protect voice under congestion: when this recv transport's downlink
      // can't satisfy every consumer, mediasoup distributes the available
      // bitrate by priority (higher first). Audio gets the top slice so its
      // ~40 kbps is reserved before video; paired with camera simulcast, the
      // SFU then sheds video layers instead of dropping audio packets.
      if (consumer.kind === 'audio') {
        try { await consumer.setPriority(255); } catch { /* non-fatal */ }
      }

      consumer.on('transportclose', () => peer.consumers.delete(consumer.id));
      consumer.on('producerclose', () => {
        peer.consumers.delete(consumer.id);
        socket.emit('sfu-consumer-closed', { consumerId: consumer.id });
      });

      callback({
        id: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        producerPaused: consumer.producerPaused,
      });
    } catch (err) {
      callback({ error: err.message });
    }
  });

  // 6) Resume a consumer once the client has attached its track.
  socket.on('sfu-resume-consumer', async ({ consumerId } = {}, callback) => {
    try {
      const peer = getPeer(socketRoom.get(socket.id), socket.id);
      const consumer = peer?.consumers.get(consumerId);
      if (!consumer) throw new Error('consumer not found');
      await consumer.resume();
      callback({ resumed: true });
    } catch (err) {
      callback({ error: err.message });
    }
  });

  // 7) A newcomer asks for producers already present so it can consume them.
  socket.on('sfu-get-producers', (_payload, callback) => {
    callback(listOtherProducers(socketRoom.get(socket.id), socket.id));
  });

  // 8) Mic-mute / camera-off = pause the producer (track stays, RTP stops).
  //    We broadcast so others can show a muted/placeholder tile.
  socket.on('sfu-pause-producer', async ({ producerId } = {}, callback) => {
    try {
      const roomId = socketRoom.get(socket.id);
      const producer = getPeer(roomId, socket.id)?.producers.get(producerId);
      if (!producer) throw new Error('producer not found');
      await producer.pause();
      socket.to(roomId).emit('sfu-producer-paused', { producerId, socketId: socket.id });
      logger.debug({ event: 'producer.paused', producerId, kind: producer.kind, socketId: socket.id }, 'producer paused');
      callback?.({ paused: true });
    } catch (err) {
      callback?.({ error: err.message });
    }
  });

  socket.on('sfu-resume-producer', async ({ producerId } = {}, callback) => {
    try {
      const roomId = socketRoom.get(socket.id);
      const producer = getPeer(roomId, socket.id)?.producers.get(producerId);
      if (!producer) throw new Error('producer not found');
      await producer.resume();
      socket.to(roomId).emit('sfu-producer-resumed', { producerId, socketId: socket.id });
      logger.debug({ event: 'producer.resumed', producerId, kind: producer.kind, socketId: socket.id }, 'producer resumed');
      callback?.({ resumed: true });
    } catch (err) {
      callback?.({ error: err.message });
    }
  });

  // 9) Close a producer outright (used for screen-share stop). Closing the
  //    server-side Producer cascades `producerclose` to every consumer →
  //    each client receives `sfu-consumer-closed` and drops the tile.
  socket.on('sfu-close-producer', async ({ producerId } = {}, callback) => {
    try {
      const roomId = socketRoom.get(socket.id);
      const peer = getPeer(roomId, socket.id);
      const producer = peer?.producers.get(producerId);
      if (!producer) throw new Error('producer not found');
      producer.close();
      peer.producers.delete(producerId);
      callback?.({ closed: true });
    } catch (err) {
      callback?.({ error: err.message });
    }
  });

  // 10) Raise hand: toggle for this peer; broadcast state to the room.
  socket.on('sfu-raise-hand', ({ raised } = {}, callback) => {
    const roomId = socketRoom.get(socket.id);
    const peer = getPeer(roomId, socket.id);
    if (!peer) return;
    peer.handRaised = !!raised;
    socket.to(roomId).emit('sfu-hand-raise-update', { socketId: socket.id, raised: peer.handRaised });
    callback?.({ ok: true });
  });

  // 11) Emoji reaction: ephemeral relay only, no persistence. Use io.in so the
  //     sender also receives the event (for local feedback).
  socket.on('sfu-reaction', ({ emoji } = {}) => {
    const roomId = socketRoom.get(socket.id);
    if (!roomId || typeof emoji !== 'string') return;
    io.in(roomId).emit('sfu-reaction', { emoji, socketId: socket.id });
  });

  // 13) Host ends the meeting for everyone: verify the caller is the room host,
  //     notify all peers, then mark the Room inactive in the DB.
  socket.on('sfu-end-meeting', async () => {
    const roomId = socketRoom.get(socket.id);
    if (!roomId) return;
    try {
      const room = await Room.findOne({ roomId });
      if (!isRoomAdmin(room, socket.user?.id)) return;
      io.to(roomId).emit('sfu-meeting-ended');
      await Room.updateOne({ roomId }, { $set: { active: false } });
    } catch { /* ignore */ }
  });

  // --- Host moderation (M12) -------------------------------------------------
  // All actions are gated on the caller being the room's DB host (same check as
  // `sfu-end-meeting`). Mute is ENFORCED: the server pauses the target's audio
  // producer, so it works even if the target ignores it. Unmute is never forced
  // — muting keeps the mic track live, so server-resuming it would re-open a
  // live mic without consent; instead the host can only *request* an unmute,
  // which the target accepts with one tap (Google-Meet behaviour).

  // Resolve+verify the caller as host once per action (small DB read).
  async function callerIsHost() {
    const roomId = socketRoom.get(socket.id);
    if (!roomId) return null;
    try {
      const room = await Room.findOne({ roomId });
      if (!isRoomAdmin(room, socket.user?.id)) return null;
      return roomId;
    } catch { return null; }
  }

  // The peer's primary (camera/mic) audio producer — screen-share audio excluded.
  function micProducer(roomId, targetSocketId) {
    const peer = getPeer(roomId, targetSocketId);
    if (!peer) return null;
    for (const producer of peer.producers.values()) {
      if (producer.kind === 'audio' && producer.appData?.source !== 'screen') return producer;
    }
    return null;
  }

  async function pauseMic(roomId, targetSocketId) {
    const producer = micProducer(roomId, targetSocketId);
    if (!producer || producer.paused) return false;
    await producer.pause();
    // Reuse the existing mute broadcast so every peer's tile shows muted…
    io.to(roomId).emit('sfu-producer-paused', { producerId: producer.id, socketId: targetSocketId });
    // …and tell the target to sync its own local mic UI to off.
    io.to(targetSocketId).emit('sfu-force-muted');
    return true;
  }

  // 14) Host mutes one participant (enforced).
  socket.on('sfu-host-mute', async ({ socketId: targetSocketId } = {}) => {
    const roomId = await callerIsHost();
    if (!roomId || !targetSocketId || targetSocketId === socket.id) return;
    try {
      const muted = await pauseMic(roomId, targetSocketId);
      if (muted) logger.info({ event: 'host.mute', roomId, by: socket.id, target: targetSocketId }, 'host muted peer');
    } catch (err) { logger.warn({ event: 'host.muteFailed', err: err.message }); }
  });

  // 15) Host mutes everyone but themselves (enforced).
  socket.on('sfu-mute-all', async () => {
    const roomId = await callerIsHost();
    if (!roomId) return;
    const room = getRoom(roomId);
    if (!room) return;
    for (const targetSocketId of room.peers.keys()) {
      if (targetSocketId === socket.id) continue;
      try { await pauseMic(roomId, targetSocketId); } catch { /* skip */ }
    }
    logger.info({ event: 'host.muteAll', roomId, by: socket.id }, 'host muted all');
  });

  // 16) Host asks one participant to unmute (a prompt; never forced).
  socket.on('sfu-request-unmute', async ({ socketId: targetSocketId } = {}) => {
    const roomId = await callerIsHost();
    if (!roomId || !targetSocketId) return;
    io.to(targetSocketId).emit('sfu-unmute-request', { by: socket.user?.name ?? 'The host' });
  });

  // 17) Host asks everyone (currently muted) to unmute (prompts only).
  socket.on('sfu-request-unmute-all', async () => {
    const roomId = await callerIsHost();
    if (!roomId) return;
    socket.to(roomId).emit('sfu-unmute-request', { by: socket.user?.name ?? 'The host' });
  });

  // 18) Host removes a participant from the call. Notify them, then disconnect
  //     their socket — the `disconnect` handler below broadcasts the leave and
  //     frees the room if it empties.
  socket.on('sfu-host-remove', async ({ socketId: targetSocketId } = {}) => {
    const roomId = await callerIsHost();
    if (!roomId || !targetSocketId || targetSocketId === socket.id) return;
    io.to(targetSocketId).emit('sfu-removed');
    const target = io.sockets.sockets.get(targetSocketId);
    if (target) setTimeout(() => { try { target.disconnect(true); } catch { /* gone */ } }, 250);
    logger.info({ event: 'host.remove', roomId, by: socket.id, target: targetSocketId }, 'host removed peer');
  });

  // 19) Host spotlights a participant for EVERYONE (pure layout relay, no media
  //     change). `socketId: null` clears the spotlight. Distinct from a local
  //     pin, which is client-only and never hits the server.
  socket.on('sfu-spotlight', async ({ socketId: targetSocketId = null } = {}) => {
    const roomId = await callerIsHost();
    if (!roomId) return;
    io.to(roomId).emit('sfu-spotlight', { socketId: targetSocketId });
    logger.debug({ event: 'host.spotlight', roomId, target: targetSocketId }, 'host spotlight');
  });

  // 12) Teardown: closing the peer's transports cascades to its producers and
  //    consumers; tell others to drop this peer's tiles; free the room if empty.
  socket.on('disconnect', () => {
    const roomId = socketRoom.get(socket.id);
    if (!roomId) return;
    removePeer(roomId, socket.id);
    socketRoom.delete(socket.id);
    socket.to(roomId).emit('sfu-peer-left', { socketId: socket.id });
    closeRoomIfEmpty(roomId);
    logger.info({ event: 'peer.left', roomId, socketId: socket.id }, 'peer left SFU room');
  });
}
