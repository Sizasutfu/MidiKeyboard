// App.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  AppState,
  StatusBar,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';

import PianoKeyboard, { isWhiteKey } from './src/components/PianoKeyboard';
import {
  initMidi,
  getMidiStatus,
  sendNoteOn,
  sendNoteOff,
  panic,
  warmUpAudio,
  type MidiStatus,
} from './src/midi/midiClient';
import { isAudioAvailable } from './src/audio/synth';

const MIN_VISIBLE_OCTAVES = 1;
const MAX_VISIBLE_OCTAVES = 4;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function noteLabel(note: number): string {
  const name = NOTE_NAMES[((note % 12) + 12) % 12];
  const octave = Math.floor(note / 12) - 1;
  return `${name}${octave}`;
}

export default function App() {
  useKeepAwake();
  const { width } = useWindowDimensions();

  const autoVisibleOctaves = width >= 1100 ? 4 : width >= 900 ? 3 : 2;
  const [visibleOctaves, setVisibleOctaves] = useState(autoVisibleOctaves);
  const userAdjustedZoom = useRef(false);

  useEffect(() => {
    if (!userAdjustedZoom.current) {
      setVisibleOctaves(autoVisibleOctaves);
    }
  }, [autoVisibleOctaves]);

  const allWhiteKeys = useMemo(() => {
    const keys: number[] = [];
    for (let n = 0; n <= 127; n++) {
      if (isWhiteKey(n)) keys.push(n);
    }
    return keys;
  }, []);

  const whiteCount = visibleOctaves * 7;
  const maxWhiteIndex = Math.max(0, allWhiteKeys.length - whiteCount);

  const [startNote, setStartNote] = useState(60); // C4
  const [midiStatus, setMidiStatus] = useState<MidiStatus>(getMidiStatus());
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const activeNotesRef = useRef<Set<number>>(new Set());
  const [hapticsEnabled, setHapticsEnabled] = useState(false);

  useEffect(() => {
    warmUpAudio();
    initMidi().then(setMidiStatus);
  }, []);

  const noteOn = useCallback((note: number, velocity = 100) => {
    if (activeNotesRef.current.has(note)) return;
    sendNoteOn(note, velocity);
    activeNotesRef.current.add(note);
    setActiveNotes(new Set(activeNotesRef.current));
  }, []);

  const noteOff = useCallback((note: number) => {
    if (!activeNotesRef.current.has(note)) return;
    sendNoteOff(note);
    activeNotesRef.current.delete(note);
    setActiveNotes(new Set(activeNotesRef.current));
  }, []);

  const releaseAll = useCallback(() => {
    activeNotesRef.current.forEach((n) => sendNoteOff(n));
    activeNotesRef.current.clear();
    setActiveNotes(new Set());
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        panic();
        activeNotesRef.current.clear();
        setActiveNotes(new Set());
      }
    });
    return () => sub.remove();
  }, []);

  // ── Navigation helpers ────────────────────────────────────────────────

  const currentWhiteIndex = allWhiteKeys.indexOf(startNote);
  const currentOctave = Math.floor(startNote / 12) - 1;

  // Step by one white key (◀ ▶ short tap)
  const shiftByWhiteKey = useCallback(
    (dir: 1 | -1) => {
      releaseAll();
      setStartNote((prev) => {
        const idx = allWhiteKeys.indexOf(prev);
        const nextIdx = Math.max(0, Math.min(maxWhiteIndex, idx + dir));
        return allWhiteKeys[nextIdx] ?? prev;
      });
    },
    [releaseAll, allWhiteKeys, maxWhiteIndex],
  );

  // Jump by one octave (◀ ▶ long-press, or OCT +/−)
  const shiftByOctave = useCallback(
    (dir: 1 | -1) => {
      releaseAll();
      setStartNote((prev) => {
        const idx = allWhiteKeys.indexOf(prev);
        const nextIdx = Math.max(0, Math.min(maxWhiteIndex, idx + dir * 7));
        return allWhiteKeys[nextIdx] ?? prev;
      });
    },
    [releaseAll, allWhiteKeys, maxWhiteIndex],
  );

  const changeVisibleOctaves = useCallback(
    (delta: number) => {
      releaseAll();
      userAdjustedZoom.current = true;
      setVisibleOctaves((prev) => {
        const next = Math.max(
          MIN_VISIBLE_OCTAVES,
          Math.min(MAX_VISIBLE_OCTAVES, prev + delta),
        );
        const nextWhiteCount = next * 7;
        const nextMaxIdx = Math.max(0, allWhiteKeys.length - nextWhiteCount);
        const nextMaxNote = allWhiteKeys[nextMaxIdx] ?? 0;
        setStartNote((s) => Math.min(s, nextMaxNote));
        return next;
      });
    },
    [releaseAll, allWhiteKeys],
  );

  const canShiftLeft = currentWhiteIndex > 0;
  const canShiftRight = currentWhiteIndex < maxWhiteIndex;
  const canOctaveDown = currentWhiteIndex - 7 >= 0;
  const canOctaveUp = currentWhiteIndex + 7 <= maxWhiteIndex;

  let dotColor = '#9ca3af';
  let statusText = 'Connecting…';
  switch (midiStatus.kind) {
    case 'preview':
      dotColor = isAudioAvailable() ? '#4ade80' : '#facc15';
      statusText = isAudioAvailable() ? 'Phone audio' : 'Preview — no audio';
      break;
    case 'connecting':
      dotColor = '#9ca3af';
      statusText = 'Connecting…';
      break;
    case 'connected':
      dotColor = '#4ade80';
      statusText = `MIDI → ${midiStatus.name}`;
      break;
    case 'error':
      dotColor = isAudioAvailable() ? '#facc15' : '#ef4444';
      statusText = isAudioAvailable()
        ? 'No MIDI — using phone audio'
        : midiStatus.message;
      break;
  }

  return (
    <SafeAreaView
      style={styles.safe}
      edges={['left', 'right', 'top', 'bottom']}
    >
      <StatusBar barStyle="light-content" hidden />
      <View style={styles.container}>
        <View style={styles.toolbar}>
          <View style={styles.statusGroup}>
            <View style={[styles.dot, { backgroundColor: dotColor }]} />
            <Text style={styles.statusText} numberOfLines={1}>
              {statusText}
            </Text>
          </View>

          {/* KEYS — zoom */}
          <View style={styles.controlGroup}>
            <Text style={styles.controlLabel}>KEYS</Text>
            <Pressable
              onPress={() => changeVisibleOctaves(-1)}
              disabled={visibleOctaves <= MIN_VISIBLE_OCTAVES}
              style={({ pressed }) => [
                styles.tinyBtn,
                pressed && styles.tinyBtnPressed,
                visibleOctaves <= MIN_VISIBLE_OCTAVES && styles.tinyBtnDisabled,
              ]}
            >
              <Text style={styles.tinyBtnText}>−</Text>
            </Pressable>
            <Text style={styles.controlValue}>{visibleOctaves}</Text>
            <Pressable
              onPress={() => changeVisibleOctaves(1)}
              disabled={visibleOctaves >= MAX_VISIBLE_OCTAVES}
              style={({ pressed }) => [
                styles.tinyBtn,
                pressed && styles.tinyBtnPressed,
                visibleOctaves >= MAX_VISIBLE_OCTAVES && styles.tinyBtnDisabled,
              ]}
            >
              <Text style={styles.tinyBtnText}>+</Text>
            </Pressable>
          </View>

          {/* OCT — jump 1 whole octave */}
          <View style={styles.controlGroup}>
            <Text style={styles.controlLabel}>OCT</Text>
            <Pressable
              onPress={() => shiftByOctave(-1)}
              disabled={!canOctaveDown}
              style={({ pressed }) => [
                styles.tinyBtn,
                pressed && styles.tinyBtnPressed,
                !canOctaveDown && styles.tinyBtnDisabled,
              ]}
            >
              <Text style={styles.tinyBtnText}>−</Text>
            </Pressable>
            <Text style={styles.controlValue}>{currentOctave}</Text>
            <Pressable
              onPress={() => shiftByOctave(1)}
              disabled={!canOctaveUp}
              style={({ pressed }) => [
                styles.tinyBtn,
                pressed && styles.tinyBtnPressed,
                !canOctaveUp && styles.tinyBtnDisabled,
              ]}
            >
              <Text style={styles.tinyBtnText}>+</Text>
            </Pressable>
          </View>

          {/* ◀ note-name ▶ — tap = 1 white key, long-press = 1 octave */}
          <View style={styles.controlGroup}>
            <Pressable
              onPress={() => shiftByWhiteKey(-1)}
              onLongPress={() => shiftByOctave(-1)}
              delayLongPress={400}
              disabled={!canShiftLeft}
              style={({ pressed }) => [
                styles.tinyBtn,
                pressed && styles.tinyBtnPressed,
                !canShiftLeft && styles.tinyBtnDisabled,
              ]}
            >
              <Text style={styles.tinyBtnText}>◀</Text>
            </Pressable>
            <Text style={styles.noteLabel}>{noteLabel(startNote)}</Text>
            <Pressable
              onPress={() => shiftByWhiteKey(1)}
              onLongPress={() => shiftByOctave(1)}
              delayLongPress={400}
              disabled={!canShiftRight}
              style={({ pressed }) => [
                styles.tinyBtn,
                pressed && styles.tinyBtnPressed,
                !canShiftRight && styles.tinyBtnDisabled,
              ]}
            >
              <Text style={styles.tinyBtnText}>▶</Text>
            </Pressable>
          </View>

          {/* Haptics toggle */}
          <Pressable
            onPress={() => setHapticsEnabled((v) => !v)}
            style={({ pressed }) => [
              styles.hapBtn,
              hapticsEnabled && styles.hapBtnOn,
              pressed && styles.hapBtnPressed,
            ]}
          >
            <Text
              style={[styles.hapText, hapticsEnabled && styles.hapTextOn]}
            >
              HAP
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              panic();
              releaseAll();
            }}
            style={({ pressed }) => [
              styles.panicBtn,
              pressed && styles.panicBtnPressed,
            ]}
          >
            <Text style={styles.panicText}>STOP</Text>
          </Pressable>
        </View>

        <View style={styles.keyboardWrap}>
          <PianoKeyboard
            startNote={startNote}
            octaveCount={visibleOctaves}
            activeNotes={activeNotes}
            onNoteOn={noteOn}
            onNoteOff={noteOff}
            hapticsEnabled={hapticsEnabled}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0d' },
  container: { flex: 1, paddingHorizontal: 12, paddingVertical: 8 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 6,
  },
  statusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    flexGrow: 1,
    minWidth: 0,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: '#9ca3af', fontSize: 12, flexShrink: 1 },

  controlGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#111318',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  controlLabel: {
    color: '#6b7280',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginRight: 2,
  },
  controlValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    minWidth: 14,
    textAlign: 'center',
  },
  noteLabel: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    minWidth: 34,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  tinyBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tinyBtnPressed: { backgroundColor: '#374151' },
  tinyBtnDisabled: { opacity: 0.3 },
  tinyBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },

  hapBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#1f2937',
    minWidth: 46,
    alignItems: 'center',
  },
  hapBtnOn: { backgroundColor: '#14532d', borderColor: '#22c55e' },
  hapBtnPressed: { opacity: 0.85 },
  hapText: {
    color: '#6b7280',
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 1,
  },
  hapTextOn: { color: '#86efac' },

  panicBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#7f1d1d',
  },
  panicBtnPressed: { backgroundColor: '#991b1b' },
  panicText: {
    color: '#fecaca',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1,
  },

  keyboardWrap: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#0d0d10',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
});