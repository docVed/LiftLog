import { RecordedKeiserExercise } from '@/models/session-models';
import ExerciseSection from '@/components/presentation/workout/exercise-section';
import { Duration, OffsetDateTime } from '@js-joda/core';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rounding, spacing, useAppTheme } from '@/hooks/useAppTheme';
import { KeiserTimer } from '@/components/presentation/workout/keiser/keiser-timer';
import KeiserSetCounter from '@/components/presentation/workout/keiser/keiser-set-counter';
import { useCallback, useState } from 'react';
import { Weight } from '@/models/weight';
import { WeightAppliesTo } from '@/store/current-session';
import { Modal, Portal } from 'react-native-paper';

// Approximate height of react-native-paper's BottomNavigation.Bar with labels.
// The bar adds insets.bottom on top of this for safe-area padding.
const BOTTOM_TAB_BAR_HEIGHT = 80;
const PHASE_BAR_THICKNESS = 32;

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
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [timerSetIndex, setTimerSetIndex] = useState<number | null>(null);
  const [timerPhaseColor, setTimerPhaseColor] = useState(colors.surfaceVariant);
  const timerOpen = timerSetIndex !== null;
  const timerSet =
    timerSetIndex !== null ? recordedExercise.sets[timerSetIndex] : null;

  const handlePlay = useCallback(() => {
    if (timerSetIndex === null) return;
    props.setCurrentBlockStartTime(OffsetDateTime.now(), timerSetIndex);
  }, [props, timerSetIndex]);

  const handlePause = useCallback(
    (accumulatedDuration: Duration) => {
      if (timerSetIndex === null) return;
      props.setCurrentBlockStartTime(undefined, timerSetIndex);
      props.updateDuration(accumulatedDuration, timerSetIndex);
    },
    [props, timerSetIndex],
  );

  const handleComplete = useCallback(
    (accumulatedDuration: Duration, completionTime: OffsetDateTime) => {
      if (timerSetIndex === null) return;
      props.setCurrentBlockStartTime(undefined, timerSetIndex);
      props.updateDuration(accumulatedDuration, timerSetIndex);
      props.setCompletionTime(completionTime, timerSetIndex);
    },
    [props, timerSetIndex],
  );

  const handleStop = useCallback(
    (accumulatedDuration: Duration, completionTime: OffsetDateTime) => {
      handleComplete(accumulatedDuration, completionTime);
      setTimeout(() => setTimerSetIndex(null), 1000);
    },
    [handleComplete],
  );

  const handleReset = useCallback(() => {
    if (timerSetIndex === null) return;
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
      <View style={{ flexDirection: 'row', gap: spacing[2], flexWrap: 'wrap' }}>
        {recordedExercise.sets.map((set, index) => (
          <KeiserSetCounter
            key={index}
            set={set}
            displayFormat={recordedExercise.blueprint.displayFormat}
            isActive={set.currentBlockStartTime !== undefined}
            isReadonly={props.isReadonly}
            onPress={() => setTimerSetIndex(index)}
            onUpdateWeight={(w, applyTo) =>
              props.updateWeight(index, w, applyTo)
            }
            onReset={() => props.resetSet(index)}
          />
        ))}
      </View>
      <Portal>
        {timerOpen && (
          <>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: insets.top,
                left: 0,
                right: 0,
                height: PHASE_BAR_THICKNESS,
                backgroundColor: timerPhaseColor,
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                bottom: BOTTOM_TAB_BAR_HEIGHT + insets.bottom,
                left: 0,
                right: 0,
                height: PHASE_BAR_THICKNESS,
                backgroundColor: timerPhaseColor,
              }}
            />
          </>
        )}
        <Modal
          visible={timerOpen}
          onDismiss={() => setTimerSetIndex(null)}
          contentContainerStyle={{
            margin: spacing[6],
            borderRadius: rounding.roundedRectangleRadius,
            backgroundColor: timerPhaseColor,
          }}
        >
          {timerSet !== null && (
            <KeiserTimer
              key={timerSetIndex}
              blueprint={timerSet.blueprint}
              displayFormat={recordedExercise.blueprint.displayFormat}
              recordedDuration={timerSet.duration}
              currentBlockStartTime={timerSet.currentBlockStartTime}
              isReadonly={props.isReadonly}
              isCompleted={timerSet.isCompletelyFilled}
              onPlay={handlePlay}
              onPause={handlePause}
              onStop={handleStop}
              onAutoComplete={handleComplete}
              onReset={handleReset}
              onPhaseColor={setTimerPhaseColor}
            />
          )}
        </Modal>
      </Portal>
    </ExerciseSection>
  );
}
