import IconButton from '@/components/presentation/foundation/gesture-wrappers/icon-button';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { useAppTheme, spacing, rounding } from '@/hooks/useAppTheme';
import {
  KeiserDisplayFormat,
  KeiserExerciseSetBlueprint,
} from '@/models/blueprint-models';
import { formatKeiserSeconds } from '@/components/presentation/workout/keiser/keiser-format';
import { Duration, OffsetDateTime } from '@js-joda/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAnimatedValue, Animated, View } from 'react-native';
import {
  computeKeiserTimerState,
  KeiserTimerState,
} from '@/components/presentation/workout/keiser/keiser-timer-state';

interface KeiserTimerProps {
  blueprint: KeiserExerciseSetBlueprint;
  displayFormat: KeiserDisplayFormat;
  recordedDuration: Duration | undefined;
  currentBlockStartTime: OffsetDateTime | undefined;
  isReadonly: boolean;
  onPlay: () => void;
  onPause: (accumulatedDuration: Duration) => void;
  onStop: (
    accumulatedDuration: Duration,
    completionTime: OffsetDateTime,
  ) => void;
  onAutoComplete: (
    accumulatedDuration: Duration,
    completionTime: OffsetDateTime,
  ) => void;
  onReset: () => void;
  onPhaseColor?: (color: string) => void;
}

export function KeiserTimer({
  blueprint,
  displayFormat,
  recordedDuration,
  currentBlockStartTime,
  isReadonly,
  onPlay,
  onPause,
  onStop,
  onAutoComplete,
  onReset,
  onPhaseColor,
}: KeiserTimerProps) {
  const playPauseButtonSize = 48;
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

  const handleStop = () => {
    autoStoppedRef.current = true;
    const state = compute();
    // Don't mark complete if we're still in prep — nothing to save.
    if (state.phase === 'prep' || state.phase === 'idle') {
      return;
    }
    onStop(state.runDuration, OffsetDateTime.now());
  };

  const canStop =
    !isReadonly &&
    timerState.phase !== 'idle' &&
    timerState.phase !== 'prep' &&
    timerState.phase !== 'completed';

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

  const phaseColor = isReadonly
    ? colors.surfaceVariant
    : (() => {
        switch (timerState.phase) {
          case 'move':
            return colors.green;
          case 'pause':
            return colors.amber;
          case 'prep':
            return colors.tertiary;
          default:
            return colors.surfaceVariant;
        }
      })();

  useEffect(() => {
    onPhaseColor?.(phaseColor);
  }, [phaseColor, onPhaseColor]);

  return (
    <View
      style={{
        alignItems: 'center',
        gap: spacing[2],
        paddingVertical: spacing[6],
        paddingHorizontal: spacing[4],
      }}
    >
      <SurfaceText font="text-3xl" color="onSurface">
        {phaseLabel}
      </SurfaceText>
      <SurfaceText font="text-4xl">
        {formatKeiserSeconds(timerState.displaySeconds, displayFormat)}
      </SurfaceText>
      <SurfaceText font="text-2xs" color="onSurfaceVariant">
        / {formatKeiserSeconds(blueprint.maxDuration.seconds(), displayFormat)}
      </SurfaceText>
      <View style={{ flexDirection: 'row', gap: spacing[3] }}>
        <IconButton
          icon={currentBlockStartTime ? 'pause' : 'playArrow'}
          animated
          size={playPauseButtonSize}
          disabled={isReadonly && !currentBlockStartTime}
          testID="keiser-timer-play-pause"
          onPress={handlePlayPause}
          containerColor={currentBlockStartTime ? colors.amber : colors.green}
          iconColor={currentBlockStartTime ? colors.onAmber : colors.onGreen}
          style={{ borderRadius: animatedRadius }}
          mode="contained-tonal"
        />
        <IconButton
          icon="stop"
          size={playPauseButtonSize}
          disabled={!canStop}
          testID="keiser-timer-stop"
          onPress={handleStop}
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
  );
}
