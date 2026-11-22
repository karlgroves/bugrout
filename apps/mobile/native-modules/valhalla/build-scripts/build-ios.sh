#!/usr/bin/env bash
set -euo pipefail

# Build Valhalla as a static xcframework for the iOS Simulator (arm64).
#
# This is the build that produced the working in-process engine (#145, #385).
# It is reconstructed from that build's own CMake caches, not from intent:
# every flag below is one the working build was configured with, and the
# archive list matches the shipped libvalhalla.a member for member.
#
# Produces:
#   ../bin/ios/valhalla.xcframework   one static archive holding Valhalla,
#                                     protobuf, abseil, utf8_range and LZ4
#   ../bin/ios/include                the headers the module compiles against
#                                     (Valhalla, its generated *.pb.h, protobuf)
#
# Device (iphoneos) and Intel-simulator slices are NOT built. Neither has been
# attempted, so this script does not pretend to. Adding a device leg means a
# second protobuf/LZ4/Valhalla build with CMAKE_OSX_SYSROOT=iphoneos and a
# second -library to xcodebuild below.
#
# Prerequisites: Xcode with the iOS Simulator SDK, CMake 3.20+ (tested 4.4),
# Ninja, pkg-config. Run fetch-deps.sh first.
#
# Usage: ./build-ios.sh
# BUILD_ROOT and OUTPUT_DIR may be overridden, e.g. to rebuild into a scratch
# directory and compare against an existing build.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEPS_DIR="${MODULE_DIR}/deps"
BUILD_ROOT="${BUILD_ROOT:-${MODULE_DIR}/build}"
OUTPUT_DIR="${OUTPUT_DIR:-${MODULE_DIR}/bin/ios}"
PATCH_DIR="${SCRIPT_DIR}/patches"

IOS_MIN_VERSION="15.0"
JOBS="$(sysctl -n hw.ncpu)"

for dep in valhalla protobuf lz4 boost; do
  if [[ ! -d "${DEPS_DIR}/${dep}" ]]; then
    echo "Error: ${DEPS_DIR}/${dep} not found. Run fetch-deps.sh first." >&2
    exit 1
  fi
done

# Flags shared by every iOS Simulator configure below.
IOS_SIM=(
  -G Ninja
  -DCMAKE_BUILD_TYPE=Release
  -DCMAKE_SYSTEM_NAME=iOS
  -DCMAKE_OSX_SYSROOT=iphonesimulator
  -DCMAKE_OSX_ARCHITECTURES=arm64
  -DCMAKE_OSX_DEPLOYMENT_TARGET="${IOS_MIN_VERSION}"
)

# --- 1. Patch abseil (vendored by protobuf) for Xcode 26 ---------------------
# Abseil's Randen copts loop probes x86_64 AES/SSE flags even when building for
# arm64, and Xcode 26's clang rejects them. Applied idempotently: a patch that
# reverses cleanly is already in.
ABSEIL_DIR="${DEPS_DIR}/protobuf/third_party/abseil-cpp"
ABSEIL_PATCH="${PATCH_DIR}/abseil-randen-arm64-only.patch"
if git -C "$ABSEIL_DIR" apply --reverse --check "$ABSEIL_PATCH" 2>/dev/null; then
  echo "abseil patch already applied."
else
  git -C "$ABSEIL_DIR" apply "$ABSEIL_PATCH"
  echo "Applied abseil patch."
fi

# --- 2. protoc for the host --------------------------------------------------
# Valhalla generates *.pb.h at build time, so it needs a protoc that runs on
# this Mac, of the same protobuf version as the library it links.
echo ""
echo "=== protobuf (host protoc) ==="
cmake -S "${DEPS_DIR}/protobuf" -B "${BUILD_ROOT}/protobuf/host" \
  -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
  -DCMAKE_INSTALL_PREFIX="${BUILD_ROOT}/protobuf/host-install" \
  -Dprotobuf_BUILD_TESTS=OFF \
  -Dprotobuf_BUILD_CONFORMANCE=OFF \
  -Dprotobuf_BUILD_EXAMPLES=OFF \
  -Dprotobuf_ABSL_PROVIDER=module \
  -DABSL_BUILD_TESTING=OFF
cmake --build "${BUILD_ROOT}/protobuf/host" --parallel "$JOBS"
cmake --install "${BUILD_ROOT}/protobuf/host"

# --- 3. protobuf + abseil for the simulator ----------------------------------
echo ""
echo "=== protobuf (iOS Simulator) ==="
cmake -S "${DEPS_DIR}/protobuf" -B "${BUILD_ROOT}/protobuf/ios-sim" \
  "${IOS_SIM[@]}" \
  -DCMAKE_INSTALL_PREFIX="${BUILD_ROOT}/protobuf/ios-sim-install" \
  -DCMAKE_POSITION_INDEPENDENT_CODE=ON \
  -Dprotobuf_BUILD_TESTS=OFF \
  -Dprotobuf_BUILD_CONFORMANCE=OFF \
  -Dprotobuf_BUILD_EXAMPLES=OFF \
  -Dprotobuf_BUILD_PROTOC_BINARIES=OFF \
  -Dprotobuf_ABSL_PROVIDER=module \
  -DABSL_BUILD_TESTING=OFF
cmake --build "${BUILD_ROOT}/protobuf/ios-sim" --parallel "$JOBS"
cmake --install "${BUILD_ROOT}/protobuf/ios-sim"

# --- 4. LZ4 for the simulator ------------------------------------------------
# lz4 1.9.4's CMakeLists predates CMake 3.5, which CMake 4 refuses without
# CMAKE_POLICY_VERSION_MINIMUM.
echo ""
echo "=== LZ4 (iOS Simulator) ==="
cmake -S "${DEPS_DIR}/lz4/build/cmake" -B "${BUILD_ROOT}/lz4-ios" \
  "${IOS_SIM[@]}" \
  -DCMAKE_INSTALL_PREFIX="${BUILD_ROOT}/lz4-ios/install" \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
  -DBUILD_SHARED_LIBS=OFF \
  -DLZ4_BUILD_CLI=OFF \
  -DLZ4_POSITION_INDEPENDENT_LIB=ON
cmake --build "${BUILD_ROOT}/lz4-ios" --parallel "$JOBS"
cmake --install "${BUILD_ROOT}/lz4-ios"

# --- 5. Valhalla for the simulator -------------------------------------------
# Approach A needs no HTTP server: SERVICES/HTTP OFF drops prime_server, ZMQ
# and libcurl (SPIKE.md §5). Valhalla finds LZ4 and zlib through pkg-config;
# PKG_CONFIG_PATH puts the simulator LZ4 first, so its headers match the
# library that gets merged in step 6. zlib's headers come from the SDK and the
# library ships with iOS.
#
# ENABLE_SINGLE_FILES_WERROR=OFF: Valhalla compiles some files with -Werror,
# and Xcode 26's clang flags the bundled date library's ios.mm (variable-length
# arrays, a sign comparison) and an unused variable in tz_alt.cpp. Warnings in
# third-party code we do not patch; the working build turned this off too.
echo ""
echo "=== Valhalla (iOS Simulator) ==="
PKG_CONFIG_PATH="${BUILD_ROOT}/lz4-ios/install/lib/pkgconfig${PKG_CONFIG_PATH:+:${PKG_CONFIG_PATH}}" \
cmake -S "${DEPS_DIR}/valhalla" -B "${BUILD_ROOT}/ios/sim" \
  "${IOS_SIM[@]}" \
  -DCMAKE_CXX_STANDARD=17 \
  -DCMAKE_CXX_FLAGS=-Wno-deprecated-builtins \
  -DENABLE_TOOLS=OFF \
  -DENABLE_DATA_TOOLS=OFF \
  -DENABLE_SERVICES=OFF \
  -DENABLE_HTTP=OFF \
  -DENABLE_PYTHON_BINDINGS=OFF \
  -DENABLE_TESTS=OFF \
  -DENABLE_BENCHMARKS=OFF \
  -DENABLE_SINGLE_FILES_WERROR=OFF \
  -DENABLE_GDAL=OFF \
  -DENABLE_CCACHE=OFF \
  -DBoost_NO_BOOST_CMAKE=ON \
  -DBoost_INCLUDE_DIR="${DEPS_DIR}/boost" \
  -DProtobuf_INCLUDE_DIR="${BUILD_ROOT}/protobuf/ios-sim-install/include" \
  -DProtobuf_LIBRARY="${BUILD_ROOT}/protobuf/ios-sim-install/lib/libprotobuf.a" \
  -DProtobuf_PROTOC_EXECUTABLE="${BUILD_ROOT}/protobuf/host-install/bin/protoc"
cmake --build "${BUILD_ROOT}/ios/sim" --target valhalla --parallel "$JOBS"

# --- 6. Merge into one archive -----------------------------------------------
# The pod links a single static library, so everything Valhalla needs goes in:
# libvalhalla, LZ4, and every protobuf/abseil/utf8_range archive except
# libprotobuf-lite, whose objects duplicate libprotobuf's. 90 archives.
echo ""
echo "=== Merging archives ==="
STAGE="${BUILD_ROOT}/ios/stage"
rm -rf "$STAGE"
mkdir -p "$STAGE"
ARCHIVES=("${BUILD_ROOT}/ios/sim/src/libvalhalla.a" "${BUILD_ROOT}/lz4-ios/install/lib/liblz4.a")
for a in "${BUILD_ROOT}"/protobuf/ios-sim-install/lib/*.a; do
  [[ "$(basename "$a")" == "libprotobuf-lite.a" ]] && continue
  ARCHIVES+=("$a")
done
echo "${#ARCHIVES[@]} archives"
# libtool warns for every object with no symbols (platform-specific sources
# compiled empty for this target). Those are expected; keep them out of the log.
libtool -static -o "${STAGE}/libvalhalla.a" "${ARCHIVES[@]}" 2> "${STAGE}/libtool.err"

# --- 7. Headers --------------------------------------------------------------
# What the module compiles against, gathered in one place so the podspec never
# reads a build tree: Valhalla's public headers (with the config.h its
# configure step writes), the *.pb.h it generated, and protobuf's headers.
echo ""
echo "=== Staging headers ==="
INCLUDE_OUT="${OUTPUT_DIR}/include"
rm -rf "$INCLUDE_OUT"
mkdir -p "${INCLUDE_OUT}/valhalla/proto"
rsync -a --include='*/' --include='*.h' --exclude='*' \
  "${DEPS_DIR}/valhalla/valhalla/" "${INCLUDE_OUT}/valhalla/"
cp "${BUILD_ROOT}"/ios/sim/src/valhalla/proto/*.pb.h "${INCLUDE_OUT}/valhalla/proto/"
rsync -a "${BUILD_ROOT}/protobuf/ios-sim-install/include/" "${INCLUDE_OUT}/"

# --- 8. xcframework ----------------------------------------------------------
echo ""
echo "=== Creating xcframework ==="
rm -rf "${OUTPUT_DIR}/valhalla.xcframework"
xcodebuild -create-xcframework \
  -library "${STAGE}/libvalhalla.a" \
  -output "${OUTPUT_DIR}/valhalla.xcframework"

echo ""
echo "=== iOS build complete ==="
echo "Library: ${OUTPUT_DIR}/valhalla.xcframework (iOS Simulator, arm64)"
echo "Headers: ${INCLUDE_OUT}"
