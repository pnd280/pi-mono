import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": String.raw`sh -c 'git --literal-pathspecs grep --cached -n -I -F -- "$(printf "\342\200\224")" "$@"; [ "$?" -eq 1 ]' sh`
  },
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
    plugins: ["typescript", "import", "unicorn"],
    jsPlugins: [
      "@stylistic/eslint-plugin",
      "eslint-plugin-boundaries",
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }
    ],
    settings: {
      "boundaries/root-path": import.meta.dirname,
      "boundaries/elements": [
        { type: "extension", pattern: "packages/extensions/*" },
        { type: "utils", pattern: "packages/utils" },
        { type: "libs", pattern: "packages/libs" },
        { type: "tui-components", pattern: "packages/tui-components" }
      ],
      "boundaries/additional-dependency-nodes": [
        {
          name: "type-import-equals",
          selector:
            "TSImportEqualsDeclaration[importKind=type] > TSExternalModuleReference > Literal",
          kind: "type"
        }
      ],
      "boundaries/flag-as-external": { unresolvableAlias: false },
      "import/resolver": {
        typescript: {
          project: `${import.meta.dirname}/tsconfig.base.json`
        }
      }
    },
    options: {
      denyWarnings: true,
      typeAware: true,
      typeCheck: true
    },
    rules: {
      "@stylistic/padding-line-between-statements": [
        "error",
        {
          blankLine: "always",
          prev: "*",
          next: ["block-like", "export", "interface", "type", "return"]
        },
        {
          blankLine: "always",
          prev: ["block-like", "export", "interface", "type"],
          next: "*"
        }
      ],
      "vite-plus/prefer-vite-plus-imports": "error",
      complexity: "error",
      "import/extensions": ["error", "always", { ignorePackages: true, checkTypeImports: true }],
      "eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["./**", "../**", "!./**/*.ts", "!../**/*.ts"],
              caseSensitive: true,
              message: "Relative imports must include the .ts extension."
            }
          ]
        }
      ],
      "import/no-cycle": ["error", { ignoreExternal: true }],
      "import/no-self-import": "error",
      "unicorn/filename-case": [
        "error",
        {
          cases: {
            pascalCase: true,
            kebabCase: true,
            camelCase: true
          },
          ignore: ["\\.d\\.ts$"]
        }
      ],
      "eslint/prefer-const": "warn",
      "typescript/consistent-type-imports": "error",
      "typescript/no-unsafe-type-assertion": "error",
      "typescript/no-unnecessary-type-assertion": "error",
      "typescript/no-unnecessary-condition": "warn",
      "typescript/no-unsafe-assignment": "error",
      "typescript/no-unsafe-argument": "error",
      "typescript/no-unsafe-call": "error",
      "typescript/no-unsafe-member-access": "error",
      "typescript/no-unsafe-return": "error",
      "typescript/no-explicit-any": "warn",
      "typescript/consistent-type-assertions": [
        "error",
        {
          assertionStyle: "as",
          objectLiteralTypeAssertions: "never",
          arrayLiteralTypeAssertions: "never"
        }
      ],
      "typescript/no-floating-promises": [
        "warn",
        {
          ignoreIIFE: true
        }
      ],
      "typescript/strict-boolean-expressions": [
        "warn",
        {
          allowNumber: true,
          allowNullableString: true,
          allowNullableNumber: false,
          allowNullableBoolean: true
        }
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
          destructuredArrayIgnorePattern: "^_"
        }
      ]
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
                  message: "Shared packages must not depend on extensions."
                },
                {
                  from: { element: { type: "utils" } },
                  disallow: { to: { element: { type: ["libs", "tui-components"] } } },
                  message: "Pure utilities must not depend on stateful libraries or UI components."
                },
                {
                  disallow: { dependency: { source: "@(./|../|/)*([\\s\\S])" } },
                  message: "Import other workspace packages by package name through their exports."
                }
              ]
            }
          ]
        }
      }
    ]
  },
  test: {
    include: [
      "src/**/*.test.ts",
      "packages/*/src/**/*.test.ts",
      "packages/extensions/*/src/**/*.test.ts"
    ]
  }
});
