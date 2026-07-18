/** Tests cover the pure agent core (src/agent) — no React Native runtime needed. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/agent'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'commonjs', jsx: 'react-jsx', types: ['jest', 'node'] } }],
  },
}
