import { CardioTrackerCard } from '@/components/presentation/workout/cardio/cardio-tracker-card';
import IconButton from '@/components/presentation/foundation/gesture-wrappers/icon-button';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { useAppTheme, spacing, rounding } from '@/hooks/useAppTheme';
import { KeiserExerciseSetBlueprint } from '@/models/blueprint-models';
import { Duration, OffsetDateTime } from '@js-joda/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAnimatedValue, Animated, View } from 'react-native';
import {
  computeKeiserTimerState,
  KeiserTimerState,
} from '@/components/presentation/workout/keiser/keiser-timer-state';

interface KeiserTimerProps {
  blueprint: KeiserExerciseSetBlueprint;
  recordedDuration: Duration | undefined;
  currentBlockStartTime: OffsetDateTime | undefined;
  isReadonly: boolean;
  onPlay: () => void;
  onPause: (accumulatedDuration: Duration) => void;
  onAutoComplete: (
    accumulatedDuration: Duration,
    completionTime: OffsetDateTime,
  ) => void;
  onReset: () => void;
}

export function KeiserTimer({
  blueprint,
  recordedDuration,
  currentBlockStartTime,
  isReadonly,
  onPlay,
  onPause,
  onAutoComplete,
  onReset,
}: KeiserTimerProps) {
  const playPauseButtonSize = 32;
  const { colors } = useAppTheme();
  const animatedRadius = useAnimatedValue(40);

  const compute = useCallback(
    (): KeiserTimerState =>
      computeKeiserTimerState({
        now: OffsetDateTime.now(),
        currentBlockStartTime,
        recordedDuration,
        prepDuration: blueprint.prepDuration,
        maxDuration: blueprint.maxDuration,
        moveDuration: blueprint.moveDuration,
        pauseDuration: blueprint.pauseDuration,
      }),
    [currentBlockStartTime, recordedDuration, blueprint],
  );

  const [timerState, setTimerState] = useState<KeiserTimerState>(compute);
  const autoStoppedRef = useRef(false);

  const handlePlay = () => {
    autoStoppedRef.current = false;
    onPlay();
  };

  const handlePause = () => {
    if (!currentBlockStartTime) return;
    const state = compute();
    onPause(state.runDuration);
  };

  const handlePlayPause = () => {
    const toValue = currentBlockStartTime
      ? playPauseButtonSize
      : rounding.roundedRectangleRadius;
    if (currentBlockStartTime) {
      handlePause();
    } else {
      handlePlay();
    }
    Animated.timing(animatedRadius, {
      toValue,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const handleReset = () => {
    autoStoppedRef.current = false;
    onReset();
    setTimerState({
      phase: 'idle',
      displaySeconds: 0,
      runDuration: Duration.ZERO,
    });
  };

  // Tick while running; auto-stop on completion.
  useEffect(() => {
    if (!currentBlockStartTime) {
      setTimerState(compute());
      return;
    }
    const tick = () => {
      const state = compute();
      setTimerState(state);
      if (state.phase === 'completed' && !autoStoppedRef.current) {
        autoStoppedRef.current = true;
        onAutoComplete(state.runDuration, OffsetDateTime.now());
      }
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [currentBlockStartTime, compute, onAutoComplete]);

  // Persist accumulated duration every 5s while running so the timer survives reload.
  useEffect(() => {
    if (!currentBlockStartTime) return;
    const id = setTimeout(() => {
      const state = compute();
      if (state.phase === 'prep' || state.phase === 'completed') return;
      onPause(state.runDuration);
      onPlay();
    }, 5000);
    return () => clearTimeout(id);
  }, [currentBlockStartTime, compute, onPause, onPlay]);

  const phaseLabel = (() => {
    switch (timerState.phase) {
      case 'prep':
        return 'GET READY';
      case 'move':
        return 'MOVE';
      case 'pause':
        return 'PAUSE';
      case 'completed':
        return 'DONE';
      default:
        return ' ';
    }
  })();

  const phaseColor = (() => {
    switch (timerState.phase) {
      case 'move':
        return colors.green;
      case 'pause':
        return colors.amber;
      case 'completed':
        return colors.primary;
      case 'prep':
        return colors.tertiary;
      default:
        return colors.surfaceVariant;
    }
  })();

  return (
    <CardioTrackerCard onHold={handleReset}>
      <View
        style={{
          alignItems: 'center',
          gap: spacing[2],
          minWidth: 220,
          paddingVertical: spacing[2],
        }}
      >
        <View
          style={{
            backgroundColor: phaseColor,
            paddingHorizontal: spacing[3],
            paddingVertical: spacing[1],
            borderRadius: rounding.roundedRectangleRadius,
          }}
        >
          <SurfaceText font="text-base" color="onSurface">
            {phaseLabel}
          </SurfaceText>
        </View>
        <SurfaceText font="text-3xl">
          {formatDisplaySeconds(timerState.displaySeconds)}
        </SurfaceText>
        <SurfaceText font="text-2xs" color="onSurfaceVariant">
          / {formatDisplaySeconds(blueprint.maxDuration.seconds())}
        </SurfaceText>
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <IconButton
            icon={currentBlockStartTime ? 'pause' : 'playArrow'}
            animated
            size={playPauseButtonSize}
            disabled={isReadonly && !currentBlockStartTime}
            testID="keiser-timer-play-pause"
            onPress={handlePlayPause}
            containerColor={
              currentBlockStartTime ? colors.amber : colors.green
            }
            iconColor={
              currentBlockStartTime ? colors.onAmber : colors.onGreen
            }
            style={{ borderRadius: animatedRadius }}
            mode="contained-tonal"
          />
          <IconButton
            icon="replay"
            size={playPauseButtonSize}
            testID="keiser-timer-reset"
            onPress={handleReset}
            mode="contained-tonal"
          />
        </View>
      </View>
    </CardioTrackerCard>
  );
}

function formatDisplaySeconds(totalSeconds: number): string {
  const negative = totalSeconds < 0;
  const abs = Math.abs(totalSeconds);
  const minutes = Math.floor(abs / 60);
  const seconds = abs % 60;
  const sign = negative ? '-' : '';
  return `${sign}${minutes}:${seconds.toString().padStart(2, '0')}`;
}
