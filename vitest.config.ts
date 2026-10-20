import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['node_modules/**', 'dist/**', 'cdk/lib/**', 'cdk/cdk.out/**']
  }
});
