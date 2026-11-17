// Formatting is Prettier's job (as in Liftsmith): width 140, imports sorted and grouped.
/** @type {import("prettier").Config} */
const config = {
  printWidth: 140,
  plugins: ["@ianvs/prettier-plugin-sort-imports"],
  importOrder: ["<BUILTIN_MODULES>", "<THIRD_PARTY_MODULES>", "", "^@/(.*)$", "", "^[./]"],
  importOrderTypeScriptVersion: "5.0.0",
};

export default config;
