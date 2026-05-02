import { Duration, OffsetDateTime } from '@js-joda/core';

export type KeiserPhase = 'idle' | 'prep' | 'move' | 'pause' | 'completed';

export interface KeiserTimerState {
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
