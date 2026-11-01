// src/components/PianoKeyboard.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, Text, StyleSheet, GestureResponderEvent } from 'react-native';
import * as Haptics from 'expo-haptics';

const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const BLACK_KEY_WIDTH_UNITS = 0.6;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function isWhiteKey(note: number): boolean {
  return WHITE_PITCH_CLASSES.has(((note % 12) + 12) % 12);
}

function noteName(note: number): string {
  return NOTE_NAMES[((note % 12) + 12) % 12];
}

function octaveOf(note: number): number {
  return Math.floor(note / 12) - 1;
}

type Key = {
  note: number;
  isBlack: boolean;
  leftUnits: number;
  widthUnits: number;
  /** Precomputed label — stable across renders so React skips updates. */
  label: string;
};

type Touch = {
  identifier: number;
  locationX: number;
  locationY: number;
};

type Props = {
  startNote: number;
  octaveCount: number;
  activeNotes: Set<number>;
  onNoteOn: (note: number, velocity?: number) => void;
  onNoteOff: (note: number) => void;
  hapticsEnabled?: boolean;
  showLabels?: boolean;
};

export default function PianoKeyboard({
  startNote,
  octaveCount,
  activeNotes,
  onNoteOn,
  onNoteOff,
  hapticsEnabled = false,
  showLabels = true,
}: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const touchesRef = useRef<Map<number, number>>(new Map());

  const whiteCount = octaveCount * 7;

  const keys = useMemo<Key[]>(() => {
    const out: Key[] = [];
    const whites: number[] = [];
    let n = startNote;
    while (whites.length < whiteCount && n <= 127) {
      if (isWhiteKey(n)) whites.push(n);
      n++;
    }

    whites.forEach((note, i) => {
      const name = noteName(note);
      // C keys get the octave number for orientation ("C4", "C5").
      // Every other key is just the letter.
      const label = name === 'C' ? `${name}${octaveOf(note)}` : name;
      out.push({
        note,
        isBlack: false,
        leftUnits: i,
        widthUnits: 1,
        label,
      });
    });

    whites.forEach((note, i) => {
      const above = note + 1;
      if (!isWhiteKey(above) && above <= 127) {
        out.push({
          note: above,
          isBlack: true,
          leftUnits: i + 1 - BLACK_KEY_WIDTH_UNITS / 2,
          widthUnits: BLACK_KEY_WIDTH_UNITS,
          label: noteName(above),
        });
      }
    });

    return out;
  }, [startNote, whiteCount]);

  const whites = useMemo(() => keys.filter((k) => !k.isBlack), [keys]);
  const blacks = useMemo(() => keys.filter((k) => k.isBlack), [keys]);

  const whiteWidth =
    size.width > 0 && whiteCount > 0 ? size.width / whiteCount : 0;
  const keyboardHeight = size.height;
  const blackHeight = keyboardHeight * 0.62;
  const blackWidth = whiteWidth * BLACK_KEY_WIDTH_UNITS;

  // Label size scales with key width so it stays readable at every zoom level.
  const whiteLabelSize = Math.max(9, Math.min(14, whiteWidth * 0.22));
  const blackLabelSize = Math.max(8, Math.min(11, blackWidth * 0.45));
  const showBlackLabels = blackWidth >= 16;

  useEffect(() => {
    if (activeNotes.size === 0 && touchesRef.current.size > 0) {
      touchesRef.current.clear();
    }
  }, [activeNotes]);

  useEffect(() => {
    return () => {
      for (const note of touchesRef.current.values()) onNoteOff(note);
      touchesRef.current.clear();
    };
  }, [onNoteOff]);

  const hitTest = useCallback(
    (x: number, y: number): number | undefined => {
      if (whiteWidth <= 0) return undefined;

      if (y < blackHeight) {
        for (const k of blacks) {
          const left = k.leftUnits * whiteWidth;
          const right = left + k.widthUnits * whiteWidth;
          if (x >= left && x <= right) return k.note;
        }
      }

      const idx = Math.floor(x / whiteWidth);
      if (idx >= 0 && idx < whites.length) return whites[idx].note;
      return undefined;
    },
    [blacks, whites, blackHeight, whiteWidth],
  );

  const syncTouches = useCallback(
    (touches: Touch[]) => {
      const seen = new Set<number>();

      for (const t of touches) {
        seen.add(t.identifier);
        const note = hitTest(t.locationX, t.locationY);
        const prev = touchesRef.current.get(t.identifier);

        if (note === prev) continue;

        if (prev !== undefined) {
          onNoteOff(prev);
          touchesRef.current.delete(t.identifier);
        }
        if (note !== undefined) {
          if (hapticsEnabled) {
            Haptics.selectionAsync().catch(() => {});
          }
          onNoteOn(note, 100);
          touchesRef.current.set(t.identifier, note);
        }
      }

      for (const [id, note] of Array.from(touchesRef.current.entries())) {
        if (!seen.has(id)) {
          onNoteOff(note);
          touchesRef.current.delete(id);
        }
      }
    },
    [hitTest, onNoteOn, onNoteOff, hapticsEnabled],
  );

  const onTouch = useCallback(
    (e: GestureResponderEvent) => {
      syncTouches((e.nativeEvent.touches ?? []) as unknown as Touch[]);
    },
    [syncTouches],
  );

  const onTouchEnd = useCallback(
    (e: GestureResponderEvent) => {
      const ne = e.nativeEvent as unknown as {
        touches?: Touch[];
        changedTouches?: Touch[];
      };

      for (const t of ne.changedTouches ?? []) {
        const prev = touchesRef.current.get(t.identifier);
        if (prev !== undefined) {
          onNoteOff(prev);
          touchesRef.current.delete(t.identifier);
        }
      }

      syncTouches(ne.touches ?? []);
    },
    [onNoteOff, syncTouches],
  );

  const clearAll = useCallback(() => {
    for (const note of touchesRef.current.values()) onNoteOff(note);
    touchesRef.current.clear();
  }, [onNoteOff]);

  return (
    <View
      style={styles.container}
      onLayout={(e) =>
        setSize({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        })
      }
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderStart={onTouch}
      onResponderMove={onTouch}
      onResponderEnd={onTouchEnd}
      onResponderRelease={clearAll}
      onResponderTerminate={clearAll}
    >
      {/* ===== White keys ===== */}
      {whiteWidth > 0 &&
        whites.map((k) => {
          const active = activeNotes.has(k.note);
          const isC = k.label.startsWith('C');
          return (
            <View
              key={`w-${k.note}`}
              pointerEvents="none"
              style={[
                styles.whiteKey,
                {
                  left: k.leftUnits * whiteWidth,
                  width: whiteWidth - 1,
                  height: keyboardHeight,
                },
                active && styles.whiteKeyActive,
              ]}
            >
              {showLabels && (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.whiteKeyLabel,
                    isC && styles.whiteKeyLabelC,
                    active && styles.whiteKeyLabelActive,
                    { fontSize: whiteLabelSize },
                  ]}
                >
                  {k.label}
                </Text>
              )}
            </View>
          );
        })}

      {/* ===== Black keys ===== */}
      {whiteWidth > 0 &&
        blacks.map((k) => {
          const active = activeNotes.has(k.note);
          return (
            <View
              key={`b-${k.note}`}
              pointerEvents="none"
              style={[
                styles.blackKey,
                {
                  left: k.leftUnits * whiteWidth,
                  width: k.widthUnits * whiteWidth,
                  height: blackHeight,
                },
                active && styles.blackKeyActive,
              ]}
            >
              {showLabels && showBlackLabels && (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.blackKeyLabel,
                    active && styles.blackKeyLabelActive,
                    { fontSize: blackLabelSize },
                  ]}
                >
                  {k.label}
                </Text>
              )}
            </View>
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative', backgroundColor: '#0d0d10' },
  whiteKey: {
    position: 'absolute',
    top: 0,
    backgroundColor: '#f5f5f7',
    borderColor: '#1a1a1d',
    borderWidth: 1,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  whiteKeyActive: { backgroundColor: '#4a9eff' },
  whiteKeyLabel: {
    position: 'absolute',
    bottom: 6,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#5a5a5f',
    fontWeight: '600',
  },
  whiteKeyLabelC: {
    color: '#1a1a1d',
    fontWeight: '700',
  },
  whiteKeyLabelActive: {
    color: '#0a2342',
  },

  blackKey: {
    position: 'absolute',
    top: 0,
    backgroundColor: '#121214',
    borderColor: '#000',
    borderWidth: 1,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    zIndex: 2,
  },
  blackKeyActive: { backgroundColor: '#2d6fcc' },
  blackKeyLabel: {
    position: 'absolute',
    bottom: 4,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#8a8a90',
    fontWeight: '600',
  },
  blackKeyLabelActive: {
    color: '#e0ecff',
  },
});