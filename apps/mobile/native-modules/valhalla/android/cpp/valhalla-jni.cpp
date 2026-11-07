// JNI bridge for ValhallaEngineModule.kt → shared ValhallaCore.
//
// Builds into libvalhalla_engine.so (see CMakeLists.txt), which statically links
// the prebuilt libvalhalla.a from build-scripts/build-android.sh.

#include <jni.h>

#include <cstdint>
#include <memory>
#include <string>

#include "ValhallaCore.h"

namespace {
// One core for the app lifetime. Calls are serialized on the Kotlin side by a
// single-thread executor, so no extra locking is needed here beyond ValhallaCore's.
std::unique_ptr<bugrout::ValhallaCore> g_core;
std::string g_lastError;

// JNI's *UTF* string functions speak modified UTF-8, which encodes characters
// outside the BMP as surrogate pairs and rejects 4-byte sequences (CheckJNI
// aborts on them). Valhalla reads and writes standard UTF-8, so strings cross
// the boundary as UTF-16 and are converted here.
std::string toStdString(JNIEnv* env, jstring s) {
  const jsize len = env->GetStringLength(s);
  const jchar* chars = env->GetStringChars(s, nullptr);
  if (!chars) return "";
  std::string out;
  out.reserve(static_cast<size_t>(len));
  for (jsize i = 0; i < len; ++i) {
    uint32_t cp = chars[i];
    if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < len && chars[i + 1] >= 0xDC00 &&
        chars[i + 1] <= 0xDFFF) {
      cp = 0x10000 + ((cp - 0xD800) << 10) + (chars[++i] - 0xDC00);
    } else if (cp >= 0xD800 && cp <= 0xDFFF) {
      cp = 0xFFFD;  // unpaired surrogate
    }
    if (cp < 0x80) {
      out += static_cast<char>(cp);
    } else if (cp < 0x800) {
      out += static_cast<char>(0xC0 | (cp >> 6));
      out += static_cast<char>(0x80 | (cp & 0x3F));
    } else if (cp < 0x10000) {
      out += static_cast<char>(0xE0 | (cp >> 12));
      out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
      out += static_cast<char>(0x80 | (cp & 0x3F));
    } else {
      out += static_cast<char>(0xF0 | (cp >> 18));
      out += static_cast<char>(0x80 | ((cp >> 12) & 0x3F));
      out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F));
      out += static_cast<char>(0x80 | (cp & 0x3F));
    }
  }
  env->ReleaseStringChars(s, chars);
  return out;
}

jstring toJString(JNIEnv* env, const std::string& s) {
  std::u16string out;
  out.reserve(s.size());
  const auto* b = reinterpret_cast<const unsigned char*>(s.data());
  const size_t n = s.size();
  for (size_t i = 0; i < n;) {
    uint32_t cp = 0xFFFD;
    size_t extra = 0;
    if (b[i] < 0x80) {
      cp = b[i];
    } else if ((b[i] & 0xE0) == 0xC0) {
      cp = b[i] & 0x1F;
      extra = 1;
    } else if ((b[i] & 0xF0) == 0xE0) {
      cp = b[i] & 0x0F;
      extra = 2;
    } else if ((b[i] & 0xF8) == 0xF0) {
      cp = b[i] & 0x07;
      extra = 3;
    }
    size_t j = 1;
    for (; j <= extra && i + j < n && (b[i + j] & 0xC0) == 0x80; ++j) {
      cp = (cp << 6) | (b[i + j] & 0x3F);
    }
    if (j <= extra) cp = 0xFFFD;  // truncated sequence
    i += j;
    if (cp >= 0x10000 && cp <= 0x10FFFF) {
      cp -= 0x10000;
      out += static_cast<char16_t>(0xD800 + (cp >> 10));
      out += static_cast<char16_t>(0xDC00 + (cp & 0x3FF));
    } else {
      out += static_cast<char16_t>(cp > 0x10FFFF ? 0xFFFD : cp);
    }
  }
  return env->NewString(reinterpret_cast<const jchar*>(out.data()),
                        static_cast<jsize>(out.size()));
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
  return toJString(env, error);
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
  return toJString(env, response);
}

JNIEXPORT jstring JNICALL
Java_com_bugrout_valhalla_ValhallaEngineModule_nativeLastError(JNIEnv* env,
                                                              jobject /*thiz*/) {
  if (g_lastError.empty()) return nullptr;
  return toJString(env, g_lastError);
}

}  // extern "C"
