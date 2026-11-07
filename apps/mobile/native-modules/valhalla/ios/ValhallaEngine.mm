// ValhallaEngine — iOS native module (Approach A, in-process).
//
// Objective-C++ bridge that delegates to the shared C++ core (ValhallaCore),
// which links libvalhalla and calls actor_t in-process. No subprocess, no HTTP
// server. Supersedes ValhallaServerModule.swift (see ../SPIKE.md §2).
//
// Exposed to JS as NativeModules.ValhallaEngine with:
//   init(tileDir): Promise<void>
//   route(requestJson): Promise<string>   // Valhalla /route response JSON

#import <React/RCTBridgeModule.h>

#include <memory>
#include <string>

#include "ValhallaCore.h"

@interface ValhallaEngine : NSObject <RCTBridgeModule>
@end

@implementation ValhallaEngine {
  std::unique_ptr<bugrout::ValhallaCore> _core;
}

// Registers as NativeModules.ValhallaEngine.
RCT_EXPORT_MODULE(ValhallaEngine);

// Routing init/route are CPU-bound; run off the main thread on a dedicated
// serial queue (actor_t is not thread-safe — one queue keeps calls serialized).
- (dispatch_queue_t)methodQueue {
  static dispatch_queue_t queue;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    queue = dispatch_queue_create("app.bugrout.valhalla", DISPATCH_QUEUE_SERIAL);
  });
  return queue;
}

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

RCT_EXPORT_METHOD(init
                  : (NSString *)tileDir resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  if (!_core) {
    _core = std::make_unique<bugrout::ValhallaCore>();
  }
  std::string error;
  const bool ok = _core->init(std::string(tileDir.UTF8String), error);
  if (ok) {
    resolve(nil);
  } else {
    reject(@"VALHALLA_INIT_FAILED", [NSString stringWithUTF8String:error.c_str()], nil);
  }
}

RCT_EXPORT_METHOD(route
                  : (NSString *)requestJson resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject) {
  if (!_core || !_core->isReady()) {
    reject(@"VALHALLA_NOT_READY", @"Valhalla not initialized; call init() first", nil);
    return;
  }
  std::string error;
  const std::string response = _core->route(std::string(requestJson.UTF8String), error);
  if (error.empty()) {
    resolve([NSString stringWithUTF8String:response.c_str()]);
  } else {
    reject(@"VALHALLA_ROUTE_FAILED", [NSString stringWithUTF8String:error.c_str()], nil);
  }
}

@end
