import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { validateReleaseEnvironment } from "./scripts/release-safety.mjs";

export default defineConfig(({ command, mode }) => {
  // Protect every production build, including ios:sync, before Vite writes
  // public assets. Development and isolated tests may use fictional config.
  if (command === "build") {
    validateReleaseEnvironment(loadEnv(mode, fileURLToPath(new URL(".", import.meta.url)), "VITE_"));
  }
  return {
  plugins: [react()],
  // Relative asset URLs work both on the website and inside Capacitor's
  // bundled iOS web view.
  base: "./",
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    css: true,
  },
  };
});
