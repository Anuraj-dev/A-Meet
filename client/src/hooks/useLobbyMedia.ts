import { useCallback, useEffect, useRef, useState } from 'react';

export function useLobbyMedia() {
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [selectedAudioId, setSelectedAudioId] = useState('');
  const [videoOn, setVideoOn] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);

  async function enumerateAndUpdate(stream: MediaStream) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const vDevs = devices.filter((d) => d.kind === 'videoinput');
    const aDevs = devices.filter((d) => d.kind === 'audioinput');
    setVideoDevices(vDevs);
    setAudioDevices(aDevs);

    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];

    if (videoTrack) {
      const settings = videoTrack.getSettings();
      setSelectedVideoId(settings.deviceId ?? vDevs[0]?.deviceId ?? '');
    } else if (vDevs.length) {
      setSelectedVideoId(vDevs[0].deviceId);
    }

    if (audioTrack) {
      const settings = audioTrack.getSettings();
      setSelectedAudioId(settings.deviceId ?? aDevs[0]?.deviceId ?? '');
    } else if (aDevs.length) {
      setSelectedAudioId(aDevs[0].deviceId);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const stream = new MediaStream();
      let deniedCount = 0;

      try {
        const a = await navigator.mediaDevices.getUserMedia({ audio: true });
        a.getAudioTracks().forEach((t) => stream.addTrack(t));
      } catch (err: unknown) {
        const name = err instanceof Error ? err.name : '';
        if (name === 'NotAllowedError' || name === 'NotFoundError') deniedCount++;
      }
      try {
        const v = await navigator.mediaDevices.getUserMedia({ video: true });
        v.getVideoTracks().forEach((t) => stream.addTrack(t));
      } catch (err: unknown) {
        const name = err instanceof Error ? err.name : '';
        if (name === 'NotAllowedError' || name === 'NotFoundError') deniedCount++;
      }
      if (deniedCount === 2) setPermissionDenied(true);

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      setPreviewStream(new MediaStream(stream.getTracks()));
      setVideoOn(stream.getVideoTracks().length > 0);
      setAudioOn(stream.getAudioTracks().length > 0);
      await enumerateAndUpdate(stream);
    }

    init();
    return () => { cancelled = true; };
  }, []);

  const setVideoDevice = useCallback(async (deviceId: string) => {
    setSelectedVideoId(deviceId);
    // Stop old video tracks.
    streamRef.current?.getVideoTracks().forEach((t) => { t.stop(); streamRef.current!.removeTrack(t); });
    try {
      const v = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } });
      v.getVideoTracks().forEach((t) => streamRef.current!.addTrack(t));
      setVideoOn(true);
    } catch {
      setVideoOn(false);
    }
    setPreviewStream(new MediaStream(streamRef.current!.getTracks()));
  }, []);

  const setAudioDevice = useCallback(async (deviceId: string) => {
    setSelectedAudioId(deviceId);
    streamRef.current?.getAudioTracks().forEach((t) => { t.stop(); streamRef.current!.removeTrack(t); });
    try {
      const a = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: deviceId } } });
      a.getAudioTracks().forEach((t) => streamRef.current!.addTrack(t));
      setAudioOn(true);
    } catch {
      setAudioOn(false);
    }
    if (streamRef.current) setPreviewStream(new MediaStream(streamRef.current.getTracks()));
  }, []);

  const toggleVideo = useCallback(() => {
    const tracks = streamRef.current?.getVideoTracks() ?? [];
    if (tracks.length === 0) return;
    const next = !tracks[0].enabled;
    tracks.forEach((t) => { t.enabled = next; });
    setVideoOn(next);
  }, []);

  const toggleAudio = useCallback(() => {
    const tracks = streamRef.current?.getAudioTracks() ?? [];
    if (tracks.length === 0) return;
    const next = !tracks[0].enabled;
    tracks.forEach((t) => { t.enabled = next; });
    setAudioOn(next);
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  return {
    previewStream,
    videoDevices,
    audioDevices,
    selectedVideoId,
    selectedAudioId,
    videoOn,
    audioOn,
    permissionDenied,
    setVideoDevice,
    setAudioDevice,
    toggleVideo,
    toggleAudio,
    stop,
  };
}
