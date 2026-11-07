/**
 * ValhallaEngine — Android native module (Approach A, in-process).
 *
 * Kotlin bridge that delegates to the shared C++ core (ValhallaCore) over JNI.
 * No subprocess, no HTTP server. Supersedes ValhallaServerModule.kt
 * (see ../SPIKE.md §2).
 *
 * Exposed to JS as NativeModules.ValhallaEngine with:
 *   init(tileDir): Promise<void>
 *   route(requestJson): Promise<string>   // Valhalla /route response JSON
 */

package com.bugrout.valhalla

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.Executors

class ValhallaEngineModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  // actor_t is not thread-safe; a single-thread executor serializes native calls.
  private val executor = Executors.newSingleThreadExecutor()

  override fun getName(): String = "ValhallaEngine"

  // A reload builds a new module with its own executor. Stop this one's thread
  // instead of leaking it; calls already queued still finish, so ValhallaCore's
  // mutex stays the backstop for any overlap with the new module.
  override fun invalidate() {
    executor.shutdown()
    super.invalidate()
  }

  @ReactMethod
  fun init(tileDir: String, promise: Promise) {
    executor.execute {
      try {
        val error = nativeInit(tileDir)
        if (error == null) promise.resolve(null)
        else promise.reject("VALHALLA_INIT_FAILED", error)
      } catch (e: Throwable) {
        promise.reject("VALHALLA_INIT_FAILED", e.message, e)
      }
    }
  }

  @ReactMethod
  fun route(requestJson: String, promise: Promise) {
    executor.execute {
      try {
        val result = nativeRoute(requestJson)
        if (result != null) promise.resolve(result)
        else promise.reject("VALHALLA_ROUTE_FAILED", nativeLastError() ?: "unknown error")
      } catch (e: Throwable) {
        promise.reject("VALHALLA_ROUTE_FAILED", e.message, e)
      }
    }
  }

  // --- JNI (implemented in cpp/valhalla-jni.cpp) ---
  private external fun nativeInit(tileDir: String): String?   // null = ok, else error
  private external fun nativeRoute(requestJson: String): String? // null = error, else JSON
  private external fun nativeLastError(): String?

  companion object {
    init {
      System.loadLibrary("valhalla_engine")
    }
  }
}
