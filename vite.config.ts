import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: [
      "**/.agents/**/*",
      "**/.pi/**/*.json",
      "**/.pi/**/*.jsonl",
      "**/.pi/worktrees/**/*",
      "**/dist/**/*",
      "**/node_modules/**/*"
    ],
    sortImports: {
      groups: [
        "builtin",
        "external",
        ["internal", "subpath"],
        ["parent", "sibling", "index"],
        "style",
        "unknown"
      ],
      newlinesBetween: true
    },
    trailingComma: "none"
  },
  lint: {
    ignorePatterns: [".pi/**", "dist/**", "node_modules/**"],
    jsPlugins: [
      "@stylistic/eslint-plugin",
      "eslint-plugin-boundaries",
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }
    ],
    options: {
      denyWarnings: true,
      typeAware: true,
      typeCheck: true
    },
    overrides: [
      {
        files: ["packages/**"],
        rules: {
          "boundaries/dependencies": [
            "error",
            {
              default: "allow",
              policies: [
                {
                  disallow: { to: { element: { type: "extension" } } },
                  from: { element: { type: ["utils", "libs", "tui-components"] } },
                  message: "Shared packages must not depend on extensions."
                },
                {
                  disallow: { to: { element: { type: ["libs", "tui-components"] } } },
                  from: { element: { type: "utils" } },
                  message: "Pure utilities must not depend on stateful libraries or UI components."
                },
                {
                  disallow: { dependency: { source: "@(./|../|/)*([\\s\\S])" } },
                  message: "Import other workspace packages by package name through their exports."
                }
              ]
            }
          ],
          "boundaries/no-unknown-dependencies": "error",
          "boundaries/no-unknown-files": "error"
        }
      }
    ],
    plugins: ["typescript", "import", "unicorn"],
    rules: {
      "@stylistic/padding-line-between-statements": [
        "error",
        {
          blankLine: "always",
          next: ["block-like", "export", "interface", "type", "return"],
          prev: "*"
        },
        {
          blankLine: "always",
          next: "*",
          prev: ["block-like", "export", "interface", "type"]
        }
      ],
      complexity: "error",
      "eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              caseSensitive: true,
              group: ["./**", "../**", "!./**/*.ts", "!../**/*.ts"],
              message: "Relative imports must include the .ts extension."
            }
          ]
        }
      ],
      "eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ],
      "eslint/prefer-const": "warn",
      "import/extensions": ["error", "always", { checkTypeImports: true, ignorePackages: true }],
      "import/no-cycle": ["error", { ignoreExternal: true }],
      "import/no-self-import": "error",
      "typescript/consistent-type-assertions": [
        "error",
        {
          arrayLiteralTypeAssertions: "never",
          assertionStyle: "as",
          objectLiteralTypeAssertions: "never"
        }
      ],
      "typescript/consistent-type-imports": "error",
      "typescript/no-empty-object-type": ["error", { allowInterfaces: "always" }],
      "typescript/no-explicit-any": "warn",
      "typescript/no-floating-promises": [
        "warn",
        {
          ignoreIIFE: true
        }
      ],
      "typescript/no-this-alias": "off",
      "typescript/no-unnecessary-condition": "warn",
      "typescript/no-unnecessary-type-assertion": "error",
      "typescript/no-unsafe-argument": "error",
      "typescript/no-unsafe-assignment": "error",
      "typescript/no-unsafe-call": "error",
      "typescript/no-unsafe-declaration-merging": "error",
      "typescript/no-unsafe-member-access": "error",
      "typescript/no-unsafe-return": "error",
      "typescript/no-unsafe-type-assertion": "error",
      "typescript/strict-boolean-expressions": [
        "warn",
        {
          allowNullableBoolean: true,
          allowNullableNumber: false,
          allowNullableString: true,
          allowNumber: true
        }
      ],
      "unicorn/filename-case": [
        "error",
        {
          cases: {
            camelCase: true,
            kebabCase: true,
            pascalCase: true
          },
          ignore: ["\\.d\\.ts$"]
        }
      ],
      "vite-plus/prefer-vite-plus-imports": "error"
    },
    settings: {
      "boundaries/additional-dependency-nodes": [
        {
          kind: "type",
          name: "type-import-equals",
          selector:
            "TSImportEqualsDeclaration[importKind=type] > TSExternalModuleReference > Literal"
        }
      ],
      "boundaries/elements": [
        { pattern: "packages/extensions/*", type: "extension" },
        { pattern: "packages/utils", type: "utils" },
        { pattern: "packages/libs", type: "libs" },
        { pattern: "packages/tui-components", type: "tui-components" }
      ],
      "boundaries/flag-as-external": { unresolvableAlias: false },
      "boundaries/root-path": import.meta.dirname,
      "import/resolver": {
        typescript: {
          project: `${import.meta.dirname}/tsconfig.base.json`
        }
      }
    }
  },
  staged: {
    "*": String.raw`sh -c 'git --literal-pathspecs grep --cached -n -I -F -- "$(printf "\342\200\224")" "$@"; [ "$?" -eq 1 ]' sh`
  },
  test: {
    include: [
      "src/**/*.test.ts",
      "packages/*/src/**/*.test.ts",
      "packages/extensions/*/src/**/*.test.ts"
    ]
  }
});
