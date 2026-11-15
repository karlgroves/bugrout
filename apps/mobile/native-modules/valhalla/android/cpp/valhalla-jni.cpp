// JNI bridge for ValhallaEngineModule.kt → shared ValhallaCore.
//
// Builds into libvalhalla_engine.so (see CMakeLists.txt), which statically links
// the prebuilt libvalhalla.a from build-scripts/build-android.sh.

#include <jni.h>

#include <memory>
#include <string>

#include "ValhallaCore.h"

namespace {
// One core for the app lifetime. Calls are serialized on the Kotlin side by a
// single-thread executor, so no extra locking is needed here beyond ValhallaCore's.
std::unique_ptr<bugrout::ValhallaCore> g_core;
std::string g_lastError;

std::string toStdString(JNIEnv* env, jstring s) {
  const char* chars = env->GetStringUTFChars(s, nullptr);
  std::string out(chars ? chars : "");
  if (chars) env->ReleaseStringUTFChars(s, chars);
  return out;
}
}  // namespace

extern "C" {

JNIEXPORT jstring JNICALL
Java_com_bugrout_valhalla_ValhallaEngineModule_nativeInit(JNIEnv* env,
                                                          jobject /*thiz*/,
                                                          jstring tileDir) {
  if (!g_core) g_core = std::make_unique<bugrout::ValhallaCore>();
  std::string error;
  const bool ok = g_core->init(toStdString(env, tileDir), error);
  if (ok) return nullptr;  // null = success
  return env->NewStringUTF(error.c_str());
}

JNIEXPORT jstring JNICALL
Java_com_bugrout_valhalla_ValhallaEngineModule_nativeRoute(JNIEnv* env,
                                                           jobject /*thiz*/,
                                                           jstring requestJson) {
  g_lastError.clear();
  if (!g_core || !g_core->isReady()) {
    g_lastError = "Valhalla not initialized; call init() first";
    return nullptr;
  }
  std::string error;
  const std::string response = g_core->route(toStdString(env, requestJson), error);
  if (!error.empty()) {
    g_lastError = error;
    return nullptr;
  }
  return env->NewStringUTF(response.c_str());
}

JNIEXPORT jstring JNICALL
Java_com_bugrout_valhalla_ValhallaEngineModule_nativeLastError(JNIEnv* env,
                                                              jobject /*thiz*/) {
  if (g_lastError.empty()) return nullptr;
  return env->NewStringUTF(g_lastError.c_str());
}

}  // extern "C"
