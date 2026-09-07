/// <reference types="node" />

import { defineConfig } from "oxlint";

export default defineConfig({
  ignorePatterns: [".pi/**", "dist/**", "node_modules/**"],
  plugins: ["typescript", "import", "unicorn"],
  jsPlugins: ["eslint-plugin-boundaries"],
  settings: {
    "boundaries/root-path": import.meta.dirname,
    "boundaries/elements": [
      { type: "extension", pattern: "packages/extensions/*" },
      { type: "utils", pattern: "packages/utils" },
      { type: "libs", pattern: "packages/libs" },
      { type: "tui-components", pattern: "packages/tui-components" },
    ],
    "boundaries/additional-dependency-nodes": [
      {
        selector:
          "TSImportEqualsDeclaration[importKind=type] > TSExternalModuleReference > Literal",
        kind: "type",
      },
    ],
    "boundaries/flag-as-external": { unresolvableAlias: false },
    "import/resolver": {
      typescript: {
        project: `${import.meta.dirname}/tsconfig.base.json`,
      },
    },
  },
  options: {
    denyWarnings: true,
    typeAware: true,
    typeCheck: true,
  },
  rules: {
    complexity: "error",
    "import/extensions": ["error", "always", { ignorePackages: true, checkTypeImports: true }],
    "eslint/no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["./**", "../**", "!./**/*.ts", "!../**/*.ts"],
            caseSensitive: true,
            message: "Relative imports must include the .ts extension.",
          },
        ],
      },
    ],
    "import/no-cycle": ["error", { ignoreExternal: true }],
    "import/no-self-import": "error",
    "unicorn/filename-case": [
      "error",
      {
        cases: {
          pascalCase: true,
          kebabCase: true,
          camelCase: true,
        },
        ignore: ["\\.d\\.ts$"],
      },
    ],
    "eslint/prefer-const": "warn",
    "typescript/consistent-type-imports": "error",
    "typescript/no-unnecessary-condition": "warn",
    "typescript/no-explicit-any": "warn",
    "typescript/no-floating-promises": [
      "warn",
      {
        ignoreIIFE: true,
      },
    ],
    "typescript/strict-boolean-expressions": [
      "warn",
      {
        allowNumber: true,
        allowNullableString: true,
        allowNullableNumber: false,
        allowNullableBoolean: true,
      },
    ],
    "typescript/no-this-alias": "off",
    "typescript/no-unsafe-declaration-merging": "error",
    "typescript/no-empty-object-type": ["error", { allowInterfaces: "always" }],
    "eslint/no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      },
    ],
  },
  overrides: [
    {
      files: ["packages/**"],
      rules: {
        "boundaries/no-unknown-files": "error",
        "boundaries/no-unknown-dependencies": "error",
        "boundaries/dependencies": [
          "error",
          {
            default: "allow",
            policies: [
              {
                from: { element: { type: ["utils", "libs", "tui-components"] } },
                disallow: { to: { element: { type: "extension" } } },
                message: "Shared packages must not depend on extensions.",
              },
              {
                from: { element: { type: "utils" } },
                disallow: { to: { element: { type: ["libs", "tui-components"] } } },
                message: "Pure utilities must not depend on stateful libraries or UI components.",
              },
              {
                disallow: { dependency: { source: "@(./|../|/)*([\\s\\S])" } },
                message: "Import other workspace packages by package name through their exports.",
              },
            ],
          },
        ],
      },
    },
  ],
});
