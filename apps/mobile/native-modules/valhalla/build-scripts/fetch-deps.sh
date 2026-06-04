#!/usr/bin/env bash
set -euo pipefail

# Fetch Valhalla and all dependencies for cross-compilation.
#
# Dependencies:
# - Valhalla (routing engine)
# - Boost (headers only for most parts)
# - Protobuf (protocol buffers)
# - zlib (compression)
# - LZ4 (fast compression)
# - libcurl (HTTP, for tile fetching)
#
# Usage: ./fetch-deps.sh [output-dir]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPS_DIR="${1:-${SCRIPT_DIR}/../deps}"

VALHALLA_VERSION="3.5.1"
BOOST_VERSION="1_84_0"
PROTOBUF_VERSION="25.3"
LZ4_VERSION="1.9.4"

mkdir -p "$DEPS_DIR"
cd "$DEPS_DIR"

echo "=== Fetching Valhalla dependencies ==="

# --- Valhalla ---
if [[ ! -d "valhalla" ]]; then
  echo "Cloning Valhalla v${VALHALLA_VERSION}..."
  git clone --depth 1 --branch "${VALHALLA_VERSION}" \
    https://github.com/valhalla/valhalla.git
  cd valhalla
  git submodule update --init --recursive --depth 1
  cd ..
else
  echo "Valhalla already present."
fi

# --- Boost (headers only) ---
if [[ ! -d "boost" ]]; then
  BOOST_FILE="boost_${BOOST_VERSION}.tar.gz"
  BOOST_URL="https://boostorg.jfrog.io/artifactory/main/release/${BOOST_VERSION//_/.}/source/${BOOST_FILE}"
  echo "Downloading Boost ${BOOST_VERSION}..."
  curl -L -o "$BOOST_FILE" "$BOOST_URL"
  mkdir -p boost
  tar xzf "$BOOST_FILE" --strip-components=1 -C boost
  rm "$BOOST_FILE"
else
  echo "Boost already present."
fi

# --- Protobuf ---
if [[ ! -d "protobuf" ]]; then
  echo "Cloning Protobuf v${PROTOBUF_VERSION}..."
  git clone --depth 1 --branch "v${PROTOBUF_VERSION}" \
    https://github.com/protocolbuffers/protobuf.git
  cd protobuf
  git submodule update --init --recursive --depth 1
  cd ..
else
  echo "Protobuf already present."
fi

# --- LZ4 ---
if [[ ! -d "lz4" ]]; then
  echo "Cloning LZ4 v${LZ4_VERSION}..."
  git clone --depth 1 --branch "v${LZ4_VERSION}" \
    https://github.com/lz4/lz4.git
else
  echo "LZ4 already present."
fi

echo ""
echo "=== Dependencies fetched to ${DEPS_DIR} ==="
echo "  valhalla/ — Valhalla ${VALHALLA_VERSION}"
echo "  boost/    — Boost ${BOOST_VERSION//_/.}"
echo "  protobuf/ — Protobuf ${PROTOBUF_VERSION}"
echo "  lz4/      — LZ4 ${LZ4_VERSION}"
