import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // El logo es un PNG chico local: no hace falta next/image.
      "@next/next/no-img-element": "off",
      // Al entrar/salir se recarga la página completa a propósito (limpia el estado de la sesión anterior).
      "@next/next/no-location-assign-relative-destination": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { varsIgnorePattern: "^_", argsIgnorePattern: "^_", ignoreRestSiblings: true }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "legacy/**", ".venv/**", "public/sw.js"]),
]);

export default eslintConfig;
