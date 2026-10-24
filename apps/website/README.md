# Website

The marketing site for this workspace uses [TanStack Start](https://tanstack.com/start), React, TypeScript, and Tailwind CSS.

```sh
vpr '@pi-mono/website#dev'
```

The development server listens on port 3000.

## Usage

Complete [workspace setup](../../README.md#setup), then run these commands from the repository root:

| Command                          | Result                                                          |
| -------------------------------- | --------------------------------------------------------------- |
| `vpr '@pi-mono/website#dev'`     | Starts the development server on port 3000.                     |
| `vpr '@pi-mono/website#build'`   | Builds the client and server bundles into `apps/website/dist/`. |
| `vpr '@pi-mono/website#preview'` | Serves the production build.                                    |
| `vpr '@pi-mono/website#check'`   | Checks formatting, lint, and types with the workspace config.   |

When you change the extension list, the hero, or the routes, read the [website development notes](AGENTS.md).
