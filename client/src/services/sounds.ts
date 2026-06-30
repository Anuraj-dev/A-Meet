// A-Meet sound effects — fully synthesized with the Web Audio API.
//
// No audio files are bundled: every cue is generated from oscillators with
// short ADSR envelopes through a shared compressor, so they stay crisp,
// tiny, and tunable. Cues are intentionally soft and brief (Meet-like).
//
// Autoplay policy: an AudioContext starts "suspended" until a user gesture.
// Since the user always reaches the call via a click (New meeting / Join),
// the SPA already has gesture history, so cues resume on demand.
//
// Crucially, the context is fully CLOSED whenever idle: a UI-sound context left
// open holds a second audio-output stream for the whole call, which interferes
// with the WebRTC call audio and crackles (notably on Linux/PipeWire, where
// suspend() does NOT reliably release the output device). We create one
// just-in-time per cue and close() it ~1.2s after the last cue.
//
// Preference: on/off is persisted in localStorage ("ameet:sfx"), default on.

const STORAGE_KEY = 'ameet:sfx';

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

type SoundName =
  | 'join'
  | 'leave'
  | 'message'
  | 'reaction'
  | 'raiseHand'
  | 'toggleOn'
  | 'toggleOff'
  | 'shareStart'
  | 'shareStop'
  | 'callEnd';

interface VoiceOptions {
  freq: number;
  type?: OscillatorType;
  start?: number;
  duration?: number;
  peak?: number;
  attack?: number;
  release?: number;
  glideTo?: number;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = readEnabled();
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function audioSupported(): boolean {
  return Boolean(typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext));
}

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  // Match WebRTC's 48 kHz output so the OS never has to resample our cues
  // against the live call audio — a rate mismatch crackles on Linux/PipeWire.
  try { ctx = new AC({ latencyHint: 'interactive', sampleRate: 48000 }); }
  catch { ctx = new AC(); }
  // Gentle master chain: compressor smooths transients, low master gain keeps
  // everything in pleasant background-cue territory.
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.18;
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(compressor);
  compressor.connect(ctx.destination);
  return ctx;
}

// A UI-sound context must only hold the audio output device while a cue is
// actually sounding. Left open through the call's silence, that second active
// output stream interferes with the WebRTC call audio and produces a constant
// crackle (very audible on Linux/PipeWire). suspend() doesn't reliably release
// the device there, so we fully close() the context shortly after the last cue
// and recreate it lazily for the next one. The 1.2s debounce lets a burst of
// cues reuse one context before it's torn down.
function scheduleIdleClose(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (ctx) {
      const dying = ctx;
      ctx = null;
      master = null;
      dying.close().catch(() => {});
    }
  }, 1200);
}

// Schedule one enveloped voice. `glideTo` sweeps the pitch over the note.
function voice(c: AudioContext, {
  freq,
  type = 'sine',
  start = 0,
  duration = 0.3,
  peak = 0.12,
  attack = 0.008,
  release,
  glideTo,
}: VoiceOptions): void {
  const t0 = c.currentTime + start;
  const rel = release ?? duration * 0.7;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + duration);

  // Click-free envelope: ramp up from near-zero, hold, ramp back to near-zero.
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  gain.gain.setValueAtTime(peak, t0 + Math.max(attack, duration - rel));
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(gain);
  gain.connect(master!);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
  // Disconnect nodes once the oscillator ends so they are garbage-collected.
  // Without this every sound leaves a dead gain node attached to `master`
  // forever; hundreds of them force the audio render thread to process silent
  // nodes every quantum, eventually causing buffer dropouts (clicks).
  osc.addEventListener('ended', () => { osc.disconnect(); gain.disconnect(); }, { once: true });
}

// Note frequencies (equal temperament) used by the recipes.
const N = {
  D4: 293.66, A4: 440.0, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99,
  A5: 880.0, B5: 987.77, C6: 1046.5, E6: 1318.51, A6: 1760.0,
};

// Each recipe schedules a short sequence of voices.
const RECIPES: Record<SoundName, (context: AudioContext) => void> = {
  // Warm ascending chime — someone joined (Meet-like). A clean rising fifth
  // (C5 → G5) with a faint octave shimmer (C6, triangle) layered on the upper
  // note so it reads as a soft bell rather than a plain beep.
  join: (c) => {
    voice(c, { freq: N.C5, type: 'sine', duration: 0.15, peak: 0.12, attack: 0.006 });
    voice(c, { freq: N.G5, type: 'sine', start: 0.12, duration: 0.3, peak: 0.13, attack: 0.006 });
    voice(c, { freq: N.C6, type: 'triangle', start: 0.12, duration: 0.22, peak: 0.03, attack: 0.006 });
  },
  // Two-note fall — someone left.
  leave: (c) => {
    voice(c, { freq: N.G5, type: 'sine', duration: 0.16, peak: 0.12 });
    voice(c, { freq: N.C5, type: 'sine', start: 0.13, duration: 0.28, peak: 0.12 });
  },
  // Soft marimba pop — incoming chat message.
  message: (c) => {
    voice(c, { freq: N.A5, type: 'triangle', duration: 0.18, peak: 0.11, release: 0.16 });
    voice(c, { freq: N.E6, type: 'sine', duration: 0.12, peak: 0.04 });
  },
  // Light sparkle — emoji reaction.
  reaction: (c) => {
    voice(c, { freq: N.A6, type: 'triangle', duration: 0.09, peak: 0.06 });
    voice(c, { freq: N.E6, type: 'triangle', start: 0.07, duration: 0.12, peak: 0.06 });
  },
  // Gentle rise — a hand was raised.
  raiseHand: (c) => {
    voice(c, { freq: N.D5, type: 'sine', duration: 0.14, peak: 0.1 });
    voice(c, { freq: N.A5, type: 'sine', start: 0.12, duration: 0.22, peak: 0.1 });
  },
  // Subtle ticks for mic/cam toggles.
  toggleOn: (c) => voice(c, { freq: N.A5, type: 'sine', duration: 0.07, peak: 0.07 }),
  toggleOff: (c) => voice(c, { freq: N.D5, type: 'sine', duration: 0.07, peak: 0.07 }),
  // Rising / falling swoops for screen share start / stop.
  shareStart: (c) => voice(c, { freq: 320, glideTo: 760, type: 'sine', duration: 0.32, peak: 0.1 }),
  shareStop: (c) => voice(c, { freq: 760, glideTo: 320, type: 'sine', duration: 0.3, peak: 0.1 }),
  // Warm descending pair — leaving the call.
  callEnd: (c) => {
    voice(c, { freq: N.A4, type: 'sine', duration: 0.18, peak: 0.13 });
    voice(c, { freq: N.D4, type: 'sine', start: 0.14, duration: 0.34, peak: 0.13 });
  },
};

/** Play a named cue. No-op when sounds are off or audio is unsupported. */
export function playSound(name: SoundName): void {
  if (!enabled || !audioSupported()) return;
  const recipe = RECIPES[name];
  if (!recipe) return;
  try {
    const c = getCtx();
    if (!c) return;
    if (c.state !== 'running') c.resume().catch(() => {});
    recipe(c);
    scheduleIdleClose();
  } catch {
    /* audio not available — ignore */
  }
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(value: boolean): boolean {
  enabled = !!value;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    /* storage blocked — keep in-memory only */
  }
  // Don't pre-create a context here: it would hold the audio output device idle
  // against the live call. The next cue lazily creates one and closes it after.
  return enabled;
}

export function toggleSound(): boolean {
  return setSoundEnabled(!enabled);
}

// No gesture pre-priming: the user always reaches a cue-playing screen via
// clicks (New meeting / Join), so the page already has user-activation and the
// just-in-time resume() inside playSound succeeds. We deliberately never hold an
// AudioContext open ahead of time — that's what crackled the live call audio.
