import { describe, expect, it } from 'vitest';
import { Duration, OffsetDateTime, ZoneOffset } from '@js-joda/core';
import BigNumber from 'bignumber.js';
import { SessionService } from '@/services/session-service';
import {
  KeiserExerciseBlueprint,
  KeiserExerciseSetBlueprint,
  KeyedExerciseBlueprint,
  SessionBlueprint,
} from '@/models/blueprint-models';
import {
  RecordedKeiserExercise,
  RecordedKeiserExerciseSet,
} from '@/models/session-models';
import { Weight } from '@/models/weight';
import type { RootState } from '@/store';
import type { ProgressRepository } from '@/services/progress-repository';

function makeBlueprint(name = 'Squat'): SessionBlueprint {
  const setBp = new KeiserExerciseSetBlueprint(
    Duration.ofMinutes(3),
    Duration.ofSeconds(5),
    Duration.ofSeconds(4),
    Duration.ofSeconds(2),
  );
  return SessionBlueprint.fromPOJO({
    name: 'Workout A',
    notes: '',
    exercises: [
      new KeiserExerciseBlueprint(name, [setBp, setBp], '', '', 'mmss').toPOJO(),
    ],
  });
}

function makeService(useImperialUnits: boolean): SessionService {
  const fakeRepo = {
    getOrderedSessions: () => ({
      firstOrDefault: () => undefined,
    }),
  } as unknown as ProgressRepository;
  const state = {
    settings: { useImperialUnits },
    currentSession: { workoutSession: undefined },
  } as unknown as RootState;
  return new SessionService(fakeRepo, () => state);
}

describe('SessionService keiser carryover', () => {
  it('carries weight from the previous keiser session into a new session', () => {
    const blueprint = makeBlueprint('Squat');
    const ex = blueprint.exercises[0] as KeiserExerciseBlueprint;
    const previous = new RecordedKeiserExercise(
      ex,
      [
        new RecordedKeiserExerciseSet(
          ex.sets[0],
          OffsetDateTime.of(2026, 5, 1, 12, 0, 0, 0, ZoneOffset.UTC),
          Duration.ofSeconds(120),
          new Weight(new BigNumber(15), 'kilograms'),
          undefined,
        ),
        new RecordedKeiserExerciseSet(
          ex.sets[1],
          OffsetDateTime.of(2026, 5, 1, 12, 5, 0, 0, ZoneOffset.UTC),
          Duration.ofSeconds(150),
          new Weight(new BigNumber(20), 'kilograms'),
          undefined,
        ),
      ],
      undefined,
    );
    const key = KeyedExerciseBlueprint.fromExerciseBlueprint(ex).toString();

    const svc = makeService(false);
    const session = svc.hydrateSessionFromBlueprint(blueprint, {
      [key]: previous,
    });

    const nextEx = session.recordedExercises[0] as RecordedKeiserExercise;
    expect(nextEx.sets[0].weight.value.toNumber()).toBe(15);
    expect(nextEx.sets[0].weight.unit).toBe('kilograms');
    expect(nextEx.sets[1].weight.value.toNumber()).toBe(20);
    // Previous duration / completion should NOT carry over.
    expect(nextEx.sets[0].duration).toBeUndefined();
    expect(nextEx.sets[0].completionDateTime).toBeUndefined();
  });

  it('falls back to default unit when previous weight has nil unit (older data)', () => {
    const blueprint = makeBlueprint();
    const ex = blueprint.exercises[0] as KeiserExerciseBlueprint;
    const previous = new RecordedKeiserExercise(
      ex,
      [
        new RecordedKeiserExerciseSet(
          ex.sets[0],
          OffsetDateTime.of(2026, 5, 1, 12, 0, 0, 0, ZoneOffset.UTC),
          Duration.ofSeconds(120),
          // Nil-unit weight from a session created before the weight feature
          new Weight(new BigNumber(0), 'nil'),
          undefined,
        ),
        new RecordedKeiserExerciseSet(
          ex.sets[1],
          undefined,
          undefined,
          new Weight(new BigNumber(0), 'nil'),
          undefined,
        ),
      ],
      undefined,
    );
    const key = KeyedExerciseBlueprint.fromExerciseBlueprint(ex).toString();

    const svc = makeService(true); // imperial → pounds
    const session = svc.hydrateSessionFromBlueprint(blueprint, {
      [key]: previous,
    });

    const nextEx = session.recordedExercises[0] as RecordedKeiserExercise;
    for (const set of nextEx.sets) {
      expect(set.weight.unit).toBe('pounds');
    }
  });

  it('uses default-unit zero weight when there is no previous exercise', () => {
    const blueprint = makeBlueprint();
    const svc = makeService(false);
    const session = svc.hydrateSessionFromBlueprint(blueprint, {});
    const nextEx = session.recordedExercises[0] as RecordedKeiserExercise;
    for (const set of nextEx.sets) {
      expect(set.weight.unit).toBe('kilograms');
      expect(set.weight.value.toNumber()).toBe(0);
    }
  });
});
