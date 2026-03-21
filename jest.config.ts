import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testPathIgnorePatterns: ['/node_modules/', '/tests/'],
  moduleNameMapper: {
    '\\.module\\.css$': '<rootDir>/src/__mocks__/styleMock.ts',
    '^../utils/env$': '<rootDir>/src/__mocks__/envMock.ts',
    '^../../utils/env$': '<rootDir>/src/__mocks__/envMock.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: './tsconfig.test.json',
      diagnostics: { ignoreCodes: [1343, 2339] },
    }],
  },
};

export default config;
