# Releasing

Two things ship from this repository, and they ship differently.

| What | Where it goes | How |
|---|---|---|
| The app | GitHub Pages, <https://lnkiai.github.io/m3e-canvas/> | Automatically, on every push to `main` (`.github/workflows/deploy.yml`) |
| The MCP server, `packages/mcp` | npm, as [`m3e-canvas`](https://www.npmjs.com/package/m3e-canvas) | By hand, with `npm publish` |

The app's version is in the root `package.json`, the server's in `packages/mcp/package.json`. They need not match: the server gets a patch release whenever it has to catch up with the app (see below), and the release tag `vX.Y.Z` follows the app.

## When the MCP server has to be published again

The server is one bundled file. At build time it takes a copy of the parts of the app it shares, so a change to any of these reaches people's agents only once a new version is on npm:

| File | What the server takes from it |
|---|---|
| `public/agent.md` | The guide `get_guide` hands out |
| `lib/check.ts`, `lib/project.ts` | What counts as a design the app can open, and what is warned about |
| `lib/share.ts` | The form of a link |
| `lib/prompt.ts`, `lib/tokens.ts`, `lib/i18n.ts` | The prompt `get_build_prompt` returns |
| `lib/widths.ts` | The widths of text-sized parts, which the prompt's layout is worked out from |

So after changing the guide, the checks, a part's fields or the prompt, publish the server as well. Use a patch version for fixes and wording, a minor one for a new tool or a new field, and a major one only if a tool stops answering or changes what it means. A tool that gets a new name keeps answering to the old one (`retired` in `packages/mcp/src/tools.ts`).

Two rules keep old versions working, and old versions stay in use for a long time because `npx` caches what it has downloaded:

- **A link made by any published version must keep opening.** Fields may be added to the design format; existing ones keep their meaning. `public/agent.md` promises this.
- **A new kind of part that is as wide as its text** (listed in `MEASURED` in `lib/tokens.ts`) needs its width worked out in `lib/widths.ts` too, or the server's prompt places it differently from the app's.

## Steps

1. **Check.** Everything CI runs, plus the server's build:

   ```bash
   npm run typecheck && npm test && npm run build && npm run build:mcp
   ```

2. **Set the versions** in the root `package.json` and `package-lock.json`, and in `packages/mcp/package.json` if the server is going out. Add the release to `CHANGELOG.md`.

3. **Try the server with a real client** before it is published, from the built file. A published version cannot be replaced.

   ```bash
   claude mcp add m3e-canvas -- node /absolute/path/to/packages/mcp/dist/server.mjs
   ```

   Try `node packages/mcp/dist/server.mjs setup` and `remove` in a terminal too: the tests do not cover the typing.

   Ask for a design, open the link, then give the link back and ask for the app to be built. Remove it afterwards with `claude mcp remove m3e-canvas`. To have the links open a local copy of the app, set `M3E_CANVAS_URL` (for example `--env M3E_CANVAS_URL=http://127.0.0.1:3000/`).

4. **Publish the server first.** The app's guide tells people to run `npx -y m3e-canvas@latest setup`, so a version that has the command must be on npm before the app that mentions it: 1.0.0 does not know `setup`, and would start the server and wait.

   ```bash
   cd packages/mcp
   npm publish --dry-run    # look at what would go out: dist/server.mjs, README.md, LICENSE, package.json
   npm publish --access public
   npx -y m3e-canvas@latest --version
   ```

   `prepublishOnly` builds the bundle, so what goes out is always built from the working tree: publish from a clean checkout of the commit being released.

5. **Push `main`.** This deploys the app. The deploy and the tests are separate workflows, so a failing test does not stop a deploy: look at both runs under Actions.

6. **Tag and release.**

   ```bash
   git tag vX.Y.Z && git push origin vX.Y.Z
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <the release's section of CHANGELOG.md>
   ```

7. **Look at the result.** Open the app, the projects page and `/mcp/`; open a design link; with the published server connected, ask an agent for a design.

## If something is wrong

- **The app.** Revert the commit on `main` and push; Pages redeploys the previous state. People's projects are in their browser's IndexedDB and are not touched by a deploy. The single design that older versions kept in `localStorage` is copied into the projects, never deleted, so a reverted app still finds it.
- **The server.** A published version cannot be changed or reused. Publish the fix as the next patch version, and mark the bad one:

  ```bash
  npm deprecate m3e-canvas@X.Y.Z "Use X.Y.Z+1: <what was wrong>"
  ```
