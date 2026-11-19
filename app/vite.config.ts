import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base "./" agar build statis bisa di-host di GitHub Pages (sub-path) maupun
// root domain tanpa perubahan.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
