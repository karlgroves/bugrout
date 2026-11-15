/**
 * ⚠️ DEPRECATED — DOES NOT WORK ON iOS. Superseded by ValhallaEngine.mm
 * (in-process Approach A). Kept for history only; not referenced by the config
 * plugin. `Foundation.Process` is unavailable on iOS and the App Sandbox forbids
 * spawning bundled executables, so this subprocess model can never ship. See
 * ../SPIKE.md §2 for the full finding.
 *
 * Valhalla Server Native Module — iOS
 *
 * Launches a Valhalla HTTP server process on localhost:8002 at app startup.
 * The precompiled Valhalla binary is bundled into the app via the Expo config plugin.
 *
 * Approach B: Local HTTP server
 * - Starts valhalla_service process with routing tile directory
 * - Monitors health via /status endpoint
 * - Restarts on crash (max 3 attempts)
 */

import Foundation

@objc(ValhallaServerModule)
class ValhallaServerModule: NSObject {

  private var process: Process?
  private var restartCount = 0
  private let maxRestarts = 3
  private let port: Int = 8002

  @objc
  func startServer(_ tileDir: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    // Find the bundled Valhalla binary
    guard let binaryPath = Bundle.main.path(forResource: "valhalla_service", ofType: nil) else {
      reject("VALHALLA_NOT_FOUND", "Valhalla binary not found in app bundle", nil)
      return
    }

    // Build the config
    let config: [String: Any] = [
      "mjolnir": ["tile_dir": tileDir],
      "httpd": ["service": ["listen": "localhost:\(port)"]],
      "loki": ["actions": ["locate", "route"]],
      "service_limits": ["auto": ["max_distance": 5000000]],
    ]

    // Write config to temp file
    let configPath = NSTemporaryDirectory() + "valhalla_config.json"
    if let configData = try? JSONSerialization.data(withJSONObject: config) {
      try? configData.write(to: URL(fileURLWithPath: configPath))
    }

    // Launch the process
    let proc = Process()
    proc.executableURL = URL(fileURLWithPath: binaryPath)
    proc.arguments = [configPath]

    // Capture stdout/stderr for debugging
    let pipe = Pipe()
    proc.standardOutput = pipe
    proc.standardError = pipe

    // Handle termination
    proc.terminationHandler = { [weak self] process in
      guard let self = self else { return }
      if process.terminationStatus != 0 && self.restartCount < self.maxRestarts {
        self.restartCount += 1
        NSLog("[Valhalla] Process terminated with status \(process.terminationStatus). Restarting (attempt \(self.restartCount)/\(self.maxRestarts))...")
        self.startServerInternal(tileDir: tileDir)
      }
    }

    do {
      try proc.run()
      self.process = proc

      // Wait for server to be ready (poll /status)
      DispatchQueue.global().async {
        var ready = false
        for _ in 0..<20 { // 20 attempts, 500ms each = 10s timeout
          Thread.sleep(forTimeInterval: 0.5)
          if self.checkHealth() {
            ready = true
            break
          }
        }

        if ready {
          resolve(true)
        } else {
          reject("VALHALLA_TIMEOUT", "Valhalla server did not start within 10 seconds", nil)
        }
      }
    } catch {
      reject("VALHALLA_LAUNCH_FAILED", "Failed to launch Valhalla: \(error)", nil)
    }
  }

  @objc
  func stopServer() {
    process?.terminate()
    process = nil
  }

  @objc
  func isRunning(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    resolve(checkHealth())
  }

  private func startServerInternal(tileDir: String) {
    // Simplified restart — reuse startServer logic
    startServer(tileDir, resolve: { _ in }, reject: { _, _, _ in })
  }

  private func checkHealth() -> Bool {
    guard let url = URL(string: "http://localhost:\(port)/status") else { return false }
    var request = URLRequest(url: url)
    request.timeoutInterval = 2

    let semaphore = DispatchSemaphore(value: 0)
    var isHealthy = false

    URLSession.shared.dataTask(with: request) { _, response, _ in
      if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
        isHealthy = true
      }
      semaphore.signal()
    }.resume()

    semaphore.wait()
    return isHealthy
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
