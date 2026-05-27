import { describe, expect, it } from 'vitest';
import { Duration, LocalDate, OffsetDateTime, ZoneOffset } from '@js-joda/core';
import BigNumber from 'bignumber.js';
import { SessionService } from '@/services/session-service';
import {
  KeiserExerciseBlueprint,
  KeiserExerciseSetBlueprint,
  KeyedExerciseBlueprint,
  Rest,
  SessionBlueprint,
  WeightedExerciseBlueprint,
} from '@/models/blueprint-models';
import {
  PotentialSet,
  RecordedKeiserExercise,
  RecordedKeiserExerciseSet,
  RecordedWeightedExercise,
  Session,
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

function makeService(
  useImperialUnits: boolean,
  workoutSession?: Session,
): SessionService {
  const fakeRepo = {
    getOrderedSessions: () => ({
      firstOrDefault: () => undefined,
    }),
  } as unknown as ProgressRepository;
  const state = {
    settings: { useImperialUnits },
    currentSession: { workoutSession: workoutSession?.toPOJO() },
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

describe('SessionService upcoming-session weight carryover', () => {
  function makeWeightedBlueprint(): SessionBlueprint {
    return SessionBlueprint.fromPOJO({
      name: 'Workout A',
      notes: '',
      exercises: [
        new WeightedExerciseBlueprint(
          'Squat',
          3,
          5,
          new BigNumber(2.5),
          Rest.medium,
          false,
          '',
          '',
        ).toPOJO(),
      ],
    });
  }

  function buildSession(
    blueprint: SessionBlueprint,
    weight: Weight,
  ): Session {
    const bp = blueprint.exercises[0] as WeightedExerciseBlueprint;
    return new Session(
      'session-1',
      blueprint,
      [
        new RecordedWeightedExercise(
          bp,
          Array.from(
            { length: bp.sets },
            () =>
              PotentialSet.fromPOJO({ weight, set: undefined }),
          ),
          undefined,
        ),
      ],
      LocalDate.of(2026, 5, 27),
      undefined,
    );
  }

  it('propagates current workout weight changes into upcoming previews even without completed sets', async () => {
    const blueprint = makeWeightedBlueprint();
    const bp = blueprint.exercises[0] as WeightedExerciseBlueprint;
    const key = KeyedExerciseBlueprint.fromExerciseBlueprint(bp).toString();

    // History: previous squat completed at 100kg → cached as latest.
    const historical = new RecordedWeightedExercise(
      bp,
      [
        PotentialSet.fromPOJO({
          weight: new Weight(new BigNumber(100), 'kilograms'),
          set: {
            type: 'RecordedSet',
            repsCompleted: 5,
            completionDateTime: OffsetDateTime.of(
              2026,
              5,
              20,
              10,
              0,
              0,
              0,
              ZoneOffset.UTC,
            ),
          },
        }),
        PotentialSet.fromPOJO({
          weight: new Weight(new BigNumber(100), 'kilograms'),
          set: {
            type: 'RecordedSet',
            repsCompleted: 5,
            completionDateTime: OffsetDateTime.of(
              2026,
              5,
              20,
              10,
              5,
              0,
              0,
              ZoneOffset.UTC,
            ),
          },
        }),
        PotentialSet.fromPOJO({
          weight: new Weight(new BigNumber(100), 'kilograms'),
          set: {
            type: 'RecordedSet',
            repsCompleted: 5,
            completionDateTime: OffsetDateTime.of(
              2026,
              5,
              20,
              10,
              10,
              0,
              0,
              ZoneOffset.UTC,
            ),
          },
        }),
      ],
      undefined,
    );

    // Active workout: user has just bumped weight to 120kg, hasn't completed
    // any set yet. This is the data that should drive the next preview.
    const currentSession = buildSession(
      blueprint,
      new Weight(new BigNumber(120), 'kilograms'),
    );

    const svc = makeService(false, currentSession);
    const upcoming: Session[] = [];
    for await (const s of svc.getUpcomingSessions(
      [blueprint],
      { [key]: historical },
    )) {
      upcoming.push(s);
      if (upcoming.length >= 1) break;
    }

    const nextEx = upcoming[0].recordedExercises[0] as RecordedWeightedExercise;
    // Since the current session has no completed sets it's not "successful",
    // so the next preview should carry the user-modified 120kg as-is.
    expect(nextEx.potentialSets[0].weight.value.toNumber()).toBe(120);
    expect(nextEx.potentialSets[1].weight.value.toNumber()).toBe(120);
    expect(nextEx.potentialSets[2].weight.value.toNumber()).toBe(120);
  });
});
