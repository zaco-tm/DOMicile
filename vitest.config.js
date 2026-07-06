import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: [
      "tests/**/*.test.{js,ts,tsx}",
      "packages/**/tests/**/*.test.{js,ts,tsx}",
    ],
    globals: false,
  },
});
