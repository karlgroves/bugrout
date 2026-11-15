/**
 * ⚠️ DEPRECATED — superseded by ValhallaEngineModule.kt (in-process Approach A).
 * Kept for history only; not referenced by the config plugin. The subprocess
 * model works on Android but inherits the prime_server/ZMQ/HTTP overhead for no
 * benefit over the in-process actor_t call, and has no iOS counterpart. See
 * ../SPIKE.md §2.
 *
 * Valhalla Server Native Module — Android
 *
 * Launches a Valhalla HTTP server process on localhost:8002 at app startup.
 * The precompiled Valhalla binary is bundled into the app's assets/lib directory.
 */

package com.bugrout.valhalla

import android.util.Log
import com.facebook.react.bridge.*
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class ValhallaServerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "ValhallaServer"
        private const val PORT = 8002
        private const val MAX_RESTARTS = 3
    }

    private var process: Process? = null
    private var restartCount = 0

    override fun getName(): String = "ValhallaServer"

    @ReactMethod
    fun startServer(tileDir: String, promise: Promise) {
        Thread {
            try {
                // Find the Valhalla binary (extracted from assets during first launch)
                val nativeLibDir = reactApplicationContext.applicationInfo.nativeLibraryDir
                val binaryPath = "$nativeLibDir/libvalhalla_service.so"

                val binaryFile = File(binaryPath)
                if (!binaryFile.exists()) {
                    promise.reject("VALHALLA_NOT_FOUND", "Valhalla binary not found at $binaryPath")
                    return@Thread
                }

                // Write config
                val configFile = File(reactApplicationContext.cacheDir, "valhalla_config.json")
                configFile.writeText("""
                    {
                        "mjolnir": {"tile_dir": "$tileDir"},
                        "httpd": {"service": {"listen": "localhost:$PORT"}},
                        "loki": {"actions": ["locate", "route"]},
                        "service_limits": {"auto": {"max_distance": 5000000}}
                    }
                """.trimIndent())

                // Start process
                val pb = ProcessBuilder(binaryPath, configFile.absolutePath)
                pb.redirectErrorStream(true)
                process = pb.start()

                Log.i(TAG, "Valhalla process started, waiting for health check...")

                // Poll for readiness
                var ready = false
                for (i in 0 until 20) {
                    Thread.sleep(500)
                    if (checkHealth()) {
                        ready = true
                        break
                    }
                }

                if (ready) {
                    Log.i(TAG, "Valhalla server ready on port $PORT")
                    promise.resolve(true)
                } else {
                    promise.reject("VALHALLA_TIMEOUT", "Valhalla did not start within 10 seconds")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start Valhalla", e)
                promise.reject("VALHALLA_LAUNCH_FAILED", e.message, e)
            }
        }.start()
    }

    @ReactMethod
    fun stopServer() {
        process?.destroy()
        process = null
    }

    @ReactMethod
    fun isRunning(promise: Promise) {
        promise.resolve(checkHealth())
    }

    private fun checkHealth(): Boolean {
        return try {
            val url = URL("http://localhost:$PORT/status")
            val conn = url.openConnection() as HttpURLConnection
            conn.connectTimeout = 2000
            conn.readTimeout = 2000
            conn.requestMethod = "GET"
            val code = conn.responseCode
            conn.disconnect()
            code == 200
        } catch (e: Exception) {
            false
        }
    }
}
