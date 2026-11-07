# Local CocoaPod for the in-process Valhalla native module.
#
# Vendored into the prebuilt iOS project by config-plugin.js, which also adds
#   pod 'ValhallaEngine', :path => './native-modules/valhalla/ios'
# to the Podfile. Compiles the Objective-C++ binding + the shared C++ core and
# links the prebuilt Valhalla static library (valhalla.xcframework).

require 'json'

Pod::Spec.new do |s|
  s.name         = 'ValhallaEngine'
  s.version      = '0.1.0'
  s.summary      = 'In-process Valhalla routing (BugRout Approach A spike)'
  s.homepage     = 'https://github.com/karlgroves/bugrout'
  s.license      = { :type => 'MIT' }
  s.author       = 'BugRout'
  s.platforms    = { :ios => '15.0' }
  s.source       = { :path => '.' }

  # Objective-C++ binding (this dir) + shared C++ core (../cpp).
  s.source_files = 'ValhallaEngine.mm', '../cpp/ValhallaCore.{h,cpp}'

  # Prebuilt Valhalla static lib produced by build-scripts/build-ios.sh.
  s.vendored_frameworks = '../bin/ios/valhalla.xcframework'

  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'CLANG_CXX_LIBRARY'           => 'libc++',
    # Boost + Valhalla headers fetched by build-scripts/fetch-deps.sh.
    'HEADER_SEARCH_PATHS' => [
      '"$(PODS_TARGET_SRCROOT)/../cpp"',
      '"$(PODS_TARGET_SRCROOT)/../deps/valhalla"',
      '"$(PODS_TARGET_SRCROOT)/../deps/boost"',
    ].join(' '),
  }

  # libz ships with iOS; protobuf is statically linked inside the xcframework.
  s.libraries = 'z', 'c++'

  s.dependency 'React-Core'
end
