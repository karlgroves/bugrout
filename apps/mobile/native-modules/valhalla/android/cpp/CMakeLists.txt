# Builds libvalhalla_engine.so: the JNI bridge + shared C++ core, statically
# linked against the prebuilt libvalhalla.a from build-scripts/build-android.sh.
#
# Referenced from the app module's build.gradle via:
#   externalNativeBuild { cmake { path "…/native-modules/valhalla/android/cpp/CMakeLists.txt" } }
# (config-plugin.js injects this during prebuild.)

cmake_minimum_required(VERSION 3.20)
project(valhalla_engine CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

set(NATIVE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/../..)   # native-modules/valhalla
set(PREBUILT_DIR ${NATIVE_DIR}/bin/android/jniLibs/${ANDROID_ABI})
set(DEPS_DIR ${NATIVE_DIR}/deps)

add_library(valhalla_engine SHARED
  valhalla-jni.cpp
  ${NATIVE_DIR}/cpp/ValhallaCore.cpp
)

target_include_directories(valhalla_engine PRIVATE
  ${NATIVE_DIR}/cpp
  ${DEPS_DIR}/valhalla
  ${DEPS_DIR}/boost
)

# Prebuilt Valhalla static lib (per-ABI), produced by build-android.sh.
add_library(valhalla STATIC IMPORTED)
set_target_properties(valhalla PROPERTIES
  IMPORTED_LOCATION ${PREBUILT_DIR}/libvalhalla.a)

find_library(log-lib log)
find_library(z-lib z)

target_link_libraries(valhalla_engine
  valhalla
  ${z-lib}
  ${log-lib}
)
