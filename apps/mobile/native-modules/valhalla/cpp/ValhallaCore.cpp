// ValhallaCore implementation — see ValhallaCore.h.

#include "ValhallaCore.h"

#include "ValhallaDefaultConfig.h"

#include <boost/property_tree/json_parser.hpp>
#include <boost/property_tree/ptree.hpp>
#include <valhalla/tyr/actor.h>
#include <zlib.h>

#include <cstdio>
#include <exception>
#include <sstream>
#include <sys/stat.h>

namespace bugrout {

namespace {
bool endsWith(const std::string& s, const std::string& suffix) {
  return s.size() >= suffix.size() &&
         s.compare(s.size() - suffix.size(), suffix.size(), suffix) == 0;
}

// Size and modification time of a file, or false when it does not exist.
bool statFile(const std::string& path, struct stat& st) {
  return ::stat(path.c_str(), &st) == 0;
}

// Gunzip a .gz/.tar.gz to `outTarPath`. Returns true on success. zlib is
// already linked for tile reads, so this keeps the multi-hundred-MB
// decompress off the JS heap.
//
// The extracted .tar is a cache of the archive, reused only while it is
// complete and current:
//   - it is written to `<tar>.part` and renamed into place on success, so a
//     run killed mid-extract (a backgrounded first launch) leaves no
//     truncated .tar for every later launch to trust;
//   - it is re-extracted when the archive is newer than it, so a region
//     update, which renames a new .tar.gz into place, is not shadowed by the
//     old .tar.
bool gunzipToTar(const std::string& gzPath, const std::string& outTarPath,
                 std::string& outError) {
  struct stat gz {};
  struct stat tar {};
  if (statFile(outTarPath, tar) && tar.st_size > 0 && statFile(gzPath, gz) &&
      tar.st_mtime >= gz.st_mtime) {
    return true;  // cached from a prior init, and not older than the archive
  }

  const std::string partPath = outTarPath + ".part";
  std::remove(partPath.c_str());  // a previous run's leftover, if any

  gzFile in = ::gzopen(gzPath.c_str(), "rb");
  if (!in) {
    outError = "gunzip: cannot open " + gzPath;
    return false;
  }
  std::FILE* out = std::fopen(partPath.c_str(), "wb");
  if (!out) {
    ::gzclose(in);
    outError = "gunzip: cannot create " + partPath;
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

  if (std::fclose(out) != 0 && ok) {
    outError = "gunzip: write failed on close (disk full?)";
    ok = false;
  }
  ::gzclose(in);
  if (ok && std::rename(partPath.c_str(), outTarPath.c_str()) != 0) {
    outError = "gunzip: cannot move " + partPath + " into place";
    ok = false;
  }
  if (!ok) std::remove(partPath.c_str());  // never leave a partial file
  return ok;
}

// Config for routing against prebuilt tiles.
//
// This starts from the full config `valhalla_build_config` emits (embedded in
// ValhallaDefaultConfig.h) rather than a couple of hand-set keys. actor_t
// reads the whole tree: with only mjolnir.tile_extract and one service_limits
// entry, construction threw "No such node (service_limits.isochrone.
// max_contours)" — and satisfying that would only have surfaced the next
// missing key. The tile source and the route bound are applied on top.
boost::property_tree::ptree makeConfig(const std::string& path, bool isExtract) {
  boost::property_tree::ptree config;
  std::istringstream defaults(kValhallaDefaultConfigJson);
  boost::property_tree::read_json(defaults, config);

  if (isExtract) {
    // mmap'd, read-only — no extraction, lowest memory churn on device.
    config.put("mjolnir.tile_extract", path);
  } else {
    config.put("mjolnir.tile_dir", path);
  }
  // Bound a single evac route; spec routes are intra-region.
  config.put("service_limits.auto.max_distance", 5000000);  // 5,000 km
  // Total exclude-polygon perimeter the engine accepts, in metres. Must equal
  // MAX_EXCLUDE_POLYGONS_PERIMETER_M in services/routing/AvoidanceBudget.ts,
  // which sizes the threat polygons the app sends; ExcludePolygonLimitSync
  // reads this line. Valhalla's default (10 000, kept by the embedded config)
  // rejects the whole request for a single wildfire perimeter, so a driver
  // fleeing a fire would get no route at all.
  config.put("service_limits.max_exclude_polygons_length", 250000);
  return config;
}
}  // namespace

struct ValhallaCore::Impl {
  explicit Impl(const boost::property_tree::ptree& config)
      : actor(config, /*auto_cleanup=*/true) {}
  valhalla::tyr::actor_t actor;
};

// Defined here, where Impl is complete. See the note in ValhallaCore.h.
ValhallaCore::ValhallaCore() = default;
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
