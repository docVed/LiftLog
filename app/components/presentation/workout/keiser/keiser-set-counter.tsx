import { RecordedKeiserExerciseSet } from '@/models/session-models';
import { Weight } from '@/models/weight';
import { Text as PaperText, Chip } from 'react-native-paper';
import { Text, View } from 'react-native';
import { font, rounding, spacing, useAppTheme } from '@/hooks/useAppTheme';
import FocusRing from '@/components/presentation/foundation/focus-ring';
import Holdable from '@/components/presentation/foundation/holdable';
import TouchableRipple from '@/components/presentation/foundation/gesture-wrappers/touchable-ripple';
import WeightDialog from '@/components/presentation/foundation/editors/weight-dialog';
import WeightFormat from '@/components/presentation/foundation/weight-format';
import BigNumber from 'bignumber.js';
import { T } from '@tolgee/react';
import { WeightAppliesTo } from '@/store/current-session';
import { useState } from 'react';
import { usePreferredWeightUnit } from '@/hooks/usePreferredWeightUnit';
import { KeiserDisplayFormat } from '@/models/blueprint-models';
import { formatKeiserSeconds } from '@/components/presentation/workout/keiser/keiser-format';

interface KeiserSetCounterProps {
  set: RecordedKeiserExerciseSet;
  displayFormat: KeiserDisplayFormat;
  isActive: boolean;
  isReadonly: boolean;
  onPress?: () => void;
  onUpdateWeight: (weight: Weight, applyTo: WeightAppliesTo) => void;
  onReset: () => void;
}

export default function KeiserSetCounter(props: KeiserSetCounterProps) {
  const { colors } = useAppTheme();
  const preferredUnit = usePreferredWeightUnit();
  const [isWeightDialogOpen, setIsWeightDialogOpen] = useState(false);
  const [applyTo, setApplyTo] = useState<WeightAppliesTo>('uncompletedSets');
  const completed = props.set.isCompletelyFilled;
  const recordedSeconds = props.set.duration?.seconds() ?? 0;
  const maxSeconds = props.set.blueprint.maxDuration.seconds();
  const displayWeight =
    props.set.weight.unit === 'nil'
      ? new Weight(props.set.weight.value, preferredUnit)
      : props.set.weight;

  return (
    <Holdable disabled={props.isReadonly} onLongPress={props.onReset}>
      <FocusRing
        isSelected={props.isActive && !props.isReadonly}
        radius={rounding.roundedRectangleFocusRingRadius}
      >
        <View style={{ userSelect: 'none', minWidth: spacing[15] }}>
          <View
            style={{
              borderTopLeftRadius: rounding.roundedRectangleRadius,
              borderTopRightRadius: rounding.roundedRectangleRadius,
              overflow: 'hidden',
            }}
          >
            <TouchableRipple
              testID="keiser-set-time"
              onPress={props.onPress}
              style={{
                flexShrink: 0,
                height: spacing[15],
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: completed
                  ? colors.primary
                  : colors.secondaryContainer,
              }}
            >
              <Text
                style={{
                  color: completed ? colors.onPrimary : colors.onSecondaryContainer,
                  ...font['text-xl'],
                }}
              >
                <Text style={{ fontWeight: 'bold' }}>
                  {completed
                    ? formatKeiserSeconds(recordedSeconds, props.displayFormat)
                    : '-'}
                </Text>
                <Text style={{ ...font['text-sm'], verticalAlign: 'top' }}>
                  /{formatKeiserSeconds(maxSeconds, props.displayFormat)}
                </Text>
              </Text>
            </TouchableRipple>
          </View>
          <View
            style={{
              borderTopWidth: 1,
              borderColor: colors.outline,
              backgroundColor: colors.surfaceContainerHigh,
              borderBottomLeftRadius: rounding.roundedRectangleRadius,
              borderBottomRightRadius: rounding.roundedRectangleRadius,
              overflow: 'hidden',
              padding: spacing[2],
              width: '100%',
            }}
          >
            <TouchableRipple
              testID="keiser-set-weight"
              style={{
                alignItems: 'center',
                margin: -spacing[2],
                padding: spacing[2],
              }}
              onPress={
                props.isReadonly
                  ? undefined
                  : () => {
                      setApplyTo(completed ? 'thisSet' : 'uncompletedSets');
                      setIsWeightDialogOpen(true);
                    }
              }
              disabled={props.isReadonly}
            >
              <Text style={{ color: colors.onSurface, ...font['text-sm'] }}>
                <WeightFormat weight={displayWeight} />
              </Text>
            </TouchableRipple>
          </View>
          <WeightDialog
            open={isWeightDialogOpen}
            allowNegative
            increment={BigNumber(2.5)}
            weight={displayWeight}
            onClose={() => setIsWeightDialogOpen(false)}
            updateWeight={(w) => props.onUpdateWeight(w, applyTo)}
          >
            <View style={{ gap: spacing[2] }}>
              <PaperText variant="labelLarge">
                <T keyName="weight.apply_to.label" />
              </PaperText>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: spacing[1],
                }}
              >
                <Chip
                  selected={applyTo === 'thisSet'}
                  onPress={() => setApplyTo('thisSet')}
                >
                  <T keyName="exercise.this_set.label" />
                </Chip>
                <Chip
                  selected={applyTo === 'uncompletedSets'}
                  onPress={() => setApplyTo('uncompletedSets')}
                >
                  <T keyName="exercise.uncompleted_sets.label" />
                </Chip>
                <Chip
                  selected={applyTo === 'allSets'}
                  onPress={() => setApplyTo('allSets')}
                >
                  <T keyName="exercise.all_sets.label" />
                </Chip>
              </View>
            </View>
          </WeightDialog>
        </View>
      </FocusRing>
    </Holdable>
  );
}

