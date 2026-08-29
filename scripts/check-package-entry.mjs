import { readFileSync, statSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const root = manifest.exports?.["."];
if (manifest.main !== undefined || manifest.module !== undefined || manifest.style !== undefined) {
  throw new Error("legacy package entry fields must not compete with exports");
}
if (root?.types !== "./typings/xterm.d.ts" || root?.import !== "./lib/xterm.mjs") {
  throw new Error("the package root must expose the built ESM and its public types");
}
if (manifest.exports?.["./css/xterm.css"] !== "./css/xterm.css") {
  throw new Error("the public stylesheet export is missing");
}
for (const file of [root.types, root.import, manifest.exports["./css/xterm.css"]]) {
  const info = statSync(new URL(`..${file.slice(1)}`, import.meta.url));
  if (!info.isFile() || info.size === 0) throw new Error(`package entry is not a non-empty file: ${file}`);
}
console.log("XTERM_PACKAGE_ENTRY_READY format=esm version=6.0.0");
