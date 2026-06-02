#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const AUDIO_EXTENSIONS = new Set([
  ".aac",
  ".flac",
  ".m4a",
  ".mp3",
  ".ogg",
  ".opus",
  ".wav",
  ".webm",
]);

const projectRoot = process.cwd();
const args = parseArgs(process.argv.slice(2));
const audioDir = path.resolve(projectRoot, args.audioDir || "audio");
const outFile = path.resolve(projectRoot, args.out || path.join("audio", "index.json"));

main();

function main() {
  if (!fs.existsSync(audioDir)) {
    fail(`Audio directory does not exist: ${audioDir}`);
  }

  const files = walk(audioDir);
  const textFilesByBase = buildTextFileMap(files);
  const audioFiles = files
    .filter((filePath) => AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase()))
    .sort((a, b) => toRelativeUrl(a).localeCompare(toRelativeUrl(b), "en"))
    .map((filePath) => buildAudioEntry(filePath, textFilesByBase));

  const data = {
    generatedAt: new Date().toISOString(),
    baseDir: toRelativeUrl(audioDir),
    count: audioFiles.length,
    files: audioFiles,
  };

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");

  console.log(`Generated ${toRelativeUrl(outFile)} with ${audioFiles.length} audio file(s).`);
}

function parseArgs(argv) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--audio-dir" && next) {
      result.audioDir = next;
      index += 1;
    } else if (arg === "--out" && next) {
      result.out = next;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      fail(`Unknown or incomplete argument: ${arg}`);
    }
  }

  return result;
}

function printHelp() {
  console.log(`Usage: node scripts/generate-audio-index.js [options]

Options:
  --audio-dir <dir>  Directory to scan. Defaults to audio
  --out <file>       JSON file to write. Defaults to audio/index.json
  -h, --help         Show this help
`);
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  entries.sort((a, b) => a.name.localeCompare(b.name, "en"));

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...walk(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function buildTextFileMap(files) {
  const map = new Map();

  for (const filePath of files) {
    if (path.extname(filePath).toLowerCase() !== ".txt") {
      continue;
    }

    map.set(stripExtension(filePath).toLowerCase(), filePath);
  }

  return map;
}

function buildAudioEntry(filePath, textFilesByBase) {
  const stat = fs.statSync(filePath);
  const relativePath = toRelativeUrl(filePath);
  const transcriptPath = textFilesByBase.get(stripExtension(filePath).toLowerCase());
  const folders = path
    .dirname(path.relative(audioDir, filePath))
    .split(path.sep)
    .filter((part) => part && part !== ".");

  return {
    id: relativePath,
    title: path.basename(filePath, path.extname(filePath)),
    name: path.basename(filePath),
    path: relativePath,
    url: encodeRelativeUrl(relativePath),
    extension: path.extname(filePath).slice(1).toLowerCase(),
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    folders,
    transcriptPath: transcriptPath ? toRelativeUrl(transcriptPath) : null,
    transcriptUrl: transcriptPath ? encodeRelativeUrl(toRelativeUrl(transcriptPath)) : null,
  };
}

function stripExtension(filePath) {
  return path.join(path.dirname(filePath), path.basename(filePath, path.extname(filePath)));
}

function toRelativeUrl(filePath) {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}

function encodeRelativeUrl(relativePath) {
  return relativePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
