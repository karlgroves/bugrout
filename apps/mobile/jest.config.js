module.exports = {
  preset: "jest-expo",
  transformIgnorePatterns: [
    // pnpm uses .pnpm symlinks, so we need to match both patterns
    "node_modules/(?!(.pnpm|((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|native-base|react-native-svg|zustand|uuid|@react-native/js-polyfills))",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@bugrout/shared$": "<rootDir>/../../packages/shared/src/index.ts",
  },
  testPathIgnorePatterns: ["/node_modules/", "/e2e/"],
  // Raised from Jest's 5s default after MapDetailSheet.test.tsx went red
  // intermittently on a loaded machine (PR #116), always as "Exceeded timeout
  // of 5000 ms" on `renders its children when open`, never as a real failure.
  //
  // What is established:
  //   - Nothing in that test is timer-driven, so there is no timer to fake.
  //     `Modal.js` in RN 0.81 contains no Animated, setTimeout or
  //     requestAnimationFrame; `animationType` is forwarded to the native view,
  //     which does not exist under Jest.
  //   - There is no later state to await either. RNTL 14's `render` already
  //     awaits React's async `act`, which is the settled condition.
  //   - Fake timers measure strictly worse: they turn that test's first render
  //     from ~250ms into ~1285ms, moving it closer to the limit, not away.
  //   - The cost is a cold-start one: the first render in a worker process
  //     compiles a slice of RN's module graph and Jest bills it to whichever
  //     test triggers it. MapDetailSheet is the only component in the app that
  //     mounts a Modal, and its first test measures 47-252ms cold against
  //     1-2ms for its siblings.
  //
  // What is NOT established is the step from that to a 5s overrun. Attempts to
  // reproduce it failed: at load average 250 with ~50 competing jest processes
  // and swap nearly full, the full suite passed with the 5s budget, and the
  // slowest test in the workspace measured 448ms. So the mechanism behind the
  // observed overrun is still unexplained, and this setting is a hedge against
  // the reported symptom rather than a fix for a diagnosed cause.
  //
  // It is cheap in that role: it costs nothing while tests are fast, and it
  // only changes behaviour in the reported mode, where nothing is hanging and
  // the budget simply ran out. A genuinely hung test still reports, in 30s
  // rather than 5s. If these suites start timing out again, the cause is
  // something this setting is not addressing -- investigate, do not raise it.
  testTimeout: 30_000,
};
