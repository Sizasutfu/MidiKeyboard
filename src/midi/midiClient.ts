// src/midi/midiClient.ts
import { playNote, stopNote, panicAudio, initAudio } from '../audio/synth';

type MidiOutput = {
  name: string;
  send: (data: number[] | Uint8Array) => void;
};

let requestMIDIAccess: ((opts?: any) => Promise<any>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('react-native-midi-api');
  requestMIDIAccess = mod?.requestMIDIAccess ?? null;
} catch {
  console.warn('[MIDI] Native module unavailable — running without MIDI.');
}

export type MidiStatus =
  | { kind: 'preview' }
  | { kind: 'connecting' }
  | { kind: 'connected'; name: string }
  | { kind: 'error'; message: string };

let output: MidiOutput | null = null;
let status: MidiStatus = requestMIDIAccess
  ? { kind: 'connecting' }
  : { kind: 'preview' };
let initPromise: Promise<MidiStatus> | null = null;

export function getMidiStatus(): MidiStatus {
  return status;
}

export function initMidi(): Promise<MidiStatus> {
  if (initPromise) return initPromise;

  if (!requestMIDIAccess) {
    status = { kind: 'preview' };
    initPromise = Promise.resolve(status);
    return initPromise;
  }

  initPromise = requestMIDIAccess()
    .then((access: any) => {
      const outputs = Array.from(access.outputs.values()) as MidiOutput[];
      output = outputs[0] ?? null;
      status = output
        ? { kind: 'connected', name: output.name }
        : { kind: 'error', message: 'No MIDI output — using phone audio' };
      return status;
    })
    .catch((err: any) => {
      console.error('[MIDI] init failed:', err);
      status = { kind: 'error', message: String(err?.message ?? err) };
      return status;
    });

  return initPromise;
}

export function isMidiConnected(): boolean {
  return output !== null;
}

// --- Unified note API ---
// Audio + MIDI are independent; audio plays only when MIDI isn't connected.

export function sendNoteOn(note: number, velocity = 100, channel = 0) {
  if (output) {
    output.send([0x90 | channel, note & 0x7f, velocity & 0x7f]);
  } else {
    playNote(note, velocity);
  }
}

export function sendNoteOff(note: number, channel = 0) {
  if (output) {
    output.send([0x80 | channel, note & 0x7f, 0]);
  } else {
    stopNote(note);
  }
}

export function sendControlChange(
  controller: number,
  value: number,
  channel = 0,
) {
  output?.send([0xb0 | channel, controller & 0x7f, value & 0x7f]);
}

export function sendPitchBend(value: number, channel = 0) {
  const v = Math.max(-8192, Math.min(8191, value)) + 8192;
  output?.send([0xe0 | channel, v & 0x7f, (v >> 7) & 0x7f]);
}

export function panic() {
  output?.send([0xb0, 123, 0]);
  output?.send([0xb0, 120, 0]);
  panicAudio();
}

// Warm up the audio context so the first key press doesn't cause a spike.
export function warmUpAudio() {
  try {
    initAudio();
  } catch (e) {
    console.warn('[Audio] warm-up failed:', e);
  }
}