# Sprint 0 Spike — Native Valhalla embedding (Approach A)

**Status:** skeleton + decision doc complete; native cross-compile + on-device
validation still pending (requires Mac/Xcode/NDK toolchain + a physical device).
**Recommendation:** commit to **Approach A (in-process, `actor_t`)**. Approach B
as originally scaffolded (subprocess HTTP server) is **not viable on iOS** — see
below.

---

## 1. The decision the spike exists to make

From `spec.md`:

> The preferred path is a prebuilt Valhalla C++ shared library wrapped in a React
> Native native module. Alternative: run Valhalla in a local HTTP server process
> on-device. … A proof of concept is required in Sprint 0 before committing to
> either approach.

| | **A — in-process (`actor_t`)** | **B — local HTTP server subprocess** |
|---|---|---|
| iOS feasibility | ✅ works | ❌ **impossible** (no subprocess API) |
| Android feasibility | ✅ works | ⚠️ works but discouraged |
| Battery / memory | Lower (one process, no socket/HTTP) | Higher (extra process, ZMQ, loopback HTTP) |
| Build complexity | Medium (`actor_t` only) | High (prime_server + ZMQ + libcurl) |
| Latency per route | In-process call | HTTP round-trip on loopback |

**Conclusion: Approach A, both platforms.** Build a single shared C++ core that
links `libvalhalla` and calls `valhalla::tyr::actor_t::route()`, wrapped by a thin
per-platform native module.

## 2. Why Approach B (as scaffolded) is a dead end on iOS

The original `ios/ValhallaServerModule.swift` and `android/ValhallaServerModule.kt`
launch the `valhalla_service` HTTP daemon as a **child process**:

```swift
let proc = Process()                       // ← Foundation.Process / NSTask
proc.executableURL = URL(fileURLWithPath: binaryPath)
proc.arguments = [configPath]
try proc.run()
```

This cannot ship on iOS:

1. **`Foundation.Process` is unavailable on iOS.** `NSTask`/`Process` exists only
   in the macOS SDK. The Swift above won't even compile against the iOS SDK.
2. **The App Sandbox forbids spawning executables.** Even via lower-level
   `posix_spawn`/`fork`+`exec`, iOS apps may not launch a separate executable
   bundled in the `.app`. Apps that do are rejected in App Review.
3. **No persistent localhost daemon.** Background execution limits would kill a
   long-lived server process anyway.

Android *can* run `ProcessBuilder`, but it inherits the HTTP/ZMQ overhead and the
prime_server dependency for no benefit over the in-process call. We therefore
**deprecate both `ValhallaServerModule.*` files** (kept in-tree, marked
deprecated, no longer referenced by the config plugin).

## 3. The in-process API: `valhalla::tyr::actor_t`

Valhalla exposes a server-less, in-process facade in `valhalla/tyr/actor.h`. It
wraps loki (input parsing) → thor (path finding) → odin (directions) and returns
the **same JSON** the HTTP `/route` endpoint returns — so our existing
`parseValhallaResponse()` in `services/valhalla/ValhallaModule.ts` works unchanged.

```cpp
boost::property_tree::ptree config;
config.put("mjolnir.tile_dir", tileDir);          // or mjolnir.tile_extract for a .tar
valhalla::tyr::actor_t actor(config, /*auto_cleanup=*/true);
std::string responseJson = actor.route(requestJson);   // requestJson == our HTTP body
```

No HTTP, no ZMQ, no prime_server, no libcurl, no subprocess. This collapses the
dependency surface dramatically (see §5) and is the reason Approach A is *less*
build effort than the subprocess server, not more.

The shared core lives in [`cpp/ValhallaCore.h`](cpp/ValhallaCore.h) /
[`cpp/ValhallaCore.cpp`](cpp/ValhallaCore.cpp) and is identical for both
platforms.

## 4. Architecture

```
JS:   services/valhalla/ValhallaModule.ts
        └─ NativeModules.ValhallaEngine.{init,route}     (legacy bridge; see §7)
              │
   iOS  ──────┤  ios/ValhallaEngine.mm  (Objective-C++)
   Android ───┤  android/.../ValhallaEngineModule.kt → JNI → cpp/valhalla-jni.cpp
              │
              └─ cpp/ValhallaCore.cpp  ──link──▶  libvalhalla.a  (+ deps)
```

- **`init(tileDir)`** → constructs the `actor_t` once, holds it for the app lifetime.
- **`route(requestJson)`** → calls `actor.route()`, returns the JSON string.

The JS layer (`ValhallaModule.ts`) already expects exactly this shape
(`init(tileDir): Promise<void>`, `route(request: string): Promise<string>`).

## 5. Dependency / build surface (Approach A)

With `ENABLE_SERVICES=OFF` and `ENABLE_HTTP=OFF`, the link set is:

| Dep | Needed by `actor_t`? | Notes |
|---|---|---|
| Boost (headers + a few compiled libs) | ✅ | property_tree, geometry, algorithm |
| Protobuf | ✅ | tile format (`graphtile`) |
| zlib | ✅ | tile compression |
| **prime_server / ZMQ** | ❌ removed | only for `ENABLE_SERVICES=ON` |
| **libcurl** | ❌ removed | only for HTTP tile fetching |
| **LZ4** | ⚠️ optional | only if tiles built with LZ4; MD tiles aren't |

The `build-ios.sh` / `build-android.sh` scripts in `build-scripts/` have been
updated to `ENABLE_SERVICES=OFF`, `ENABLE_HTTP=OFF`, build a static
`libvalhalla.a` (not the `valhalla_service` binary), and bundle the `actor_t`
headers.

**Estimated added binary size (arm64, release, stripped):** ~12–20 MB for
`libvalhalla.a` + protobuf + boost-compiled bits, before the routing *tiles*
(those are downloaded separately and live on disk — see `TileManager.ts`).

## 6. Open risks / what still needs validating on a real toolchain

These are the spike's remaining unknowns. None are believed blocking; all need a
real build to confirm:

1. **iOS cross-compile of Valhalla 3.5.1.** Valhalla isn't routinely built for the
   iOS SDK. Expect to patch a CMake check or two (e.g. `sysconf`, `getloadavg`,
   filesystem). Tracked as the main spike risk.
2. **Protobuf version match.** Valhalla's generated `.pb.h` must match the linked
   libprotobuf. Pin both (`fetch-deps.sh` pins protobuf 25.3).
3. **`actor_t` thread-safety.** `actor_t` is **not** thread-safe; serialize calls
   or hold one actor per thread. JS calls are already serialized through the
   bridge, so a single actor on a dedicated dispatch queue is sufficient.
4. **C++ stdlib on Android.** Use `c++_shared` and ship `libc++_shared.so`
   (already in `build-android.sh`).
5. **Tile path — wired.** Valhalla routing tiles are a separate artifact from the
   PMTiles map tiles. `TileManager.downloadRegion()` already fetches
   `<id>.valhalla.tar.gz` per region (see NEXT-STEPS.md "Valhalla tile tarball in
   R2"). The flow is now implemented end-to-end:
   - `services/valhalla/ValhallaTiles.ts` (`planValhallaInit`) checks the archive
     is on disk and picks `native` vs `http`; `AppBootstrap` passes the result to
     `initValhalla`.
   - `ValhallaCore::init` accepts the `.tar.gz` directly and **gunzips it once**
     (via the already-linked zlib) to a sibling `.tar`, then uses
     `mjolnir.tile_extract` to mmap it (no per-tile extraction, lowest memory
     churn). The decompressed `.tar` is cached for subsequent inits.
   The only remaining piece is server-side: actually building + uploading the
   per-region `.valhalla.tar.gz` and setting `valhallaSize` in `manifest.json`.

## 7. Turbo Module vs. legacy bridge

This skeleton uses the **legacy bridge** (`RCTBridgeModule` / async
`ReactContextBaseJavaModule`) because:

- It matches what `ValhallaModule.ts` already looks up
  (`NativeModules.ValhallaEngine`).
- It works under the New Architecture via the RN interop layer.
- It avoids codegen wiring in the prebuild flow, keeping the spike focused on the
  one unknown that matters: *does the in-process `actor_t` call build and run?*

A follow-up can promote this to a true **JSI Turbo Module** for a synchronous,
zero-serialization `route()` — worthwhile since routes are requested on the hot
path during navigation. The C++ core (`ValhallaCore`) is already
framework-agnostic, so the promotion only touches the thin binding layer.

## 8. How to actually run the build (the part that needs your machine)

```bash
cd apps/mobile/native-modules/valhalla/build-scripts
./fetch-deps.sh                       # clones valhalla 3.5.1 + boost/protobuf/lz4
./build-ios.sh                        # → ../bin/ios/valhalla.xcframework
ANDROID_NDK_HOME=… ./build-android.sh # → ../bin/android/jniLibs/<abi>/

# enable the config plugin in app.config.ts:
#   ["./native-modules/valhalla/config-plugin", { approach: "native" }]

cd ../../..                           # apps/mobile
npx expo prebuild --clean
EXPO_PUBLIC_VALHALLA_APPROACH=native npx eas build --profile preview --platform ios
```

Then on device: download a region (gets the Valhalla tile tarball), kill the app,
relaunch with no connectivity, and confirm "Bug Out" returns a real route with the
Fly URL unset.

## 9. Go / no-go

**Go on Approach A.** The dependency surface is smaller than originally feared once
`actor_t` replaces the HTTP service, the JS contract is unchanged, and the only
genuine unknown (iOS cross-compile patches) is a known, bounded class of problem.
The subprocess approach (B) is formally ruled out for iOS.
