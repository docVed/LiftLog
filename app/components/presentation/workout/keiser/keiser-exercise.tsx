import {
  RecordedKeiserExercise,
  RecordedKeiserExerciseSet,
} from '@/models/session-models';
import ExerciseSection from '@/components/presentation/workout/exercise-section';
import { Duration, OffsetDateTime } from '@js-joda/core';
import { View } from 'react-native';
import { spacing } from '@/hooks/useAppTheme';
import { KeiserTimer } from '@/components/presentation/workout/keiser/keiser-timer';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';

type KeiserCallback<T> = (value: T, setIndex: number) => void;

interface KeiserExerciseProps {
  recordedExercise: RecordedKeiserExercise;
  previousRecordedExercises: RecordedKeiserExercise[];
  toStartNext: boolean;
  isReadonly: boolean;
  showPreviousButton: boolean;

  setCurrentBlockStartTime: KeiserCallback<OffsetDateTime | undefined>;
  updateDuration: KeiserCallback<Duration | undefined>;
  setCompletionTime: KeiserCallback<OffsetDateTime | undefined>;
  resetSet: (setIndex: number) => void;

  updateNotesForExercise: (notes: string) => void;
  onOpenLink: () => void;
  onEditExercise: () => void;
  onRemoveExercise: () => void;
}

export function KeiserExercise(props: KeiserExerciseProps) {
  return (
    <ExerciseSection
      recordedExercise={props.recordedExercise}
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
        {props.recordedExercise.sets.map((set, setIndex) => (
          <KeiserExerciseSet
            key={setIndex}
            set={set}
            setIndex={setIndex}
            setCurrentBlockStartTime={(value) =>
              props.setCurrentBlockStartTime(value, setIndex)
            }
            updateDuration={(value) => props.updateDuration(value, setIndex)}
            setCompletionTime={(value) =>
              props.setCompletionTime(value, setIndex)
            }
            reset={() => props.resetSet(setIndex)}
          />
        ))}
      </View>
    </ExerciseSection>
  );
}

function KeiserExerciseSet({
  set,
  setIndex,
  setCurrentBlockStartTime,
  updateDuration,
  setCompletionTime,
  reset,
}: {
  set: RecordedKeiserExerciseSet;
  setIndex: number;
  setCurrentBlockStartTime: (val: OffsetDateTime | undefined) => void;
  updateDuration: (val: Duration | undefined) => void;
  setCompletionTime: (val: OffsetDateTime | undefined) => void;
  reset: () => void;
}) {
  return (
    <View style={{ gap: spacing[2], alignItems: 'flex-start' }}>
      <SurfaceText font="text-sm" color="onSurfaceVariant">
        Set {setIndex + 1}
      </SurfaceText>
      <KeiserTimer
        set={set}
        currentBlockStartTime={set.currentBlockStartTime}
        setCurrentBlockStartTime={setCurrentBlockStartTime}
        updateDuration={updateDuration}
        setCompletionTime={setCompletionTime}
        reset={reset}
      />
    </View>
  );
}
