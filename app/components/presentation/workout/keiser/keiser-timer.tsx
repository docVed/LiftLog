import { CardioTrackerCard } from '@/components/presentation/workout/cardio/cardio-tracker-card';
import IconButton from '@/components/presentation/foundation/gesture-wrappers/icon-button';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { useAppTheme, spacing, rounding } from '@/hooks/useAppTheme';
import { RecordedKeiserExerciseSet } from '@/models/session-models';
import { Duration, OffsetDateTime } from '@js-joda/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAnimatedValue, Animated, View } from 'react-native';

export type KeiserPhase = 'idle' | 'prep' | 'move' | 'pause' | 'completed';

interface KeiserTimerState {
  phase: KeiserPhase;
  /** Display time (positive while running, negative during prep). Always seconds. */
  displaySeconds: number;
  /** Elapsed run-time (excluding prep), capped at maxDuration. */
  runDuration: Duration;
}

/**
 * Computes the timer state for a Keiser timer based on its blueprint and the
 * accumulated `recordedDuration` plus the start time of the currently running
 * block. Pure so we can unit-test it.
 */
export function computeKeiserTimerState({
  now,
  currentBlockStartTime,
  recordedDuration,
  prepDuration,
  maxDuration,
  moveDuration,
  pauseDuration,
}: {
  now: OffsetDateTime;
  currentBlockStartTime: OffsetDateTime | undefined;
  recordedDuration: Duration | undefined;
  prepDuration: Duration;
  maxDuration: Duration;
  moveDuration: Duration;
  pauseDuration: Duration;
}): KeiserTimerState {
  const accumulated = recordedDuration ?? Duration.ZERO;

  if (!currentBlockStartTime) {
    if (accumulated.isZero()) {
      return {
        phase: 'idle',
        displaySeconds: 0,
        runDuration: Duration.ZERO,
      };
    }
    if (accumulated.compareTo(maxDuration) >= 0) {
      return {
        phase: 'completed',
        displaySeconds: maxDuration.seconds(),
        runDuration: maxDuration,
      };
    }
    return {
      phase: 'pause',
      displaySeconds: accumulated.seconds(),
      runDuration: accumulated,
    };
  }

  const sinceBlockStart = Duration.between(currentBlockStartTime, now);
  // Prep counts down only when this is the first block (accumulated is zero).
  const prepRemaining = accumulated.isZero()
    ? prepDuration.minus(sinceBlockStart)
    : Duration.ZERO;

  if (prepRemaining.compareTo(Duration.ZERO) > 0) {
    return {
      phase: 'prep',
      displaySeconds: -Math.ceil(prepRemaining.toMillis() / 1000),
      runDuration: Duration.ZERO,
    };
  }

  const elapsedThisBlock = accumulated.isZero()
    ? sinceBlockStart.minus(prepDuration)
    : sinceBlockStart;
  const totalRun = accumulated.plus(
    elapsedThisBlock.isNegative() ? Duration.ZERO : elapsedThisBlock,
  );

  if (totalRun.compareTo(maxDuration) >= 0) {
    return {
      phase: 'completed',
      displaySeconds: maxDuration.seconds(),
      runDuration: maxDuration,
    };
  }

  const cycleSeconds = moveDuration.seconds() + pauseDuration.seconds();
  if (cycleSeconds <= 0) {
    return {
      phase: 'move',
      displaySeconds: totalRun.seconds(),
      runDuration: totalRun,
    };
  }
  const intoCycle = totalRun.seconds() % cycleSeconds;
  const phase: KeiserPhase =
    intoCycle < moveDuration.seconds() ? 'move' : 'pause';
  return {
    phase,
    displaySeconds: totalRun.seconds(),
    runDuration: totalRun,
  };
}

interface KeiserTimerProps {
  set: RecordedKeiserExerciseSet;
  currentBlockStartTime: OffsetDateTime | undefined;
  setCurrentBlockStartTime: (val: OffsetDateTime | undefined) => void;
  updateDuration: (duration: Duration | undefined) => void;
  setCompletionTime: (time: OffsetDateTime | undefined) => void;
  reset: () => void;
}

export function KeiserTimer({
  set,
  currentBlockStartTime,
  setCurrentBlockStartTime,
  updateDuration,
  setCompletionTime,
  reset,
}: KeiserTimerProps) {
  const playPauseButtonSize = 24;
  const { colors } = useAppTheme();
  const animatedRadius = useAnimatedValue(40);

  const compute = useCallback(
    (recorded: Duration | undefined) =>
      computeKeiserTimerState({
        now: OffsetDateTime.now(),
        currentBlockStartTime,
        recordedDuration: recorded,
        prepDuration: set.blueprint.prepDuration,
        maxDuration: set.blueprint.maxDuration,
        moveDuration: set.blueprint.moveDuration,
        pauseDuration: set.blueprint.pauseDuration,
      }),
    [currentBlockStartTime, set.blueprint],
  );

  const [timerState, setTimerState] = useState<KeiserTimerState>(() =>
    compute(set.duration),
  );
  // Track if we've already auto-stopped to avoid repeated dispatches.
  const autoStoppedRef = useRef(false);

  const handlePlay = () => {
    autoStoppedRef.current = false;
    setCurrentBlockStartTime(OffsetDateTime.now());
  };
  const handlePause = () => {
    if (!currentBlockStartTime) {
      return;
    }
    const now = OffsetDateTime.now();
    const state = computeKeiserTimerState({
      now,
      currentBlockStartTime,
      recordedDuration: set.duration,
      prepDuration: set.blueprint.prepDuration,
      maxDuration: set.blueprint.maxDuration,
      moveDuration: set.blueprint.moveDuration,
      pauseDuration: set.blueprint.pauseDuration,
    });
    setCurrentBlockStartTime(undefined);
    updateDuration(state.runDuration);
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
    reset();
    setTimerState({
      phase: 'idle',
      displaySeconds: 0,
      runDuration: Duration.ZERO,
    });
  };

  // Tick while running.
  useEffect(() => {
    if (!currentBlockStartTime) {
      setTimerState(compute(set.duration));
      return;
    }
    const tick = () => {
      const state = compute(set.duration);
      setTimerState(state);
      if (state.phase === 'completed' && !autoStoppedRef.current) {
        autoStoppedRef.current = true;
        const now = OffsetDateTime.now();
        setCurrentBlockStartTime(undefined);
        updateDuration(state.runDuration);
        setCompletionTime(now);
      }
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [
    currentBlockStartTime,
    compute,
    set.duration,
    setCurrentBlockStartTime,
    updateDuration,
    setCompletionTime,
  ]);

  // Persist accumulated duration every 5s while running so the timer survives reload.
  useEffect(() => {
    if (!currentBlockStartTime) return;
    const id = setTimeout(() => {
      const state = compute(set.duration);
      if (state.phase === 'prep' || state.phase === 'completed') return;
      setCurrentBlockStartTime(OffsetDateTime.now());
      updateDuration(state.runDuration);
    }, 5000);
    return () => clearTimeout(id);
  }, [
    currentBlockStartTime,
    compute,
    set.duration,
    setCurrentBlockStartTime,
    updateDuration,
  ]);

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
      <View style={{ alignItems: 'center', gap: spacing[2], minWidth: 180 }}>
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
        <SurfaceText font="text-2xl">
          {formatDisplaySeconds(timerState.displaySeconds)}
        </SurfaceText>
        <SurfaceText font="text-2xs" color="onSurfaceVariant">
          / {formatDisplaySeconds(set.blueprint.maxDuration.seconds())}
        </SurfaceText>
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          <IconButton
            icon={currentBlockStartTime ? 'pause' : 'playArrow'}
            animated
            size={playPauseButtonSize}
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
