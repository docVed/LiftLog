import { RecordedKeiserExercise } from '@/models/session-models';
import ExerciseSection from '@/components/presentation/workout/exercise-section';
import { Duration, OffsetDateTime } from '@js-joda/core';
import { View } from 'react-native';
import { spacing } from '@/hooks/useAppTheme';
import { KeiserTimer } from '@/components/presentation/workout/keiser/keiser-timer';
import KeiserSetCounter from '@/components/presentation/workout/keiser/keiser-set-counter';
import { useCallback } from 'react';
import { Weight } from '@/models/weight';
import { WeightAppliesTo } from '@/store/current-session';

type KeiserSetCallback<T> = (value: T, setIndex: number) => void;

interface KeiserExerciseProps {
  recordedExercise: RecordedKeiserExercise;
  previousRecordedExercises: RecordedKeiserExercise[];
  toStartNext: boolean;
  isReadonly: boolean;
  showPreviousButton: boolean;

  setCurrentBlockStartTime: KeiserSetCallback<OffsetDateTime | undefined>;
  updateDuration: KeiserSetCallback<Duration | undefined>;
  setCompletionTime: KeiserSetCallback<OffsetDateTime | undefined>;
  updateWeight: (
    setIndex: number,
    weight: Weight,
    applyTo: WeightAppliesTo,
  ) => void;
  resetSet: (setIndex: number) => void;

  updateNotesForExercise: (notes: string) => void;
  onOpenLink: () => void;
  onEditExercise: () => void;
  onRemoveExercise: () => void;
}

export function KeiserExercise(props: KeiserExerciseProps) {
  const { recordedExercise } = props;
  const activeIndex = recordedExercise.sets.findIndex(
    (s) => !s.isCompletelyFilled,
  );
  // When all sets are completed, expose the last set so the timer still has a
  // blueprint to render (DONE state) but the play button stays disabled.
  const timerSetIndex =
    activeIndex >= 0 ? activeIndex : recordedExercise.sets.length - 1;
  const timerSet = recordedExercise.sets[timerSetIndex];
  const allDone = activeIndex < 0;

  const handlePlay = useCallback(() => {
    props.setCurrentBlockStartTime(OffsetDateTime.now(), timerSetIndex);
  }, [props, timerSetIndex]);

  const handlePause = useCallback(
    (accumulatedDuration: Duration) => {
      props.setCurrentBlockStartTime(undefined, timerSetIndex);
      props.updateDuration(accumulatedDuration, timerSetIndex);
    },
    [props, timerSetIndex],
  );

  const handleAutoComplete = useCallback(
    (accumulatedDuration: Duration, completionTime: OffsetDateTime) => {
      props.setCurrentBlockStartTime(undefined, timerSetIndex);
      props.updateDuration(accumulatedDuration, timerSetIndex);
      props.setCompletionTime(completionTime, timerSetIndex);
    },
    [props, timerSetIndex],
  );

  const handleReset = useCallback(() => {
    props.resetSet(timerSetIndex);
  }, [props, timerSetIndex]);

  return (
    <ExerciseSection
      recordedExercise={recordedExercise}
      previousRecordedExercises={props.previousRecordedExercises}
      toStartNext={props.toStartNext}
      isReadonly={props.isReadonly}
      showPreviousButton={props.showPreviousButton}
      updateNotesForExercise={props.updateNotesForExercise}
      onOpenLink={props.onOpenLink}
      onEditExercise={props.onEditExercise}
      onRemoveExercise={props.onRemoveExercise}
    >
      <View style={{ gap: spacing[4] }}>
        <KeiserTimer
          blueprint={timerSet.blueprint}
          recordedDuration={timerSet.duration}
          currentBlockStartTime={timerSet.currentBlockStartTime}
          isReadonly={props.isReadonly || allDone}
          onPlay={handlePlay}
          onPause={handlePause}
          onAutoComplete={handleAutoComplete}
          onReset={handleReset}
        />
        <View
          style={{ flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' }}
        >
          {recordedExercise.sets.map((set, index) => (
            <KeiserSetCounter
              key={index}
              set={set}
              isActive={index === timerSetIndex}
              isReadonly={props.isReadonly}
              onUpdateWeight={(w, applyTo) =>
                props.updateWeight(index, w, applyTo)
              }
              onReset={() => props.resetSet(index)}
            />
          ))}
        </View>
      </View>
    </ExerciseSection>
  );
}
