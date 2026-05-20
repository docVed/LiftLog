import IconButton from '@/components/presentation/foundation/gesture-wrappers/icon-button';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { useAppTheme, spacing, rounding } from '@/hooks/useAppTheme';
import {
  KeiserDisplayFormat,
  KeiserExerciseSetBlueprint,
} from '@/models/blueprint-models';
import {
  formatKeiserSeconds,
  formatKeiserSecondsForEdit,
  parseKeiserEditedSeconds,
} from '@/components/presentation/workout/keiser/keiser-format';
import { Duration, OffsetDateTime } from '@js-joda/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAnimatedValue, Animated, Pressable, View } from 'react-native';
import { Dialog, Portal, TextInput } from 'react-native-paper';
import Button from '@/components/presentation/foundation/gesture-wrappers/button';
import ConfirmationDialog from '@/components/presentation/foundation/confirmation-dialog';
import {
  computeKeiserTimerState,
  KeiserTimerState,
} from '@/components/presentation/workout/keiser/keiser-timer-state';

interface KeiserTimerProps {
  blueprint: KeiserExerciseSetBlueprint;
  displayFormat: KeiserDisplayFormat;
  recordedDuration: Duration | undefined;
  currentBlockStartTime: OffsetDateTime | undefined;
  /** Parent-level read-only (e.g. viewing past sessions). Blocks all edits. */
  isReadonly: boolean;
  /** This set has been finished. Blocks play/pause/stop, but reset and
   *  manual time editing are still allowed so the user can correct mistakes. */
  isCompleted?: boolean;
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
  isCompleted = false,
  onPlay,
  onPause,
  onStop,
  onAutoComplete,
  onReset,
  onPhaseColor,
}: KeiserTimerProps) {
  const actionsLocked = isReadonly || isCompleted;
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
  const [editTimeOpen, setEditTimeOpen] = useState(false);
  const [editTimeText, setEditTimeText] = useState('');
  const [editTimeError, setEditTimeError] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

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

  const handleResetRequest = () => {
    // No need to confirm a reset when there's nothing to lose.
    if (timerState.phase === 'idle') {
      handleReset();
      return;
    }
    setConfirmResetOpen(true);
  };

  const handleConfirmReset = () => {
    setConfirmResetOpen(false);
    handleReset();
  };

  const canEditTime = !currentBlockStartTime && !isReadonly;

  const handleOpenEditTime = () => {
    if (!canEditTime) return;
    setEditTimeText(
      formatKeiserSecondsForEdit(
        timerState.runDuration.seconds(),
        displayFormat,
      ),
    );
    setEditTimeError(false);
    setEditTimeOpen(true);
  };

  const handleSaveEditTime = () => {
    const parsed = parseKeiserEditedSeconds(editTimeText);
    if (parsed === undefined) {
      setEditTimeError(true);
      return;
    }
    const maxSeconds = blueprint.maxDuration.seconds();
    const capped = Math.min(parsed, maxSeconds);
    autoStoppedRef.current = false;
    onPause(Duration.ofSeconds(capped));
    setEditTimeOpen(false);
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
    !actionsLocked &&
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

  const phaseColor = actionsLocked
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
      <Pressable
        testID="keiser-timer-time"
        onPress={handleOpenEditTime}
        accessibilityRole={canEditTime ? 'button' : undefined}
        accessibilityHint={canEditTime ? 'Tap to edit time' : undefined}
        style={{
          alignItems: 'center',
          paddingHorizontal: spacing[3],
          paddingVertical: spacing[1],
          borderRadius: 6,
          borderBottomWidth: canEditTime ? 1 : 0,
          borderBottomColor: colors.onSurfaceVariant,
          borderStyle: 'dashed',
          opacity: canEditTime ? 1 : 0.95,
        }}
      >
        <SurfaceText font="text-4xl">
          {formatKeiserSeconds(timerState.displaySeconds, displayFormat)}
        </SurfaceText>
      </Pressable>
      <SurfaceText font="text-2xs" color="onSurfaceVariant">
        / {formatKeiserSeconds(blueprint.maxDuration.seconds(), displayFormat)}
      </SurfaceText>
      <View style={{ flexDirection: 'row', gap: spacing[3] }}>
        <IconButton
          icon={currentBlockStartTime ? 'pause' : 'playArrow'}
          animated
          size={playPauseButtonSize}
          disabled={actionsLocked && !currentBlockStartTime}
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
          onPress={handleResetRequest}
          mode="contained-tonal"
        />
      </View>
      <ConfirmationDialog
        open={confirmResetOpen}
        headline="Reset timer?"
        textContent="The recorded time for this set will be cleared."
        okText="Reset"
        onOk={handleConfirmReset}
        onCancel={() => setConfirmResetOpen(false)}
      />
      <Portal>
        <Dialog visible={editTimeOpen} onDismiss={() => setEditTimeOpen(false)}>
          <Dialog.Title>Edit time</Dialog.Title>
          <Dialog.Content>
            <TextInput
              testID="keiser-timer-edit-time-input"
              mode="outlined"
              autoFocus
              selectTextOnFocus
              keyboardType={
                displayFormat === 'seconds' ? 'number-pad' : 'default'
              }
              inputMode={displayFormat === 'seconds' ? 'numeric' : 'text'}
              placeholder={displayFormat === 'seconds' ? 'seconds' : 'm:ss'}
              value={editTimeText}
              onChangeText={(t) => {
                setEditTimeText(t);
                if (editTimeError) setEditTimeError(false);
              }}
              error={editTimeError}
              returnKeyType="done"
              onSubmitEditing={handleSaveEditTime}
            />
            <SurfaceText font="text-2xs" color="onSurfaceVariant">
              Max{' '}
              {formatKeiserSeconds(
                blueprint.maxDuration.seconds(),
                displayFormat,
              )}
            </SurfaceText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              testID="keiser-timer-edit-time-cancel"
              onPress={() => setEditTimeOpen(false)}
            >
              Cancel
            </Button>
            <Button
              testID="keiser-timer-edit-time-save"
              onPress={handleSaveEditTime}
            >
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}
