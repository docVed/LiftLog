import { LiftLog } from '@/gen/proto';
import { Session } from '@/models/session-models';
import {
  fromDurationDao,
  fromTimestampDao,
} from '@/models/storage/conversions.from-dao';
import {
  toDurationDao,
  toTimestampDao,
} from '@/models/storage/conversions.to-dao';
import { Duration, Instant } from '@js-joda/core';
import { match } from 'ts-pattern';

const DaoType = LiftLog.Ui.Models.WorkoutMessage;
type DaoType = typeof LiftLog.Ui.Models.WorkoutMessage;

/**
 * A reflection of the WorkoutMessage Protobuf types.
 * Note that they do NOT need to match 1:1, some events have derived data which we have pre calculated in JS transmitted over the wire
 */
export type WorkoutMessage =
  | WorkoutStartedEvent
  | WorkoutUpdatedEvent
  | WorkoutEndedEvent
  | FinishWorkoutCommand;

export interface WorkoutStartedEvent {
  type: 'WorkoutStartedEvent';
}

export interface WorkoutUpdatedEvent {
  type: 'WorkoutUpdatedEvent';
  workout: Session;
  restTimerInfo: RestTimerInfo | undefined;
  cardioTimerInfo: CardioTimerInfo | undefined;
  keiserTimerInfo: KeiserTimerInfo | undefined;
}

export interface CardioTimerInfo {
  currentDuration: Duration;
  currentBlockStartTime: Instant | undefined;
  exerciseIndex: number;
  setIndex: number;
}

export interface KeiserTimerInfo {
  currentDuration: Duration;
  currentBlockStartTime: Instant | undefined;
  prepDuration: Duration;
  maxDuration: Duration;
  moveDuration: Duration;
  pauseDuration: Duration;
  exerciseIndex: number;
  setIndex: number;
}

export interface RestTimerInfo {
  startedAt: Instant;
  partiallyEndAt: Instant;
  endAt: Instant;
}

export interface WorkoutEndedEvent {
  type: 'WorkoutEndedEvent';
}

export interface FinishWorkoutCommand {
  type: 'FinishWorkoutCommand';
}

export function toWorkoutMessageDao(
  message: WorkoutMessage,
  appConfiguration: LiftLog.Ui.Models.WorkoutMessage.AppConfiguration,
  translations: LiftLog.Ui.Models.WorkoutMessage.Translations,
): LiftLog.Ui.Models.WorkoutMessage.WorkoutMessage {
  const messageWithoutTranslation = match(message)
    .returnType<WorkoutMessageWithoutTranslation>()
    .with({ type: 'WorkoutStartedEvent' }, () =>
      createMessage(
        'workoutStartedEvent',
        DaoType.WorkoutStartedEvent.create({}),
      ),
    )
    .with({ type: 'WorkoutUpdatedEvent' }, (e) =>
      createMessage(
        'workoutUpdatedEvent',
        DaoType.WorkoutUpdatedEvent.create({
          workout: e.workout.toDao(),
          currentExerciseDetails: e.workout.nextExercise
            ? {
                exercise: e.workout.nextExercise.toDao(),
                setIndex: e.workout.nextExercise.currentSetIndex,
              }
            : null,
          restTimerInfo: e.restTimerInfo
            ? {
                startedAt: toTimestampDao(e.restTimerInfo.startedAt),
                partiallyEndAt: toTimestampDao(e.restTimerInfo.partiallyEndAt),
                endAt: toTimestampDao(e.restTimerInfo.endAt),
              }
            : null,
          cardioTimerInfo: e.cardioTimerInfo
            ? {
                currentDuration: toDurationDao(
                  e.cardioTimerInfo.currentDuration,
                ),
                currentBlockStartTime: e.cardioTimerInfo.currentBlockStartTime
                  ? toTimestampDao(e.cardioTimerInfo.currentBlockStartTime)
                  : null,
                exerciseIndex: e.cardioTimerInfo.exerciseIndex,
                setIndex: e.cardioTimerInfo.setIndex,
              }
            : null,
          keiserTimerInfo: e.keiserTimerInfo
            ? {
                currentDuration: toDurationDao(
                  e.keiserTimerInfo.currentDuration,
                ),
                currentBlockStartTime: e.keiserTimerInfo.currentBlockStartTime
                  ? toTimestampDao(e.keiserTimerInfo.currentBlockStartTime)
                  : null,
                prepDuration: toDurationDao(e.keiserTimerInfo.prepDuration),
                maxDuration: toDurationDao(e.keiserTimerInfo.maxDuration),
                moveDuration: toDurationDao(e.keiserTimerInfo.moveDuration),
                pauseDuration: toDurationDao(e.keiserTimerInfo.pauseDuration),
                exerciseIndex: e.keiserTimerInfo.exerciseIndex,
                setIndex: e.keiserTimerInfo.setIndex,
              }
            : null,
          totalWeightLifted: e.workout.totalWeightLifted.toDao(),
          workoutDuration: toDurationDao(e.workout.duration ?? Duration.ZERO),
        }),
      ),
    )
    .with({ type: 'WorkoutEndedEvent' }, () =>
      createMessage('workoutEndedEvent', DaoType.WorkoutEndedEvent.create({})),
    )
    .with({ type: 'FinishWorkoutCommand' }, () =>
      createMessage(
        'finishWorkoutCommand',
        DaoType.FinishWorkoutCommand.create({}),
      ),
    )
    .exhaustive();

  return DaoType.WorkoutMessage.create({
    ...messageWithoutTranslation,
    translations,
    appConfiguration,
  });
}

export function fromWorkoutMessageDao(
  event: LiftLog.Ui.Models.WorkoutMessage.WorkoutMessage,
): WorkoutMessage {
  return match(event.payload)
    .returnType<WorkoutMessage>()
    .with('workoutStartedEvent', () => ({
      type: 'WorkoutStartedEvent',
    }))
    .with('workoutUpdatedEvent', () => ({
      type: 'WorkoutUpdatedEvent',
      workout: Session.fromDao(event.workoutUpdatedEvent!.workout),
      restTimerInfo: event.workoutUpdatedEvent?.restTimerInfo
        ? {
            startedAt: fromTimestampDao(
              event.workoutUpdatedEvent.restTimerInfo.startedAt,
            ),
            partiallyEndAt: fromTimestampDao(
              event.workoutUpdatedEvent.restTimerInfo.partiallyEndAt,
            ),
            endAt: fromTimestampDao(
              event.workoutUpdatedEvent.restTimerInfo.endAt,
            ),
          }
        : undefined,
      cardioTimerInfo: event.workoutUpdatedEvent?.cardioTimerInfo
        ? {
            currentBlockStartTime: event.workoutUpdatedEvent.cardioTimerInfo
              .currentBlockStartTime
              ? fromTimestampDao(
                  event.workoutUpdatedEvent.cardioTimerInfo
                    .currentBlockStartTime,
                )
              : undefined,
            currentDuration: fromDurationDao(
              event.workoutUpdatedEvent.cardioTimerInfo.currentBlockStartTime,
            )!,
            exerciseIndex:
              event.workoutUpdatedEvent.cardioTimerInfo.exerciseIndex!,
            setIndex: event.workoutUpdatedEvent.cardioTimerInfo.setIndex!,
          }
        : undefined,
      keiserTimerInfo: event.workoutUpdatedEvent?.keiserTimerInfo
        ? {
            currentBlockStartTime: event.workoutUpdatedEvent.keiserTimerInfo
              .currentBlockStartTime
              ? fromTimestampDao(
                  event.workoutUpdatedEvent.keiserTimerInfo
                    .currentBlockStartTime,
                )
              : undefined,
            currentDuration:
              fromDurationDao(
                event.workoutUpdatedEvent.keiserTimerInfo.currentDuration,
              ) ?? Duration.ZERO,
            prepDuration:
              fromDurationDao(
                event.workoutUpdatedEvent.keiserTimerInfo.prepDuration,
              ) ?? Duration.ZERO,
            maxDuration:
              fromDurationDao(
                event.workoutUpdatedEvent.keiserTimerInfo.maxDuration,
              ) ?? Duration.ZERO,
            moveDuration:
              fromDurationDao(
                event.workoutUpdatedEvent.keiserTimerInfo.moveDuration,
              ) ?? Duration.ZERO,
            pauseDuration:
              fromDurationDao(
                event.workoutUpdatedEvent.keiserTimerInfo.pauseDuration,
              ) ?? Duration.ZERO,
            exerciseIndex:
              event.workoutUpdatedEvent.keiserTimerInfo.exerciseIndex!,
            setIndex: event.workoutUpdatedEvent.keiserTimerInfo.setIndex!,
          }
        : undefined,
    }))
    .with('workoutEndedEvent', () => ({
      type: 'WorkoutEndedEvent',
    }))
    .with('finishWorkoutCommand', () => ({ type: 'FinishWorkoutCommand' }))
    .with(undefined, () => {
      throw new Error('Malformed WorkoutEvent, undefined');
    })
    .exhaustive();
}

type WorkoutMessageWithoutTranslation = Omit<
  LiftLog.Ui.Models.WorkoutMessage.IWorkoutMessage,
  'translations'
>;

function createMessage<
  T extends keyof LiftLog.Ui.Models.WorkoutMessage.IWorkoutMessage,
>(
  type: T,
  value: LiftLog.Ui.Models.WorkoutMessage.IWorkoutMessage[T],
): WorkoutMessageWithoutTranslation {
  return { [type]: value };
}
