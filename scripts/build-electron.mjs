/* Builds the Electron main process and preload to dist-electron/ with esbuild.
 * Only these two files need bundling; the renderer is the pre-built Next.js
 * static export already sitting in ./out. */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { copyFile } from "node:fs/promises";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, "dist-electron");

const common = {
  bundle: true,
  platform: "node",
  // Electron 33+ ships Node 20.x; target it broadly for compatibility.
  target: "node20",
  format: "cjs",
  sourcemap: false,
  minify: false,
  external: [
    "electron",
    // optional performance add-ons for `ws`; ws falls back to pure JS if absent,
    // and bundling them would fail when the native add-ons are not installed
    "bufferutil",
    "utf-8-validate",
  ],
  logLevel: "info",
};

try {
  await Promise.all([
    build({
      ...common,
      entryPoints: [join(root, "electron/main.ts")],
      outfile: join(out, "main.js"),
    }),
    build({
      ...common,
      entryPoints: [join(root, "electron/preload.ts")],
      outfile: join(out, "preload.js"),
    }),
  ]);
  // the self-contained tablet control page is served at runtime by the mirror
  // server, and icon.png backs the window/taskbar icon; both must sit next to
  // main.js (inside the asar when packaged)
  await Promise.all([
    copyFile(join(root, "electron", "tablet-client.html"), join(out, "tablet-client.html")),
    copyFile(join(root, "build", "icon.png"), join(out, "icon.png")),
  ]);
  console.log("electron build complete -> dist-electron/");
} catch (err) {
  console.error(err);
  process.exit(1);
}
