const fs = require("node:fs");
const path = require("node:path");
const { rollup } = require("rollup");
const { nodeResolve } = require("@rollup/plugin-node-resolve");

const root = path.join(__dirname, "..");
const distDir = path.join(root, "dist");
const baseUrl = process.env.APP_BASE_URL || "https://wzzzx.github.io/listening.github.io/";

async function main() {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(distDir, { recursive: true });

  const bundle = await rollup({
    input: path.join(root, "src", "native-audio.mjs"),
    plugins: [nodeResolve({ browser: true, exportConditions: ["browser"] })]
  });
  await bundle.write({
    file: path.join(distDir, "native-audio.js"),
    format: "iife",
    name: "NativeAudioShell",
    inlineDynamicImports: true
  });
  await bundle.close();

  const appScript = "  <script>";
  const inject = [
    '  <script src="native-audio.js"></script>',
    "  <script>window.__APP_BASE__ = " + JSON.stringify(baseUrl) + ";</script>",
    ""
  ].join("\n");

  let html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  if (html.indexOf(appScript) < 0) {
    throw new Error("index.html does not contain the expected app script tag");
  }
  html = html.replace(appScript, inject + appScript);
  fs.writeFileSync(path.join(distDir, "index.html"), html);
  console.log(`Built dist/index.html and dist/native-audio.js (base: ${baseUrl})`);
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
