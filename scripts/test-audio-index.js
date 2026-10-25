const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const generator = path.join(__dirname, "generate-audio-index.js");
const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

test("new MP3 compression, repeat runs, failure and explicit skip", {
  skip: process.platform !== "win32" || !hasFfmpeg,
}, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "audio-index-test-"));
  try {
    const audioDir = path.join(root, "音频 & spaces ! %PATH% (test)");
    fs.mkdirSync(audioDir);
    const audio = path.join(audioDir, "新增 ! %PATH% & (音频).MP3");
    const out = path.join(root, "custom-index.json");
    const source = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-b:a", "192k", audio]);
    assert.equal(source.status, 0, source.stderr?.toString());
    const originalSize = fs.statSync(audio).size;
    fs.writeFileSync(audio.replace(/\.MP3$/, ".txt"), "transcript");
    // Other supported formats must be indexed without being sent to compress.cmd.
    fs.writeFileSync(path.join(audioDir, "other.wav"), "untouched");
    const run = (...args) => spawnSync(process.execPath, [generator, "--audio-dir", audioDir, "--out", out, ...args], { cwd: root, encoding: "utf8" });
    const first = run();
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const data = JSON.parse(fs.readFileSync(out, "utf8"));
    assert.equal(data.count, 2);
    const entry = data.files.find((file) => file.extension === "mp3");
    assert.ok(entry.size < originalSize);
    assert.equal(entry.size, fs.statSync(audio).size);
    assert.equal(entry.modifiedAt, fs.statSync(audio).mtime.toISOString());
    assert.ok(entry.transcriptPath.endsWith(".txt"));
    const compressed = fs.readFileSync(audio);
    const modifiedAt = fs.statSync(audio).mtimeMs;
    assert.equal(run().status, 0);
    assert.deepEqual(fs.readFileSync(audio), compressed);
    assert.equal(fs.statSync(audio).mtimeMs, modifiedAt);

    const indexBeforeFailure = fs.readFileSync(out);
    const broken = path.join(audioDir, "broken.mp3");
    fs.writeFileSync(broken, "invalid MP3");
    assert.notEqual(run().status, 0);
    assert.deepEqual(fs.readFileSync(out), indexBeforeFailure);
    assert.equal(fs.readFileSync(broken, "utf8"), "invalid MP3");
    assert.ok(!fs.readdirSync(audioDir).some((name) => name.startsWith(".compress-")));
    assert.equal(run("--skip-compress").status, 0);
    assert.equal(JSON.parse(fs.readFileSync(out)).count, 3);

    fs.writeFileSync(out, "invalid JSON");
    assert.notEqual(run().status, 0);
    assert.equal(fs.readFileSync(out, "utf8"), "invalid JSON");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
