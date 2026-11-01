// src/components/PianoScrollBar.tsx
import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';

type Props = {
  index: number; // current start index (0-based)
  maxIndex: number; // highest valid start index
  visibleCount: number; // white keys visible at once
  totalCount: number; // total white keys available
  onChangeIndex: (index: number) => void;
};

export default function PianoScrollBar({
  index,
  maxIndex,
  visibleCount,
  totalCount,
  onChangeIndex,
}: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const dragRef = useRef<{ startX: number; startIndex: number } | null>(null);

  const thumbFraction =
    totalCount > 0 ? Math.min(1, visibleCount / totalCount) : 1;
  const thumbWidth = trackWidth * thumbFraction;
  const travel = Math.max(0, trackWidth - thumbWidth);

  const ratio = maxIndex > 0 ? index / maxIndex : 0;
  const thumbLeft = ratio * travel;

  const commitIndex = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(maxIndex, Math.round(next)));
      if (clamped !== index) onChangeIndex(clamped);
    },
    [maxIndex, index, onChangeIndex],
  );

  const handleGrant = (x: number) => {
    const onThumb = x >= thumbLeft && x <= thumbLeft + thumbWidth;
    if (onThumb) {
      dragRef.current = { startX: x, startIndex: index };
    } else if (travel > 0) {
      const r = Math.max(0, Math.min(1, (x - thumbWidth / 2) / travel));
      commitIndex(r * maxIndex);
    }
  };

  const handleMove = (x: number) => {
    const drag = dragRef.current;
    if (!drag || travel <= 0) return;
    const dx = x - drag.startX;
    commitIndex(drag.startIndex + (dx / travel) * maxIndex);
  };

  const handleRelease = () => {
    dragRef.current = null;
  };

  const disabled = maxIndex === 0;

  return (
    <View
      style={styles.track}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => !disabled}
      onResponderGrant={(e) => handleGrant(e.nativeEvent.locationX)}
      onResponderMove={(e) => handleMove(e.nativeEvent.locationX)}
      onResponderRelease={handleRelease}
      onResponderTerminate={handleRelease}
    >
      {trackWidth > 0 && (
        <View
          style={[
            styles.thumb,
            {
              width: thumbWidth,
              transform: [{ translateX: thumbLeft }],
              opacity: disabled ? 0.35 : 1,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 22,
    backgroundColor: '#0f1116',
    borderRadius: 11,
    marginHorizontal: 4,
    marginTop: 8,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1f2937',
    justifyContent: 'center',
  },
  thumb: {
    position: 'absolute',
    top: 0,
    height: '100%',
    backgroundColor: '#4a9eff',
    borderRadius: 11,
  },
});