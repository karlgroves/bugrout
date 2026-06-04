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
};
