// src/components/PianoKeyboard.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, StyleSheet, GestureResponderEvent } from 'react-native';
import * as Haptics from 'expo-haptics';

const WHITE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const BLACK_SEMITONES = [1, 3, 6, 8, 10];
const BLACK_AFTER_WHITE = [0, 1, 3, 4, 5];
const BLACK_KEY_WIDTH_UNITS = 0.6;

type Key = {
  note: number;
  isBlack: boolean;
  leftUnits: number;
  widthUnits: number;
};

type Touch = {
  identifier: number;
  locationX: number;
  locationY: number;
};

type Props = {
  startOctave: number;
  octaveCount: number;
  activeNotes: Set<number>;
  onNoteOn: (note: number, velocity?: number) => void;
  onNoteOff: (note: number) => void;
};

export default function PianoKeyboard({
  startOctave,
  octaveCount,
  activeNotes,
  onNoteOn,
  onNoteOff,
}: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const touchesRef = useRef<Map<number, number>>(new Map());

  const keys = useMemo<Key[]>(() => {
    const out: Key[] = [];
    for (let o = 0; o < octaveCount; o++) {
      const baseNote = 12 * (startOctave + 1) + o * 12;
      const whiteOffset = o * 7;

      WHITE_SEMITONES.forEach((semi, i) => {
        out.push({
          note: baseNote + semi,
          isBlack: false,
          leftUnits: whiteOffset + i,
          widthUnits: 1,
        });
      });

      BLACK_SEMITONES.forEach((semi, b) => {
        const afterWhite = BLACK_AFTER_WHITE[b];
        out.push({
          note: baseNote + semi,
          isBlack: true,
          leftUnits: whiteOffset + afterWhite + 1 - BLACK_KEY_WIDTH_UNITS / 2,
          widthUnits: BLACK_KEY_WIDTH_UNITS,
        });
      });
    }
    return out;
  }, [startOctave, octaveCount]);

  const whites = useMemo(() => keys.filter((k) => !k.isBlack), [keys]);
  const blacks = useMemo(() => keys.filter((k) => k.isBlack), [keys]);

  const totalWhiteKeys = octaveCount * 7;
  const whiteWidth =
    size.width > 0 && totalWhiteKeys > 0 ? size.width / totalWhiteKeys : 0;
  const keyboardHeight = size.height;
  const blackHeight = keyboardHeight * 0.62;

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
          Haptics.selectionAsync().catch(() => {});
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
    [hitTest, onNoteOn, onNoteOff],
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
      {whiteWidth > 0 &&
        whites.map((k) => {
          const active = activeNotes.has(k.note);
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
            />
          );
        })}

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
            />
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
});