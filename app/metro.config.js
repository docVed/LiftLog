const {
  wrapWithReanimatedMetroConfig,
} = require('react-native-reanimated/metro-config');
const {
  getSentryExpoConfig
} = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname, { annotateReactComponents: true, });

// Skip Android Gradle build output. Those directories can contain hundreds of
// thousands of files and will exhaust the Linux inotify watcher limit when
// Metro walks the tree.
const androidBuildIgnore = /[/\\]android[/\\](app[/\\]build|build|\.gradle)[/\\]/;
config.resolver = config.resolver || {};
const existingBlockList = config.resolver.blockList;
config.resolver.blockList = existingBlockList
  ? [
      ...(Array.isArray(existingBlockList) ? existingBlockList : [existingBlockList]),
      androidBuildIgnore,
    ]
  : androidBuildIgnore;

config.watcher = config.watcher || {};
const existingIgnore = config.watcher.ignorePattern;
config.watcher.ignorePattern = existingIgnore
  ? new RegExp(`${existingIgnore.source}|${androidBuildIgnore.source}`)
  : androidBuildIgnore;

module.exports = wrapWithReanimatedMetroConfig(config);
