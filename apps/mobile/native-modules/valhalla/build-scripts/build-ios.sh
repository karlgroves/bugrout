#!/usr/bin/env bash
set -euo pipefail

# Build Valhalla as a static library / xcframework for iOS.
#
# Produces: valhalla.xcframework containing:
#   - arm64 (device)
#   - arm64 (simulator, Apple Silicon)
#   - x86_64 (simulator, Intel)
#
# Prerequisites:
#   - Xcode 15+ with iOS SDK
#   - CMake 3.20+
#   - Run fetch-deps.sh first
#
# Usage: ./build-ios.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPS_DIR="${SCRIPT_DIR}/../deps"
BUILD_DIR="${SCRIPT_DIR}/../build/ios"
OUTPUT_DIR="${SCRIPT_DIR}/../bin/ios"

IOS_MIN_VERSION="15.0"

if [[ ! -d "$DEPS_DIR/valhalla" ]]; then
  echo "Error: Dependencies not found. Run fetch-deps.sh first."
  exit 1
fi

mkdir -p "$BUILD_DIR" "$OUTPUT_DIR"

# Common CMake flags for Valhalla.
# Approach A (in-process actor_t) needs NO HTTP server: SERVICES/HTTP OFF drops
# prime_server, ZMQ, and libcurl — the hardest deps to cross-compile for iOS.
# See ../SPIKE.md §5.
CMAKE_COMMON=(
  -DCMAKE_BUILD_TYPE=Release
  -DENABLE_TOOLS=OFF
  -DENABLE_DATA_TOOLS=OFF
  -DENABLE_PYTHON_BINDINGS=OFF
  -DENABLE_TESTS=OFF
  -DENABLE_BENCHMARKS=OFF
  -DENABLE_SERVICES=OFF
  -DENABLE_HTTP=OFF
  -DBOOST_ROOT="$DEPS_DIR/boost"
  -DProtobuf_DIR="$DEPS_DIR/protobuf"
  -DLZ4_LIBRARY="$DEPS_DIR/lz4/lib"
  -DLZ4_INCLUDE_DIR="$DEPS_DIR/lz4/lib"
)

build_arch() {
  local ARCH=$1
  local SDK=$2
  local PLATFORM_DIR="$BUILD_DIR/$ARCH"

  echo ""
  echo "=== Building Valhalla for iOS $ARCH (SDK: $SDK) ==="

  mkdir -p "$PLATFORM_DIR"
  cd "$PLATFORM_DIR"

  cmake "$DEPS_DIR/valhalla" \
    "${CMAKE_COMMON[@]}" \
    -DCMAKE_SYSTEM_NAME=iOS \
    -DCMAKE_OSX_ARCHITECTURES="$ARCH" \
    -DCMAKE_OSX_SYSROOT="$SDK" \
    -DCMAKE_OSX_DEPLOYMENT_TARGET="$IOS_MIN_VERSION" \
    -DCMAKE_INSTALL_PREFIX="$PLATFORM_DIR/install" \
    -G Ninja

  cmake --build . --config Release --parallel "$(sysctl -n hw.ncpu)"
  cmake --install . --config Release

  echo "Built: $PLATFORM_DIR/install"
}

# Build for all architectures
build_arch "arm64" "iphoneos"
build_arch "arm64" "iphonesimulator"
build_arch "x86_64" "iphonesimulator"

# Create fat library for simulator (arm64 + x86_64)
echo ""
echo "=== Creating fat simulator library ==="
SIMULATOR_FAT="$BUILD_DIR/simulator-fat"
mkdir -p "$SIMULATOR_FAT/lib"

lipo -create \
  "$BUILD_DIR/arm64-iphonesimulator/install/lib/libvalhalla.a" \
  "$BUILD_DIR/x86_64/install/lib/libvalhalla.a" \
  -output "$SIMULATOR_FAT/lib/libvalhalla.a"

# Create xcframework
echo ""
echo "=== Creating xcframework ==="
xcodebuild -create-xcframework \
  -library "$BUILD_DIR/arm64-iphoneos/install/lib/libvalhalla.a" \
  -headers "$BUILD_DIR/arm64-iphoneos/install/include" \
  -library "$SIMULATOR_FAT/lib/libvalhalla.a" \
  -headers "$BUILD_DIR/arm64-iphonesimulator/install/include" \
  -output "$OUTPUT_DIR/valhalla.xcframework"

echo ""
echo "=== iOS build complete ==="
echo "Output: $OUTPUT_DIR/valhalla.xcframework"
