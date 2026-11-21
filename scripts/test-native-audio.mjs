import assert from "node:assert/strict";
import { createNativeAudioElement } from "../src/native-audio.mjs";

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0)).then(
    () => new Promise((resolve) => setTimeout(resolve, 0))
  );
}

function createPlugin(duration = 123.4) {
  const calls = [];
  const listeners = {};
  const plugin = {
    configure(options) { calls.push(["configure", options]); return Promise.resolve(); },
    preload(options) { calls.push(["preload", options]); return Promise.resolve(); },
    unload(options) { calls.push(["unload", options]); return Promise.resolve(); },
    play(options) { calls.push(["play", options]); return Promise.resolve(); },
    pause(options) { calls.push(["pause", options]); return Promise.resolve(); },
    resume(options) { calls.push(["resume", options]); return Promise.resolve(); },
    setCurrentTime(options) { calls.push(["setCurrentTime", options]); return Promise.resolve(); },
    getDuration(options) { calls.push(["getDuration", options]); return Promise.resolve({ duration }); },
    getPlaybackState(options) {
      calls.push(["getPlaybackState", options]);
      return Promise.resolve({
        assetId: options.assetId, state: "paused", isPlaying: false,
        currentTime: 42, duration
      });
    },
    addListener(name, handler) {
      (listeners[name] = listeners[name] || []).push(handler);
      return Promise.resolve({ remove() {} });
    },
    emit(name, event) {
      for (const handler of listeners[name] || []) { handler(event); }
    }
  };
  return { plugin, calls, listeners };
}

function counters(audio) {
  const counts = { play: 0, pause: 0, timeupdate: 0, seeked: 0, metadata: 0, durationchange: 0, ended: 0 };
  audio.onplay = () => { counts.play += 1; };
  audio.onpause = () => { counts.pause += 1; };
  audio.ontimeupdate = () => { counts.timeupdate += 1; };
  audio.onseeked = () => { counts.seeked += 1; };
  audio.onloadedmetadata = () => { counts.metadata += 1; };
  audio.ondurationchange = () => { counts.durationchange += 1; };
  audio.onended = () => { counts.ended += 1; };
  return counts;
}

const first = createPlugin();
const audio = createNativeAudioElement(first.plugin, {
  getTitle: () => "Episode_01.mp3",
  getBackStep: () => 7,
  getForwardStep: () => 12
});
const events = counters(audio);

audio.src = "https://example.com/episode.mp3";
await settle();

assert.equal(audio.duration, 123.4, "duration is read from the native player");
assert.equal(events.metadata, 1, "loadedmetadata fires once the track is ready");
assert.equal(events.durationchange, 1, "durationchange fires with the real duration");
assert.equal(events.play, 0);

const config = first.calls.find((call) => call[0] === "configure")[1];
assert.equal(config.backgroundPlayback, true);
assert.equal(config.showNotification, true);
assert.equal(config.focus, true);
assert.equal(config.seekBackwardSeconds, 7);
assert.equal(config.seekForwardSeconds, 12);

const preload = first.calls.find((call) => call[0] === "preload")[1];
assert.equal(preload.assetPath, "https://example.com/episode.mp3");
assert.equal(preload.isUrl, true);
assert.equal(preload.audioChannelNum, 1);
assert.equal(preload.notificationMetadata.title, "Episode_01", "title is used for the media notification");

// A seek requested before the track is ready is applied once it loads.
const second = createPlugin();
const pending = createNativeAudioElement(second.plugin, {});
pending.src = "https://example.com/second.mp3";
pending.currentTime = 33;
await settle();
assert.equal(pending.currentTime, 33);
assert.deepEqual(second.calls.filter((call) => call[0] === "setCurrentTime").map((call) => call[1].time), [33]);

// play, pause and resume follow the HTMLAudioElement contract the app expects.
await audio.play();
assert.equal(audio.paused, false);
assert.equal(events.play, 1);
assert.equal(first.calls.find((call) => call[0] === "play")[1].time, 0);

audio.pause();
assert.equal(audio.paused, true);
assert.equal(events.pause, 1);
assert.ok(first.calls.some((call) => call[0] === "pause"), "pause reaches the native player");

await audio.play();
assert.ok(first.calls.some((call) => call[0] === "resume"), "the second play resumes");

audio.currentTime = 60;
await settle();
assert.equal(audio.currentTime, 60);
assert.equal(events.seeked, 1);
assert.ok(first.calls.some((call) => call[0] === "setCurrentTime" && call[1].time === 60));

// Lock screen / notification transport actions are reflected back into the UI.
const assetId = audio._assetId;
first.plugin.emit("playbackState", { assetId, state: "paused", isPlaying: false });
assert.equal(audio.paused, true);
const pausesBeforeResume = events.pause;
first.plugin.emit("playbackState", { assetId, state: "playing", isPlaying: true });
assert.equal(audio.paused, false);
assert.equal(events.play, 3);
assert.equal(events.pause, pausesBeforeResume);

// Time updates are throttled to roughly 5 per second.
first.plugin.emit("currentTime", { assetId, currentTime: 10 });
first.plugin.emit("currentTime", { assetId, currentTime: 10.05 });
first.plugin.emit("currentTime", { assetId, currentTime: 10.3 });
assert.equal(events.timeupdate, 2, "small steps are coalesced");
assert.equal(audio.currentTime, 10.3);

first.plugin.emit("complete", { assetId });
assert.equal(audio.ended, true);
assert.equal(audio.paused, true);
assert.equal(audio.currentTime, 123.4);
assert.equal(events.ended, 1);

first.calls.length = 0;
await audio.play();
assert.equal(audio.ended, false);
assert.equal(first.calls.find((call) => call[0] === "play")[1].time, 0, "replaying after the end starts over");

// Coming back to the foreground re-syncs position and playback state.
const documentListeners = {};
globalThis.document = {
  hidden: false,
  addEventListener(name, handler) { documentListeners[name] = handler; }
};
const third = createPlugin();
const resumed = createNativeAudioElement(third.plugin, {});
resumed.src = "https://example.com/third.mp3";
await settle();
const resumedEvents = counters(resumed);
documentListeners.visibilitychange();
await settle();
assert.ok(third.calls.some((call) => call[0] === "getPlaybackState"));
assert.equal(resumed.currentTime, 42);
assert.ok(resumedEvents.timeupdate >= 1);
delete globalThis.document;

// Calling play before loading finishes waits for the track instead of failing.
const fourth = createPlugin();
const early = createNativeAudioElement(fourth.plugin, {});
early.src = "https://example.com/fourth.mp3";
await early.play();
assert.ok(fourth.calls.some((call) => call[0] === "play"));
assert.equal(early.paused, false);

console.log("Native audio adapter checks passed.");
