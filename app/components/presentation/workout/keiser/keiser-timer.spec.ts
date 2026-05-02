import { describe, expect, it } from 'vitest';
import { Duration, OffsetDateTime, ZoneOffset } from '@js-joda/core';
import { computeKeiserTimerState } from './keiser-timer-state';

const epoch = OffsetDateTime.of(2026, 1, 1, 12, 0, 0, 0, ZoneOffset.UTC);

const blueprint = {
  prepDuration: Duration.ofSeconds(5),
  maxDuration: Duration.ofMinutes(3),
  moveDuration: Duration.ofSeconds(4),
  pauseDuration: Duration.ofSeconds(2),
};

function at(secondsFromEpoch: number): OffsetDateTime {
  return epoch.plusSeconds(secondsFromEpoch);
}

describe('computeKeiserTimerState', () => {
  it('returns idle when nothing has started', () => {
    const state = computeKeiserTimerState({
      now: epoch,
      currentBlockStartTime: undefined,
      recordedDuration: undefined,
      ...blueprint,
    });
    expect(state.phase).toBe('idle');
    expect(state.displaySeconds).toBe(0);
    expect(state.runDuration.toMillis()).toBe(0);
  });

  it('returns prep with negative seconds during prep window', () => {
    const state = computeKeiserTimerState({
      now: at(2),
      currentBlockStartTime: epoch,
      recordedDuration: undefined,
      ...blueprint,
    });
    expect(state.phase).toBe('prep');
    expect(state.displaySeconds).toBeLessThan(0);
    expect(state.runDuration.toMillis()).toBe(0);
  });

  it('starts moving once prep elapses (totalRun=0 → MOVE phase)', () => {
    const state = computeKeiserTimerState({
      now: at(5),
      currentBlockStartTime: epoch,
      recordedDuration: undefined,
      ...blueprint,
    });
    expect(state.phase).toBe('move');
    expect(state.displaySeconds).toBe(0);
  });

  it('alternates to pause after the move window', () => {
    // 5s prep + 4s move = 9s total since block start
    const state = computeKeiserTimerState({
      now: at(9),
      currentBlockStartTime: epoch,
      recordedDuration: undefined,
      ...blueprint,
    });
    expect(state.phase).toBe('pause');
    expect(state.displaySeconds).toBe(4);
  });

  it('returns to move after move+pause cycle completes', () => {
    // 5s prep + 6s cycle = 11s
    const state = computeKeiserTimerState({
      now: at(11),
      currentBlockStartTime: epoch,
      recordedDuration: undefined,
      ...blueprint,
    });
    expect(state.phase).toBe('move');
    expect(state.displaySeconds).toBe(6);
  });

  it('auto-stops at max duration', () => {
    // 5s prep + 180s = 185s since block start
    const state = computeKeiserTimerState({
      now: at(185),
      currentBlockStartTime: epoch,
      recordedDuration: undefined,
      ...blueprint,
    });
    expect(state.phase).toBe('completed');
    expect(state.runDuration.equals(Duration.ofSeconds(180))).toBe(true);
  });

  it('skips prep when resuming with accumulated duration', () => {
    const state = computeKeiserTimerState({
      now: at(2),
      currentBlockStartTime: epoch,
      recordedDuration: Duration.ofSeconds(10),
      ...blueprint,
    });
    // 10 + 2 = 12s total run, into cycle = 12 % 6 = 0 → move
    expect(state.phase).toBe('move');
    expect(state.displaySeconds).toBe(12);
  });

  it('shows pause when timer is paused mid-run', () => {
    const state = computeKeiserTimerState({
      now: at(0),
      currentBlockStartTime: undefined,
      recordedDuration: Duration.ofSeconds(45),
      ...blueprint,
    });
    expect(state.phase).toBe('pause');
    expect(state.displaySeconds).toBe(45);
  });

  it('shows completed when paused at or above max', () => {
    const state = computeKeiserTimerState({
      now: at(0),
      currentBlockStartTime: undefined,
      recordedDuration: Duration.ofMinutes(3),
      ...blueprint,
    });
    expect(state.phase).toBe('completed');
  });
});
