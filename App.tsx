// App.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
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

import PianoKeyboard from './src/components/PianoKeyboard';
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

const MIN_OCTAVE = 1;
const MAX_OCTAVE = 7;

export default function App() {
  useKeepAwake();
  const { width } = useWindowDimensions();
  const octaveCount = width >= 900 ? 3 : 2;

  const [octave, setOctave] = useState(4);
  const [midiStatus, setMidiStatus] = useState<MidiStatus>(getMidiStatus());
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const activeNotesRef = useRef<Set<number>>(new Set());

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

  const changeOctave = useCallback(
    (delta: number) => {
      releaseAll();
      setOctave((prev) =>
        Math.max(MIN_OCTAVE, Math.min(MAX_OCTAVE, prev + delta)),
      );
    },
    [releaseAll],
  );

  // Status display — MIDI connected OR phone audio
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

          <View style={styles.octaveGroup}>
            <Pressable
              onPress={() => changeOctave(-1)}
              style={({ pressed }) => [
                styles.octaveBtn,
                pressed && styles.octaveBtnPressed,
              ]}
            >
              <Text style={styles.octaveBtnText}>−</Text>
            </Pressable>
            <Text style={styles.octaveValue}>OCT {octave}</Text>
            <Pressable
              onPress={() => changeOctave(1)}
              style={({ pressed }) => [
                styles.octaveBtn,
                pressed && styles.octaveBtnPressed,
              ]}
            >
              <Text style={styles.octaveBtnText}>+</Text>
            </Pressable>
          </View>

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
            startOctave={octave}
            octaveCount={octaveCount}
            activeNotes={activeNotes}
            onNoteOn={noteOn}
            onNoteOff={noteOff}
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
    gap: 12,
  },
  statusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: '#9ca3af', fontSize: 12, flexShrink: 1 },
  octaveGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  octaveBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  octaveBtnPressed: { backgroundColor: '#374151' },
  octaveBtnText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 24,
  },
  octaveValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.5,
    minWidth: 56,
    textAlign: 'center',
  },
  panicBtn: {
    paddingHorizontal: 14,
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