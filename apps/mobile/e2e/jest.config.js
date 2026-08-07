/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  rootDir: "..",
  testMatch: ["<rootDir>/e2e/**/*.test.ts"],
  testTimeout: 120000,
  maxWorkers: 1,
  globalSetup: "detox/runners/jest/globalSetup",
  globalTeardown: "detox/runners/jest/globalTeardown",
  reporters: ["detox/runners/jest/reporter"],
  testEnvironment: "detox/runners/jest/testEnvironment",
  verbose: true,
  // These specs are TypeScript and run in Node (not the RN runtime), so the
  // jest-expo preset used by the unit tests does not apply here. With no
  // transform at all, jest read the raw .ts and died on the first import:
  //   SyntaxError: Cannot use import statement outside a module
  // ts-jest rather than babel-jest because pnpm's isolated node_modules does
  // not expose babel-jest or babel-preset-expo to this workspace — they are
  // jest-expo's own transitive deps. Module settings are pinned inline so the
  // emitted code is CommonJS regardless of what expo/tsconfig.base sets.
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          target: "es2022",
          esModuleInterop: true,
          isolatedModules: true,
        },
      },
    ],
  },
};
