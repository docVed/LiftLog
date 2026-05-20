#!/bin/bash
JAVA_HOME=~/android-studio/jbr/ SENTRY_DISABLE_AUTO_UPLOAD=true ./android/gradlew -p android assembleRelease
adb install -r android/app/build/outputs/apk/release/app-release.apk
