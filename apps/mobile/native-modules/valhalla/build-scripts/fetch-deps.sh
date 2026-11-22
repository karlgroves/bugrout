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
# Published by Boost beside the tarball (boost_1_84_0.tar.gz.json). Change it
# with BOOST_VERSION: the download is compiled into the app, so it is verified.
BOOST_SHA256="a5800f405508f5df8114558ca9855d2640a2de8f0445f051fa1c7c3383045724"
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
  # archives.boost.io is Boost's own archive. The previous host,
  # boostorg.jfrog.io, was retired in 2024 and now answers every release URL
  # with an HTML error page — curl -L saved that page as the tarball and the
  # script died at `tar` with "Unrecognized archive format", after leaving an
  # empty boost/ behind that made the next run skip the download entirely.
  BOOST_URL="https://archives.boost.io/release/${BOOST_VERSION//_/.}/source/${BOOST_FILE}"
  echo "Downloading Boost ${BOOST_VERSION}..."
  # --fail so an error page is an error here, not a corrupt archive later.
  curl --fail -L -o "$BOOST_FILE" "$BOOST_URL"
  if ! echo "${BOOST_SHA256}  ${BOOST_FILE}" | shasum -a 256 -c -; then
    rm -f "$BOOST_FILE"
    echo "Error: ${BOOST_FILE} does not match its published SHA-256." >&2
    exit 1
  fi
  # Extract to a temp dir and move it into place only on success, so a failed
  # run never leaves a boost/ that the guard above reads as "already present".
  rm -rf boost.tmp
  mkdir -p boost.tmp
  tar xzf "$BOOST_FILE" --strip-components=1 -C boost.tmp
  mv boost.tmp boost
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
