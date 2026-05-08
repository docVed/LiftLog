# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

LiftLog is a multi-project monorepo. Each top-level directory has its own toolchain — pick the right one before running commands.

- `app/` — React Native + Expo client (Android, iOS, web). The bulk of the application code lives here.
- `backend/LiftLog.Api/` — .NET 9 ASP.NET Core WebAPI. Serves the encrypted feed and the Anthropic-backed AI planner over SignalR.
- `backend/LiftLog.Lib/` — Shared C# library (models, serialization, services) used by the API and tests.
- `backend/RevenueCat/` — Generated client lib for in-app purchases (excluded from VS Code search).
- `proto/` — Protobuf schemas shared by JS and native (workout messages, feed DAOs, exported data, user events).
- `tests/LiftLog.Tests.Api/` — Backend integration tests. `tests/cypress-tests/` for end-to-end UI tests.
- `site/` — Source for liftlog.online and the privacy policy.
- `scripts/` — Bun-run release/screenshot helpers. Use `bun` here (not `npm`).
- `docs/` — Architecture docs worth reading: `FeedProcess.md` (e2e encryption), `WorkoutWorker.md`, `RemoteBackup.md`, `PlaintextExport.md`.

## Common commands

### Frontend (`app/`)

Android builds require `JAVA_HOME` to point at the right JDK. Create `app/android/.env` (gitignored) and set it there, e.g.:

```
JAVA_HOME=~/android-studio/jbr/
```

`gradlew` sources this file automatically if present.

```bash
npm install                      # also runs patch-package via postinstall
npm run android                  # expo run:android --variant debugOptimized
npm run ios                      # expo run:ios
npm run web                      # expo start --web
npm run dev                      # expo start --dev-client (for native dev builds)
npm run lint                     # eslint .
npm run typecheck                # tsgo --noEmit (uses @typescript/native-preview)
npm test                         # vitest (also: npm test -- path/to/file.spec.ts)
npm run proto                    # regenerate gen/proto.{js,d.ts} from ../proto/**/*.proto
npm run build:android:release    # release APK via gradlew
npm run build:web                # expo export -p web --source-maps
```

Tests use Vitest with jsdom (`*.spec.ts`/`*.spec.tsx`, setup in `test/setup.ts`). Path alias: `@/* → ./*`.

### Backend (`backend/LiftLog.Api/`)

Requires `appsettings.Development.json` with Postgres connection strings, `AnthropicApiKey`, and `WebAuthApiKey` — see `backend/README.md` for an example. The dev DB runs from the local `docker-compose.yml` on port 5400.

```bash
docker compose up -d             # start Postgres
dotnet run                       # API on http://localhost:5264
dotnet test                      # from repo root or tests/LiftLog.Tests.Api
dotnet csharpier .               # format C# (required before commit)
```

EF Core migrations run automatically on startup unless `SkipDatabaseMigrations` is set.

## High-level architecture

### Frontend: state, effects, services

The app follows a strict separation between Redux state and side effects:

- **Store** (`app/store/store.ts`) is built from per-feature slices: `currentSession`, `aiPlanner`, `settings`, `program`, `feed`, `app`, `sessionEditor`, `storedSessions`, `stats`. Persistence is handled manually (so `serializableCheck` and `immutableCheck` are off).
- **Effects** are wired via `@reduxjs/toolkit/createListenerMiddleware`, exposed through `addEffect` / `addDebouncedEffect` helpers in `store/store.ts`. Each slice has an `effects.ts` that registers listeners. Effects are the *only* place async work happens — reducers stay pure. Errors inside effects are logged and reported to Sentry with the action type as the fingerprint.
- **Services** (`app/services/index.ts`) are constructed once in `resolveServicesInternal` and injected into the listener middleware as the `extra` arg. Effects access them via `listenerApi.extra`. New services should be wired here, not instantiated ad-hoc inside components.
- **Bootstrap order** lives in `app/store/index.ts`: it clears listeners, calls each `apply*Effects()` to register listeners, then dispatches `initializeAppStateSlice()`. Adding a new slice requires registering its effects here.
- **Selectors**: never import `useSelector` from `react-redux` directly — use `useAppSelector` from `@/store` (enforced by ESLint).

### Frontend: navigation and UI

- **Routing**: Expo Router under `app/app/` (file-based). Top-level group is `(tabs)` with `feed`, `history`, `(session)`, `settings`, `stats`. The root `_layout.tsx` wires `GestureHandlerRootView`, `KeyboardProvider`, Redux `<Provider>`, `ServicesProvider`, theme, and Sentry.
- **Components** are split by responsibility: `components/layout/` (chrome), `components/presentation/` (dumb/visual), `components/smart/` (state-aware). Filenames in `components/` are enforced as `kebab-case` (eslint rule).
- **UI kit**: React Native Paper (Material 3) via `@pchmn/expo-material3-theme`. Do **not** import `IconButton`, `TouchableRipple`, or `Button` from `react-native-paper` — use the wrappers in `@/components/presentation/gesture-wrappers/` (they integrate with GestureHandler). Don't import the barrel `@material-symbols-react-native/outlined-400` — pull individual icons (the barrel breaks Android builds).
- **i18n**: Tolgee. Source strings live in `app/i18n/en.json`; translations come from Weblate. `services/tolgee.ts` initialises with a preference-driven locale.

### Frontend: persistence and data models

- **Local DB**: SQLite via `expo-sqlite` with **Drizzle ORM**. Schema in `app/db/schema.ts` (`session`, `exercise`, `program`, `data_migration` tables). Migrations live in `app/drizzle/` — add new ones with drizzle-kit (`drizzle.config.ts`).
- **Versioned storage models**: `app/models/storage/versions/{v1,latest}/` hold typed payload shapes. The `migrator.ts` upgrades older payloads forward; tables store `modelVersion` + a JSON `payload` typed via Drizzle's `$type<...>()`. When changing payload shape, add a new version and a migration step rather than mutating `latest`.
- **Data migrations** (`app/services/data-migrations/`) are imperative one-shots gated by the `data_migration` table — run via `DatabaseMigrationService`.
- **Cross-language wire format**: `proto/` is the source of truth for anything sent to the workout worker, the backend, or exports. Run `npm run proto` after editing `.proto` files to regenerate `app/gen/proto.{js,d.ts}`. The Android worker also pulls these schemas (excluded from VS Code search).

### Native modules

`app/modules/` contains two custom Expo native modules:

- **`workout-worker`** — Platform-specific execution context for active workouts. On Android it's a ForegroundService. The worker is **not** a state authority: Redux is. Messages are protobuf-encoded `WorkoutMessage`s; events flow App→Worker (start/update/end), commands flow Worker→App (e.g. `FinishWorkoutCommand` from a notification action). A JS-side translation layer is the only place that knows the protobuf schema. See `docs/WorkoutWorker.md` for the full contract.
- **`native-crypto`** — Native AES/RSA implementation used by `services/encryption-service.native.ts`. Web falls back to `services/encryption-service.ts`.

Files use platform suffixes for split implementations (`.native.ts`, `.android.ts`, `.ios.ts`) — Metro picks the right one. When adding platform-specific code, follow the existing pattern (define an interface in the un-suffixed file, implement per platform).

### Backend

- **`Program.cs`** wires two `DbContext`s (`UserDataContext` for user data, `RateLimitContext` for rate limiting), both Postgres with snake_case naming and a custom `CamelCaseHistoryContext` for EF migrations history. Always use the existing contexts; don't add a third without good reason.
- **Auth**: custom scheme `PurchaseTokenAuthenticationHandler` (see `Authentication/`) — clients authenticate with a per-user password issued at registration. The AI planner is gated by purchase verification (`PurchaseVerificationService`), with implementations for RevenueCat and a `WebAuthApiKey` shortcut.
- **AI planner**: SignalR hub at `/ai-chat` (`AiWorkoutChatHub`). JSON schemas for the structured Anthropic responses live alongside `Program.cs` (`AiSessionBlueprint.json`, `AiWorkoutPlan.json`, `AiWorkoutPlanOrMessage.json`).
- **Validation**: FluentValidation, registered as singletons from the `Validators` assembly.

### End-to-end encrypted feed

The feed is opt-in and end-to-end encrypted — the server never sees plaintext workouts. AES-CBC for payloads, RSA-PSS for signatures, RSA for inbox messages. Read `docs/FeedProcess.md` before touching anything in `app/services/feed-*` or `backend/LiftLog.Api/Controllers/`. Two cryptographic invariants worth knowing:

1. Feed items are signed *then* encrypted (the signature is appended pre-AES). Decryption must verify the signature *after* AES-decrypting and splitting off the trailing 256 bytes.
2. Inbox messages are RSA-encrypted in chunks because RSA has a small max payload — the chunking lives in `feed-inbox-decryption-service`.

## Conventions

- **Formatting**: Prettier for TS/JS (`singleQuote`, `trailingComma: all`, `semi`), CSharpier for C# (`dotnet csharpier .`). The `format.yml` workflow runs both on PRs.
- **TypeScript**: strict mode + `exactOptionalPropertyTypes`. `noUnusedLocals` and `noUnusedParameters` are off — `unused-imports/no-unused-imports` covers imports.
- **Filenames in `components/`**: kebab-case (enforced).
- **Commits/PRs**: against `main`. Run `npm test` and `dotnet test` before opening a PR (see `CONTRIBUTING.md`).
