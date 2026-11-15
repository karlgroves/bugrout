# Local CocoaPod for the in-process Valhalla native module.
#
# Vendored into the prebuilt iOS project by config-plugin.js, which also adds
#   pod 'ValhallaEngine', :path => './native-modules/valhalla'
# to the Podfile. Compiles the Objective-C++ binding + the shared C++ core and
# links the prebuilt Valhalla static library (bin/ios/valhalla.xcframework).
#
# This podspec sits at the module root, NOT in ios/, on purpose. CocoaPods
# silently drops `source_files` entries that resolve outside the podspec's own
# directory, so the previous `ios/ValhallaEngine.podspec` with
# `'../cpp/ValhallaCore.{h,cpp}'` built an archive containing only
# ValhallaEngine.o — every bugrout::ValhallaCore symbol was undefined at app
# link time. Keeping the podspec above both source trees fixes that.

Pod::Spec.new do |s|
  s.name         = 'ValhallaEngine'
  s.version      = '0.1.0'
  s.summary      = 'In-process Valhalla routing (BugRout Approach A)'
  s.homepage     = 'https://github.com/karlgroves/bugrout'
  s.license      = { :type => 'MIT' }
  s.author       = 'BugRout'
  s.platforms    = { :ios => '15.0' }
  s.source       = { :path => '.' }

  # Objective-C++ binding + shared C++ core, both inside the pod root.
  s.source_files = 'ios/ValhallaEngine.mm', 'cpp/*.{h,cpp}'

  # Prebuilt Valhalla static lib produced by build-scripts/build-ios.sh. The
  # archive inside it already has protobuf and abseil merged in, so there is
  # nothing else to link.
  s.vendored_frameworks = 'bin/ios/valhalla.xcframework'

  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'CLANG_CXX_LIBRARY'           => 'libc++',
    'HEADER_SEARCH_PATHS' => [
      '"$(PODS_TARGET_SRCROOT)/cpp"',
      # Valhalla + Boost headers fetched by build-scripts/fetch-deps.sh.
      '"$(PODS_TARGET_SRCROOT)/deps/valhalla"',
      '"$(PODS_TARGET_SRCROOT)/deps/valhalla/valhalla"',
      '"$(PODS_TARGET_SRCROOT)/deps/boost"',
      # Valhalla's own vendored headers, which its public headers include
      # unprefixed (valhalla/baldr/datetime.h does #include <date/date.h>).
      '"$(PODS_TARGET_SRCROOT)/deps/valhalla/third_party/date/include"',
      '"$(PODS_TARGET_SRCROOT)/deps/valhalla/third_party/rapidjson/include"',
      '"$(PODS_TARGET_SRCROOT)/deps/valhalla/third_party/robin-hood-hashing/src/include"',
      # Headers generated during the Valhalla build (valhalla/config.h and the
      # protobuf-generated valhalla/proto/*.pb.h, which protoc writes under
      # src/), plus protobuf's own headers.
      '"$(PODS_TARGET_SRCROOT)/build/ios/sim"',
      '"$(PODS_TARGET_SRCROOT)/build/ios/sim/src"',
      '"$(PODS_TARGET_SRCROOT)/build/protobuf/ios-sim-install/include"',
    ].join(' '),
  }

  # libz ships with iOS; protobuf is inside the xcframework's archive.
  s.libraries = 'z', 'c++'

  s.dependency 'React-Core'
end
