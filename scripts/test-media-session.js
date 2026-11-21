const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function boot(withMediaSession, withMetadata = true) {
  const handlers = {};
  const positions = [];
  const mediaSession = {
    metadata: null,
    playbackState: 'none',
    setActionHandler(action, handler) { handlers[action] = handler; },
    setPositionState(state) { positions.push(state); }
  };
  class MediaMetadata {
    constructor(init) { Object.assign(this, init); }
  }
  const window = {
    localStorage: { getItem() { return null; }, setItem() {} },
    requestAnimationFrame() { return 0; },
    cancelAnimationFrame() {},
    setTimeout() { return 0; },
    clearTimeout() {},
    addEventListener() {}
  };
  const context = { window, document: { addEventListener() {} } };
  if (withMetadata) { context.MediaMetadata = MediaMetadata; }
  if (withMediaSession) { context.navigator = { mediaSession }; }
  vm.createContext(context);
  vm.runInContext(script.replace('      init();', `
    window.api = { state: state, els: els,
      bindSession: bindMediaSession,
      updateMetadata: updateMediaSessionMetadata,
      updatePlaybackState: updateMediaSessionPlaybackState,
      updatePosition: updateMediaSessionPosition,
      renderStatus: renderMediaSessionStatus,
      seekTo: seekTo, seekBy: seekBy, togglePlay: togglePlay };
  `), context);
  return { api: window.api, handlers, positions, mediaSession };
}

function audioMock() {
  return {
    paused: true, currentTime: 0, duration: 100, playbackRate: 1,
    play() { this.paused = false; },
    pause() { this.paused = true; }
  };
}

function installEls(api, audio) {
  api.els.audio = audio;
  api.els.playZoneLabel = { innerHTML: '' };
  api.els.fileName = {
    textContent: '', className: '', scrollWidth: 10,
    parentNode: { clientWidth: 200 }
  };
  api.els.fileProgress = { style: {} };
  api.els.fileMarks = { innerHTML: '' };
  api.els.markList = { innerHTML: '' };
  api.els.mediaSessionStatus = { textContent: '' };
}

const { api, handlers, positions, mediaSession } = boot(true);
const audio = audioMock();
installEls(api, audio);

api.state.audioReady = true;
api.state.fileName = 'Episode_01.mp3';
api.updateMetadata();
assert.equal(mediaSession.metadata.title, 'Episode_01', 'title drops the file extension');
assert.equal(mediaSession.metadata.artist, '音频播放器');

api.bindSession();
assert.deepEqual(Object.keys(handlers).sort(),
  ['pause', 'play', 'seekbackward', 'seekforward', 'seekto']);
assert.equal(mediaSession.playbackState, 'paused');
api.renderStatus();
assert.match(api.els.mediaSessionStatus.textContent, /API 可用/);

handlers.play();
assert.equal(audio.paused, false, 'play action resumes playback');
handlers.play();
assert.equal(audio.paused, false, 'play action is a no-op while playing');
handlers.pause();
assert.equal(audio.paused, true, 'pause action pauses playback');

audio.currentTime = 10;
handlers.seekforward();
assert.equal(audio.currentTime, 20, 'seek forward uses the configured step');
audio.currentTime = 10;
handlers.seekbackward();
assert.equal(audio.currentTime, 5, 'seek backward uses the configured step');
audio.currentTime = 10;
handlers.seekto({ seekTime: 150 });
assert.equal(audio.currentTime, 100, 'absolute seek clamps to duration');
audio.currentTime = 10;
handlers.seekto({ seekTime: -5 });
assert.equal(audio.currentTime, 0, 'absolute seek clamps to zero');
audio.currentTime = 10;
handlers.seekto({});
assert.equal(audio.currentTime, 10, 'seek to without a time is ignored');

api.updatePlaybackState();
assert.equal(mediaSession.playbackState, 'paused');
audio.paused = false;
api.updatePlaybackState();
assert.equal(mediaSession.playbackState, 'playing');

positions.length = 0;
audio.currentTime = 120;
audio.duration = 100;
api.updatePosition();
assert.equal(positions.length, 1);
assert.equal(positions[0].position, 100, 'position state clamps to duration');
assert.equal(positions[0].duration, 100);
audio.duration = NaN;
api.updatePosition();
assert.equal(positions.length, 1, 'unknown duration skips position state');

api.state.audioReady = false;
api.updateMetadata();
assert.equal(mediaSession.metadata, null, 'clearing the selection clears metadata');

// Browsers and WebViews without Media Session must not throw.
const fallback = boot(false);
const fallbackAudio = audioMock();
installEls(fallback.api, fallbackAudio);
fallback.api.state.audioReady = true;
fallback.api.state.fileName = 'plain.mp3';
fallback.api.renderStatus();
assert.match(fallback.api.els.mediaSessionStatus.textContent, /不支持/);
assert.doesNotThrow(() => {
  fallback.api.bindSession();
  fallback.api.updateMetadata();
  fallback.api.updatePlaybackState();
  fallback.api.updatePosition();
});

// An unsupported action must not stop the remaining handlers from being bound.
const partial = boot(true);
partial.mediaSession.setActionHandler = function (action) {
  if (action === 'seekto') { throw new Error('unsupported action'); }
  partial.handlers[action] = arguments[1];
};
partial.api.bindSession();
assert.ok(partial.handlers.play && partial.handlers.pause && partial.handlers.seekforward);

// WebView with Media Session but no MediaMetadata only reports partial support.
const noMetadata = boot(true, false);
installEls(noMetadata.api, audioMock());
noMetadata.api.renderStatus();
assert.match(noMetadata.api.els.mediaSessionStatus.textContent, /部分支持/);

console.log('Media Session metadata and transport checks passed.');
