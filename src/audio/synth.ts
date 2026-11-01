// src/audio/synth.ts
// Real-time oscillator synth. Falls back to a no-op when the native module
// isn't available (Expo Go or before dev-client rebuild).

type AudioContextLike = {
  currentTime: number;
  createOscillator: () => any;
  createGain: () => any;
  destination: any;
};

let AudioContextClass: (new () => AudioContextLike) | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('react-native-audio-api');
  if (mod?.AudioContext) {
    AudioContextClass = mod.AudioContext;
  }
} catch {
  console.warn('[Audio] Native module unavailable — audio disabled (Expo Go?).');
}

type Voice = {
  osc: any;
  gain: any;
};

const voices = new Map<number, Voice>();
let ctx: AudioContextLike | null = null;

export function isAudioAvailable(): boolean {
  return AudioContextClass !== null;
}

export function initAudio(): AudioContextLike | null {
  if (!AudioContextClass) return null;
  if (!ctx) {
    try {
      ctx = new AudioContextClass();
    } catch (e) {
      console.warn('[Audio] Failed to create AudioContext:', e);
      return null;
    }
  }
  return ctx;
}

export function noteToFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export function playNote(note: number, velocity = 100) {
  const context = initAudio();
  if (!context) return;

  if (voices.has(note)) stopNote(note);

  const now = context.currentTime;
  const osc = context.createOscillator();
  const gain = context.createGain();

  osc.type = 'triangle';
  osc.frequency.value = noteToFrequency(note);

  const peak = Math.max(0.02, (velocity / 127) * 0.28);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);

  osc.connect(gain);
  gain.connect(context.destination);

  osc.start(now);
  try {
    osc.stop(now + 1.8);
  } catch {
    /* ignore */
  }

  voices.set(note, { osc, gain });

  // NOTE: react-native-audio-api uses `onEnded` (capital E), not Web's `onended`.
  // Assign defensively so this compiles even if a future version renames it.
  try {
    osc.onEnded = () => {
      const current = voices.get(note);
      if (current?.osc === osc) voices.delete(note);
    };
  } catch {
    /* older/newer lib versions may expose it differently — non-fatal */
  }
}

export function stopNote(note: number) {
  const voice = voices.get(note);
  if (!voice || !ctx) return;

  const now = ctx.currentTime;
  const g = voice.gain.gain;
  try {
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value ?? 0.0001, now);
    g.exponentialRampToValueAtTime(0.0001, now + 0.08);
  } catch {
    /* ignore */
  }

  try {
    voice.osc.stop(now + 0.09);
  } catch {
    /* already stopped */
  }

  voices.delete(note);
}

export function panicAudio() {
  for (const note of Array.from(voices.keys())) {
    stopNote(note);
  }
}