import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rolldown } from "rolldown";

/* Bundles the server into one file with nothing to install beside it, so `npx` starts it at
 * once. The app's own library is bundled in, which is what keeps the server's idea of a valid
 * design the same as the editor's. The guide is written into the file as it stands today. */

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));
/* one line ending whatever the checkout used */
const guide = readFileSync(join(here, "../../public/agent.md"), "utf8").replace(/\r\n/g, "\n");

rmSync(join(here, "dist"), { recursive: true, force: true });
mkdirSync(join(here, "dist"), { recursive: true });

const bundle = await rolldown({
  input: join(here, "src/server.ts"),
  platform: "node",
  /* the library marks a file or two for the browser's bundler; that means nothing here */
  onLog: (level, log, handle) => {
    if (log.code !== "MODULE_LEVEL_DIRECTIVE") handle(level, log);
  },
});
await bundle.write({
  file: join(here, "dist/server.mjs"),
  format: "esm",
  /* What server.ts looks up on globalThis. The library pulls in React for a context it never
     uses here; its production build is the one to load, and it decides by this variable. */
  banner: `#!/usr/bin/env node\nprocess.env.NODE_ENV ??= "production";\nglobalThis.__M3E_VERSION__ = ${JSON.stringify(pkg.version)};\nglobalThis.__M3E_GUIDE__ = ${JSON.stringify(guide)};`,
});
await bundle.close();
console.log(`dist/server.mjs  ${pkg.name}@${pkg.version}`);
