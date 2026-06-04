#!/usr/bin/env bash
set -euo pipefail

# Build Valhalla as a shared library for Android.
#
# Produces: libvalhalla_service.so for:
#   - arm64-v8a
#   - armeabi-v7a
#   - x86_64 (emulator)
#
# Prerequisites:
#   - Android NDK r25+ (set ANDROID_NDK_HOME)
#   - CMake 3.20+
#   - Run fetch-deps.sh first
#
# Usage: ./build-android.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPS_DIR="${SCRIPT_DIR}/../deps"
BUILD_DIR="${SCRIPT_DIR}/../build/android"
OUTPUT_DIR="${SCRIPT_DIR}/../bin/android"

ANDROID_MIN_SDK=24

if [[ -z "${ANDROID_NDK_HOME:-}" ]]; then
  echo "Error: ANDROID_NDK_HOME not set."
  echo "Set it to your Android NDK path, e.g.:"
  echo "  export ANDROID_NDK_HOME=~/Library/Android/sdk/ndk/25.2.9519653"
  exit 1
fi

TOOLCHAIN="$ANDROID_NDK_HOME/build/cmake/android.toolchain.cmake"
if [[ ! -f "$TOOLCHAIN" ]]; then
  echo "Error: NDK toolchain not found at $TOOLCHAIN"
  exit 1
fi

if [[ ! -d "$DEPS_DIR/valhalla" ]]; then
  echo "Error: Dependencies not found. Run fetch-deps.sh first."
  exit 1
fi

mkdir -p "$BUILD_DIR" "$OUTPUT_DIR"

# Common CMake flags.
# Approach A (in-process actor_t): SERVICES/HTTP OFF drops prime_server, ZMQ and
# libcurl. We build a static libvalhalla.a here; the JNI bridge in
# android/cpp/CMakeLists.txt links it into libvalhalla_engine.so. See ../SPIKE.md.
CMAKE_COMMON=(
  -DCMAKE_BUILD_TYPE=Release
  -DCMAKE_TOOLCHAIN_FILE="$TOOLCHAIN"
  -DANDROID_STL=c++_shared
  -DANDROID_NATIVE_API_LEVEL=$ANDROID_MIN_SDK
  -DBUILD_SHARED_LIBS=OFF
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

build_abi() {
  local ABI=$1
  local ABI_DIR="$BUILD_DIR/$ABI"

  echo ""
  echo "=== Building Valhalla for Android $ABI ==="

  mkdir -p "$ABI_DIR"
  cd "$ABI_DIR"

  cmake "$DEPS_DIR/valhalla" \
    "${CMAKE_COMMON[@]}" \
    -DANDROID_ABI="$ABI" \
    -DCMAKE_INSTALL_PREFIX="$ABI_DIR/install" \
    -G Ninja

  cmake --build . --config Release --parallel "$(nproc 2>/dev/null || sysctl -n hw.ncpu)"
  cmake --install . --config Release

  # Copy the static lib to where android/cpp/CMakeLists.txt imports it.
  mkdir -p "$OUTPUT_DIR/jniLibs/$ABI"
  cp "$ABI_DIR/install/lib/libvalhalla.a" "$OUTPUT_DIR/jniLibs/$ABI/"

  echo "Built: $OUTPUT_DIR/jniLibs/$ABI/libvalhalla.a"
}

# Build for each ABI
build_abi "arm64-v8a"
build_abi "armeabi-v7a"
build_abi "x86_64"

echo ""
echo "=== Android build complete ==="
echo "Output: $OUTPUT_DIR/jniLibs/"
ls -la "$OUTPUT_DIR/jniLibs/"*/libvalhalla.a
