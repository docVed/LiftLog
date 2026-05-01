package expo.modules.workoutworker.handlers


import LiftLog.Ui.Models.SessionBlueprintDao.SessionBlueprintDaoV2OuterClass.ExerciseType.CARDIO
import LiftLog.Ui.Models.SessionBlueprintDao.SessionBlueprintDaoV2OuterClass.ExerciseType.KEISER_TIMER
import LiftLog.Ui.Models.SessionBlueprintDao.SessionBlueprintDaoV2OuterClass.ExerciseType.WEIGHTED
import LiftLog.Ui.Models.SessionHistoryDao.SessionHistoryDaoV2OuterClass
import LiftLog.Ui.Models.Utils
import LiftLog.Ui.Models.Utils.WeightUnit.KILOGRAMS
import LiftLog.Ui.Models.Utils.WeightUnit.POUNDS
import LiftLog.Ui.Models.WorkoutMessage.WorkoutMessageOuterClass
import android.annotation.SuppressLint
import android.app.Notification
import android.util.Log
import expo.modules.workoutworker.utils.RepeatingTimerAction
import expo.modules.workoutworker.utils.WorkoutNotificationManager
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.math.BigDecimal
import kotlin.time.Clock
import kotlin.time.Duration
import kotlin.time.DurationUnit.SECONDS
import kotlin.time.ExperimentalTime
import kotlin.time.toDuration


class WorkoutUpdatedHandler(
    private val notificationManager: WorkoutNotificationManager
) : WorkoutMessageHandler {
    override fun canHandle(event: WorkoutMessageOuterClass.WorkoutMessage): Boolean {
        return event.hasWorkoutUpdatedEvent() && event.appConfiguration.notificationsEnabled
    }

    val timer = RepeatingTimerAction(MainScope(), {})

    override suspend fun handle(
        event: WorkoutMessageOuterClass.WorkoutMessage,
        dispatch: (type: String, event: WorkoutMessageOuterClass.WorkoutMessage) -> Unit
    ) {
        try {
            val workoutUpdatedEvent = event.workoutUpdatedEvent

            when {
                workoutUpdatedEvent.hasRestTimerInfo() -> showRestTimerNotification(event)
                workoutUpdatedEvent.hasCardioTimerInfo() -> showCardioTimerNotification(event)
                workoutUpdatedEvent.hasKeiserTimerInfo() -> showKeiserTimerNotification(event)
                workoutUpdatedEvent.hasCurrentExerciseDetails() -> showCurrentExerciseNotification(
                    event
                )

                else -> showFinishedNotification(event)
            }
        } catch (e: Exception) {
            Log.e("WorkoutUpdatedHandler", "Failed to handle workout updated event", e);
        }
    }

    private fun showFinishedNotification(event: WorkoutMessageOuterClass.WorkoutMessage) {
        // We should not be in a timer anymore
        timer.stop()

        val messageTemplate: String =
            event.translations.workoutPersistentNotificationFinishedMessage
        val message = messageTemplate.replace(
            "\$WEIGHT$", formatWeight(event.workoutUpdatedEvent.totalWeightLifted)
        ).replace(
            "\$TIME$", formatDuration(fromDurationDao(event.workoutUpdatedEvent.workoutDuration))
        )

        val notifBuilder = notificationManager.createWorkoutNotificationBuilder()
            .setContentText(message)
        notificationManager.notifyPersistent(notifBuilder.build())
    }

    private fun showCurrentExerciseNotification(event: WorkoutMessageOuterClass.WorkoutMessage) {
        // We should not be in a timer anymore
        timer.stop()

        val notifBuilder = notificationManager.createWorkoutNotificationBuilder()
            .setContentText("${getCurrentExerciseMessage(event)}\n${event.translations.workoutPersistentNotificationStartNowMessage}")
        notificationManager.notifyPersistent(notifBuilder.build())
    }

    @OptIn(ExperimentalTime::class)
    private fun showRestTimerNotification(
        event: WorkoutMessageOuterClass.WorkoutMessage,
    ) {
        val workoutUpdatedEvent = event.workoutUpdatedEvent

        val restTimerInfo = workoutUpdatedEvent.restTimerInfo
        fun getProgress(): Long {
            val timeStartSecs = restTimerInfo.startedAt.seconds
            val now = Clock.System.now().epochSeconds
            return now - timeStartSecs
        }

        val currentExerciseMessage = getCurrentExerciseMessage(event)
        var previousProgress = getProgress()
        timer.updateCallback {
            val timeStartSecs = restTimerInfo.startedAt.seconds
            val timePartiallyEndSecs = restTimerInfo.partiallyEndAt.seconds
            val timeEndSecs = restTimerInfo.endAt.seconds
            val progress = getProgress()
            val now = Clock.System.now().epochSeconds
            val partialProgressMax = timePartiallyEndSecs - timeStartSecs
            val fullProgressMax = timeEndSecs - timeStartSecs

            // max
            val progressMax = if (now < timePartiallyEndSecs)
                partialProgressMax else
                fullProgressMax


            val restNotif: Notification? = when {
                partialProgressMax in (previousProgress + 1)..progress && partialProgressMax != 0L -> notificationManager.createRestNotificationBuilder()
                    .setContentTitle(event.translations.workoutPersistentNotificationMinRestOverMessage)
                    .build()

                fullProgressMax in (previousProgress + 1)..progress && fullProgressMax != 0L -> notificationManager.createRestNotificationBuilder()
                    .setContentTitle(event.translations.workoutPersistentNotificationMaxRestOverMessage)
                    .build()

                else -> null
            }
            if (restNotif != null) {
                notificationManager.notifyRest(restNotif)

                MainScope().launch {
                    delay(10_000)
                    notificationManager.clearRestNotification()
                }
            }
            @Suppress("AssignedValueIsNeverRead")
            previousProgress = progress

            val message = when {
                now < timePartiallyEndSecs -> event.translations.workoutPersistentNotificationRestBreakMessage
                now in timePartiallyEndSecs..timeEndSecs -> event.translations.workoutPersistentNotificationStartSoonMessage
                else -> event.translations.workoutPersistentNotificationStartNowMessage
            }
            val contentText = when {
                currentExerciseMessage == "" -> message
                else -> "$currentExerciseMessage\n$message"
            }
            var notifBuilder =
                notificationManager.createWorkoutNotificationBuilder()
                    .setContentText(contentText).setSubText(
                        "${formatDuration(progress.toDuration(SECONDS))}/${
                            formatDuration(
                                progressMax.toDuration(
                                    SECONDS
                                )
                            )
                        }"
                    )
            if (progress < progressMax) {
                notifBuilder = notifBuilder.setProgress(
                    progressMax.toInt(), progress.toInt(), false
                )
            }

            notificationManager.notifyPersistent(notifBuilder.build())
        }
        timer.start()
    }


    @OptIn(ExperimentalTime::class)
    private fun showCardioTimerNotification(
        event: WorkoutMessageOuterClass.WorkoutMessage,
    ) {
        val workoutUpdatedEvent = event.workoutUpdatedEvent

        val cardioTimerInfo = workoutUpdatedEvent.cardioTimerInfo
        val currentExerciseMessage = getCurrentExerciseMessage(event)
        timer.updateCallback {
            val currentDuration = fromDurationDao(cardioTimerInfo.currentDuration)
            val timeStartSecs =
                cardioTimerInfo.currentBlockStartTime.seconds - currentDuration.toInt(SECONDS)
            val now = Clock.System.now().epochSeconds
            val timeMessage = formatDuration((now - timeStartSecs).toDuration(SECONDS))
            val notifBuilder =
                notificationManager.createWorkoutNotificationBuilder()
                    .setContentText(currentExerciseMessage)
                    .setSubText(timeMessage)

            notificationManager.notifyPersistent(notifBuilder.build())
        }
        timer.start()
    }

    @OptIn(ExperimentalTime::class)
    private fun showKeiserTimerNotification(
        event: WorkoutMessageOuterClass.WorkoutMessage,
    ) {
        val workoutUpdatedEvent = event.workoutUpdatedEvent

        val keiserTimerInfo = workoutUpdatedEvent.keiserTimerInfo
        val currentExerciseMessage = getCurrentExerciseMessage(event)
        val prepDurationSecs = keiserTimerInfo.prepDuration.seconds
        val maxDurationSecs = keiserTimerInfo.maxDuration.seconds
        val moveDurationSecs = keiserTimerInfo.moveDuration.seconds
        val pauseDurationSecs = keiserTimerInfo.pauseDuration.seconds
        val cycleSecs = moveDurationSecs + pauseDurationSecs

        timer.updateCallback {
            val accumulatedSecs =
                fromDurationDao(keiserTimerInfo.currentDuration).toInt(SECONDS).toLong()
            val blockStartSecs = keiserTimerInfo.currentBlockStartTime.seconds
            val now = Clock.System.now().epochSeconds
            val sinceBlockStart = now - blockStartSecs
            val (phaseLabel, displaySecs) = if (accumulatedSecs == 0L &&
                sinceBlockStart < prepDurationSecs
            ) {
                "GET READY" to (prepDurationSecs - sinceBlockStart)
            } else {
                val effectiveSinceBlock = if (accumulatedSecs == 0L)
                    sinceBlockStart - prepDurationSecs
                else
                    sinceBlockStart
                val totalRun = accumulatedSecs + effectiveSinceBlock.coerceAtLeast(0)
                if (totalRun >= maxDurationSecs) {
                    "DONE" to maxDurationSecs
                } else {
                    val intoCycle = if (cycleSecs > 0) totalRun % cycleSecs else 0L
                    val label = if (intoCycle < moveDurationSecs) "MOVE" else "PAUSE"
                    label to totalRun
                }
            }
            val subText =
                "$phaseLabel · ${formatDuration(displaySecs.toDuration(SECONDS))}/${
                    formatDuration(maxDurationSecs.toDuration(SECONDS))
                }"
            val notifBuilder =
                notificationManager.createWorkoutNotificationBuilder()
                    .setContentText(currentExerciseMessage)
                    .setSubText(subText)
                    .setProgress(
                        maxDurationSecs.toInt(),
                        displaySecs.toInt().coerceIn(0, maxDurationSecs.toInt()),
                        false,
                    )

            notificationManager.notifyPersistent(notifBuilder.build())
        }
        timer.start()
    }

    private fun fromDurationDao(duration: com.google.protobuf.Duration): Duration {
        // TODO dropping nanos, not a problem for our uses though
        return duration.seconds.toDuration(SECONDS)
    }

    @SuppressLint("DefaultLocale")
    private fun formatDuration(dur: Duration): String {
        return dur.toComponents { days: Long, hours: Int, minutes: Int, seconds: Int, _ ->
            when {
                days > 0 -> String.format("%d:%02d:%02d:%02d", days, hours, minutes, seconds)
                hours > 0 -> String.format("%d:%02d:%02d", hours, minutes, seconds)
                else -> String.format("%d:%02d", minutes, seconds)
            }
        }
    }

    private fun getCurrentExerciseMessage(event: WorkoutMessageOuterClass.WorkoutMessage): String {

        val currentExercise =
            event.workoutUpdatedEvent.currentExerciseDetails.exercise.exerciseBlueprint
        val messageTemplate = event.translations.workoutPersistentNotificationCurrentExerciseMessage

        val nextSet =
            event.workoutUpdatedEvent.currentExerciseDetails.exercise.potentialSetsList.firstOrNull { !it.hasRecordedSet() }

        val nextSetWeight: Utils.Weight? = when {
            nextSet != null -> Utils.Weight.newBuilder().setUnit(nextSet.weightUnit)
                .setValue(nextSet.weightValue).build()

            else -> null
        }

        fun getCardioTarget(): String {
            var set: SessionHistoryDaoV2OuterClass.RecordedCardioExerciseSetDao
            if (event.workoutUpdatedEvent.hasCardioTimerInfo()) {
                val exerciseIndex = event.workoutUpdatedEvent.cardioTimerInfo.exerciseIndex
                val setIndex = event.workoutUpdatedEvent.cardioTimerInfo.setIndex
                val exercise =
                    event.workoutUpdatedEvent.workout.recordedExercisesList.get(exerciseIndex)
                set = exercise.cardioSetsList.get(setIndex)
            } else {
                val currentExercise = event.workoutUpdatedEvent.currentExerciseDetails
                val setIndex = currentExercise.setIndex
                set = currentExercise.exercise.cardioSetsList.get(setIndex)
            }
            val cardioTarget = set.blueprint.cardioTarget
            return when {
                cardioTarget.hasTimeValue() -> formatDuration(
                    cardioTarget.timeValue.seconds.toDuration(
                        SECONDS
                    )
                )

                else -> "${toBigDecimal(cardioTarget.distanceValue)} ${cardioTarget.distanceUnit}"
            }
        }

        return when {
            !event.workoutUpdatedEvent.hasCurrentExerciseDetails() -> ""
            currentExercise.type == WEIGHTED -> messageTemplate.replace(
                "\$EXERCISE_DESCRIPTOR$", "${currentExercise.name} - ${currentExercise.repsPerSet}${
                    if (nextSetWeight != null) "x${formatWeight(nextSetWeight)}" else ""
                }"
            )

            currentExercise.type == CARDIO -> messageTemplate.replace(
                "\$EXERCISE_DESCRIPTOR$", "${currentExercise.name} - ${getCardioTarget()}"
            )

            currentExercise.type == KEISER_TIMER -> messageTemplate.replace(
                "\$EXERCISE_DESCRIPTOR$",
                "${currentExercise.name} - ${
                    formatDuration(
                        getKeiserMaxDurationSeconds(event).toDuration(SECONDS)
                    )
                }"
            )

            else -> ""
        }
    }

    @OptIn(ExperimentalTime::class)
    private fun getKeiserMaxDurationSeconds(
        event: WorkoutMessageOuterClass.WorkoutMessage,
    ): Long {
        if (event.workoutUpdatedEvent.hasKeiserTimerInfo()) {
            return event.workoutUpdatedEvent.keiserTimerInfo.maxDuration.seconds
        }
        val currentExercise = event.workoutUpdatedEvent.currentExerciseDetails
        val setIndex = currentExercise.setIndex
        val keiserSets = currentExercise.exercise.keiserSetsList
        if (setIndex < 0 || setIndex >= keiserSets.size) {
            return 0
        }
        return keiserSets[setIndex].blueprint.maxDuration.seconds
    }

    private fun toBigDecimal(value: Utils.DecimalValue): BigDecimal {
        val nanoFactor = BigDecimal("1000000000")
        return BigDecimal(value.units).plus(BigDecimal(value.nanos.toLong()).divide(nanoFactor))
    }

    private fun formatWeight(weight: Utils.Weight): String {
        val weightValue = toBigDecimal(weight.value)
        val shortUnit = when (weight.unit) {
            KILOGRAMS -> "kg"
            POUNDS -> "lbs"
            else -> "units"
        }
        return "$weightValue$shortUnit"
    }

    override fun onDestroy() {
        timer.destroy()
    }
}
