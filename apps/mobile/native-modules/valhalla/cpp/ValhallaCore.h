// ValhallaCore — framework-agnostic in-process Valhalla routing wrapper.
//
// Shared by the iOS (Objective-C++) and Android (JNI) native modules. Wraps
// valhalla::tyr::actor_t so routing happens in-process with no HTTP server,
// no ZMQ, and no subprocess. See ../SPIKE.md for the design rationale.
//
// Thread-safety: actor_t is NOT thread-safe. Calls into this class are expected
// to be serialized by the caller (the RN bridge serializes them onto a single
// module queue). A std::mutex guards the actor as a backstop.

#pragma once

#include <memory>
#include <mutex>
#include <string>

namespace bugrout {

class ValhallaCore {
 public:
  ValhallaCore() = default;
  ~ValhallaCore();

  ValhallaCore(const ValhallaCore&) = delete;
  ValhallaCore& operator=(const ValhallaCore&) = delete;

  // Construct the routing actor from the given tile path. Accepts:
  //   - a directory of extracted tiles            → mjolnir.tile_dir
  //   - an uncompressed ".tar"                    → mjolnir.tile_extract (mmap'd)
  //   - a ".tar.gz"/".gz" (as TileManager downloads it) → gunzipped once to a
  //     sibling ".tar" (via zlib, off the JS heap), then mmap'd. The decompressed
  //     ".tar" is cached, so repeat inits skip the work.
  // Idempotent: a second call rebuilds the actor.
  //
  // Returns true on success. On failure, returns false and writes a message to
  // `outError`.
  bool init(const std::string& tilePath, std::string& outError);

  // Run a route request. `requestJson` is a Valhalla `/route` request body
  // (identical to what services/valhalla/ValhallaModule.ts builds). Returns the
  // Valhalla response JSON string, ready for parseValhallaResponse() on the JS
  // side. On failure, returns an empty string and writes to `outError`.
  std::string route(const std::string& requestJson, std::string& outError);

  bool isReady() const;

 private:
  // Opaque to keep Valhalla/Boost headers out of the public interface (so the
  // platform bindings don't need the Valhalla include path).
  struct Impl;
  std::unique_ptr<Impl> impl_;
  mutable std::mutex mutex_;
};

}  // namespace bugrout
