// ValhallaCore implementation — see ValhallaCore.h.

#include "ValhallaCore.h"

#include <boost/property_tree/ptree.hpp>
#include <valhalla/tyr/actor.h>
#include <zlib.h>

#include <cstdio>
#include <exception>
#include <sys/stat.h>

namespace bugrout {

namespace {
bool endsWith(const std::string& s, const std::string& suffix) {
  return s.size() >= suffix.size() &&
         s.compare(s.size() - suffix.size(), suffix.size(), suffix) == 0;
}

bool fileExistsNonEmpty(const std::string& path) {
  struct stat st {};
  return ::stat(path.c_str(), &st) == 0 && st.st_size > 0;
}

// Gunzip a .gz/.tar.gz to `outTarPath` (caches: skips if already present and
// non-empty). Returns true on success. zlib is already linked for tile reads,
// so this keeps the multi-hundred-MB decompress off the JS heap.
bool gunzipToTar(const std::string& gzPath, const std::string& outTarPath,
                 std::string& outError) {
  if (fileExistsNonEmpty(outTarPath)) return true;  // cached from a prior init

  gzFile in = ::gzopen(gzPath.c_str(), "rb");
  if (!in) {
    outError = "gunzip: cannot open " + gzPath;
    return false;
  }
  std::FILE* out = std::fopen(outTarPath.c_str(), "wb");
  if (!out) {
    ::gzclose(in);
    outError = "gunzip: cannot create " + outTarPath;
    return false;
  }

  char buf[1 << 16];  // 64 KiB
  int n;
  bool ok = true;
  while ((n = ::gzread(in, buf, sizeof(buf))) > 0) {
    if (std::fwrite(buf, 1, static_cast<size_t>(n), out) != static_cast<size_t>(n)) {
      outError = "gunzip: write failed (disk full?)";
      ok = false;
      break;
    }
  }
  if (ok && n < 0) {
    outError = "gunzip: read failed (corrupt archive?)";
    ok = false;
  }

  std::fclose(out);
  ::gzclose(in);
  if (!ok) std::remove(outTarPath.c_str());  // don't leave a partial .tar
  return ok;
}

// Minimal config sufficient for routing against prebuilt tiles. Valhalla applies
// sane defaults for everything we omit (costing options, service_limits, etc.).
// For production parity, point this at the full config emitted by
// `valhalla_build_config` instead of constructing it inline.
boost::property_tree::ptree makeConfig(const std::string& path, bool isExtract) {
  boost::property_tree::ptree config;
  if (isExtract) {
    // mmap'd, read-only — no extraction, lowest memory churn on device.
    config.put("mjolnir.tile_extract", path);
  } else {
    config.put("mjolnir.tile_dir", path);
  }
  // Bound a single evac route; spec routes are intra-region.
  config.put("service_limits.auto.max_distance", 5000000);  // 5,000 km
  return config;
}
}  // namespace

struct ValhallaCore::Impl {
  explicit Impl(const boost::property_tree::ptree& config)
      : actor(config, /*auto_cleanup=*/true) {}
  valhalla::tyr::actor_t actor;
};

ValhallaCore::~ValhallaCore() = default;

bool ValhallaCore::init(const std::string& tilePath, std::string& outError) {
  std::lock_guard<std::mutex> lock(mutex_);
  try {
    // Resolve the tile source: gunzip .gz once, mmap a .tar, or read a dir.
    std::string resolvedPath = tilePath;
    bool isExtract = false;
    if (endsWith(tilePath, ".gz")) {
      // <name>.tar.gz -> <name>.tar (or <name>.gz -> <name>)
      resolvedPath = tilePath.substr(0, tilePath.size() - 3);
      if (!endsWith(resolvedPath, ".tar")) resolvedPath += ".tar";
      if (!gunzipToTar(tilePath, resolvedPath, outError)) return false;
      isExtract = true;
    } else if (endsWith(tilePath, ".tar")) {
      isExtract = true;
    }

    impl_ = std::make_unique<Impl>(makeConfig(resolvedPath, isExtract));
    return true;
  } catch (const std::exception& e) {
    impl_.reset();
    outError = std::string("Valhalla init failed: ") + e.what();
    return false;
  } catch (...) {
    impl_.reset();
    outError = "Valhalla init failed: unknown error";
    return false;
  }
}

std::string ValhallaCore::route(const std::string& requestJson,
                                std::string& outError) {
  std::lock_guard<std::mutex> lock(mutex_);
  if (!impl_) {
    outError = "Valhalla not initialized; call init() first";
    return {};
  }
  try {
    // actor_t::route returns the same JSON as the HTTP /route endpoint.
    return impl_->actor.route(requestJson);
  } catch (const std::exception& e) {
    outError = std::string("Valhalla route failed: ") + e.what();
    return {};
  } catch (...) {
    outError = "Valhalla route failed: unknown error";
    return {};
  }
}

bool ValhallaCore::isReady() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return impl_ != nullptr;
}

}  // namespace bugrout
