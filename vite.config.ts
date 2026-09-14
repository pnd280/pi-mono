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
              checkInternals: true,
              checkAllOrigins: true,
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
                  disallow: {
                    dependency: {
                      source: "@(./|../|/)*([\\s\\S])",
                      // Separate package elements have no relationship (null).
                      relationship: { to: [null, "!internal"] }
                    }
                  },
                  message: "Import other workspace packages by package name through their exports."
                },
                {
                  from: { file: { categories: { noneOf: ["test", "fixture", "validation"] } } },
                  disallow: { to: { file: { categories: ["test", "fixture", "validation"] } } },
                  message: "Runtime modules must not import tests or validation fixtures."
                },
                {
                  from: {
                    file: {
                      categories: { allOf: ["display-rendering"], noneOf: ["test", "fixture"] }
                    }
                  },
                  disallow: {
                    to: {
                      file: {
                        categories: ["display-host", "display-transcript", "display-observation"]
                      }
                    }
                  },
                  message:
                    "Rendering consumes display contracts, not host, transcript, or observation implementations."
                },
                {
                  from: {
                    file: {
                      categories: { allOf: ["display-transcript"], noneOf: ["test", "fixture"] }
                    }
                  },
                  disallow: { to: { file: { categories: ["display-host", "display-rendering"] } } },
                  message:
                    "Transcript orchestration must stay independent of Pi-private integration and rendering."
                },
                {
                  from: {
                    file: {
                      categories: { allOf: ["display-observation"], noneOf: ["test", "fixture"] }
                    }
                  },
                  disallow: {
                    to: {
                      file: {
                        categories: ["display-host", "display-transcript", "display-rendering"]
                      }
                    }
                  },
                  message:
                    "Observation publishes facts through contracts, not host or transcript implementations."
                },
                {
                  from: {
                    file: {
                      categories: {
                        anyOf: ["display-adapter", "display-core"],
                        noneOf: ["test", "fixture", "display-entry"]
                      }
                    }
                  },
                  disallow: {
                    to: {
                      file: {
                        categories: [
                          "display-host",
                          "display-transcript",
                          "display-observation",
                          "display-rendering"
                        ]
                      }
                    }
                  },
                  message:
                    "Display contracts and tool interpretation must not depend on runtime integration or card layout."
                },
                {
                  from: {
                    file: {
                      categories: {
                        anyOf: ["display-rendering", "display-adapter", "display-core"],
                        noneOf: ["test", "fixture", "display-entry"]
                      }
                    }
                  },
                  disallow: {
                    to: {
                      module: {
                        origin: "core",
                        source: [
                          "{node:,}fs{,/**}",
                          "{node:,}child_process",
                          "{node:,}{net,http,https,tls,dgram}"
                        ]
                      }
                    }
                  },
                  message:
                    "Display presentation and contracts must not perform filesystem, process, or network I/O."
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
      "boundaries/files": [
        { pattern: "packages/**/*.ts", category: "source" },
        { pattern: "**/*.test.ts", category: "test" },
        { pattern: "**/test-fixture.ts", category: "fixture" },
        { pattern: "packages/extensions/*/validation/**", category: "validation" },
        { pattern: "packages/extensions/pi-tool-display/src/host/**", category: "display-host" },
        {
          pattern: "packages/extensions/pi-tool-display/src/transcript/**",
          category: "display-transcript"
        },
        {
          pattern: "packages/extensions/pi-tool-display/src/observation/**",
          category: "display-observation"
        },
        {
          pattern: "packages/extensions/pi-tool-display/src/rendering/**",
          category: "display-rendering"
        },
        {
          pattern: "packages/extensions/pi-tool-display/src/adapters/**",
          category: "display-adapter"
        },
        { pattern: "packages/extensions/pi-tool-display/src/*.ts", category: "display-core" },
        { pattern: "packages/extensions/pi-tool-display/src/index.ts", category: "display-entry" }
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
      "validation/**/*.test.ts",
      "packages/*/src/**/*.test.ts",
      "packages/extensions/*/src/**/*.test.ts",
      "packages/extensions/*/validation/**/*.test.ts"
    ]
  }
});
