const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);

function target() {
  return {
    listeners: {}, style: {}, className: '', scrollTop: 0,
    addEventListener(name, fn) { this.listeners[name] = fn; },
    getBoundingClientRect() { return { top: 50, height: 600 }; }
  };
}

const storage = {};
function boot() {
  const document = target();
  const window = target();
  window.setTimeout = function (fn) { fn(); };
  window.localStorage = {
    getItem(key) { return storage[key] || null; },
    setItem(key, value) { storage[key] = value; }
  };
  const context = { document, window };
  vm.createContext(context);
  vm.runInContext(script.replace('      init();', `
    window.test = { state: state, els: els, bind: bindContinuousGestures,
      bindSettings: bindSettingInputs, render: renderTranscript, updateProgress: updateFileProgress };
    window.actions = [];
    togglePlay = function () { window.actions.push('play'); };
    addMark = function () { window.actions.push('mark'); };
    handleImmersiveSwipe = function (direction) { window.actions.push('seek-' + direction); };
    handleMiddleSwipe = function (direction) { window.actions.push('mark-' + direction); };
  `), context);
  const api = window.test;
  for (const name of ['transcriptScroll', 'continuousModeInput', 'playerPage',
    'forwardStepInput', 'backStepInput', 'markJumpTimeoutInput', 'swipeThresholdInput',
    'topRatioInput', 'middleRatioInput', 'lyricsInput', 'statusDisplayInput',
    'showTotalDurationInput', 'fileName', 'audio', 'fileProgress']) api.els[name] = target();
  api.els.fileName.parentNode = { clientWidth: 200 };
  api.bind();
  api.bindSettings();
  return { api, window, document };
}

const { api, window, document } = boot();
assert.equal(api.state.settings.continuousMode, false);
api.els.continuousModeInput.checked = true;
api.els.continuousModeInput.onchange();
assert.match(api.els.playerPage.className, /continuous-mode/);
assert.equal(api.els.topRatioInput.disabled, true);
assert.equal(boot().api.state.settings.continuousMode, true, 'setting survives reload');
api.els.continuousModeInput.checked = false;
api.els.continuousModeInput.onchange();
assert.equal(api.els.playerPage.className, '');
assert.equal(api.els.topRatioInput.disabled, false);

api.state.lyrics = ['first <line>', 'second', 'third'];
api.render();
assert.equal((api.els.transcriptScroll.innerHTML.match(/class="transcript-line"/g) || []).length, 3);
assert.match(api.els.transcriptScroll.innerHTML, /first &lt;line&gt;/);

const scroller = api.els.transcriptScroll;
function touch(type, x, y, count = 1) {
  const point = { clientX: x, clientY: y };
  const event = {
    touches: type === 'touchend' ? [] : Array(count).fill(point),
    changedTouches: [point], cancelable: true, prevented: false,
    preventDefault() { this.prevented = true; }
  };
  scroller.listeners[type](event);
  return event;
}
function swipe(y, dx) {
  touch('touchstart', 150, y);
  assert.equal(touch('touchmove', 150 + dx, y).prevented, true);
  touch('touchend', 150 + dx, y);
}
swipe(100, 80);
swipe(100, -80);
swipe(500, 80);
swipe(500, -80);
touch('touchstart', 150, 100); touch('touchend', 150, 100);
touch('touchstart', 150, 500); touch('touchend', 150, 500);
assert.deepEqual(Array.from(window.actions), ['seek-right', 'seek-left', 'mark-right', 'mark-left', 'play', 'mark']);
window.actions.length = 0;

// Vertical gestures can start in either half and cross the boundary.
for (const [start, finish] of [[550, 100], [100, 550]]) {
  touch('touchstart', 150, start);
  assert.equal(touch('touchmove', 150, finish).prevented, false);
  touch('touchend', 150, finish);
}
// Returning to the start after scrolling must not become a tap.
touch('touchstart', 150, 100);
touch('touchmove', 150, 180);
touch('touchend', 150, 100);
// Once vertical, a diagonal tail must not seek.
touch('touchstart', 150, 100);
touch('touchmove', 150, 180);
touch('touchend', 350, 180);
touch('touchstart', 150, 100);
scroller.listeners.touchcancel();
touch('touchend', 250, 100);
touch('touchstart', 150, 100, 2);
touch('touchend', 150, 100);
assert.equal(window.actions.length, 0);

// Desktop dragging uses the same full-height scrolling area.
const desktop = boot();
const desktopScroller = desktop.api.els.transcriptScroll;
desktopScroller.listeners.mousedown({ button: 0, clientX: 150, clientY: 550 });
desktop.document.listeners.mousemove({ clientX: 150, clientY: 100 });
desktop.document.listeners.mouseup({ clientX: 150, clientY: 100 });
assert.equal(desktopScroller.scrollTop, 450);
assert.equal(desktop.window.actions.length, 0);
// Status text updates with playback and both display preferences survive reload.
const status = boot().api;
assert.equal(status.state.settings.statusDisplay, 'progress');
assert.equal(status.state.settings.showTotalDuration, false);
status.state.audioReady = true;
status.state.fileName = 'Example <audio>.mp3';
status.els.audio.currentTime = 83;
status.els.audio.duration = 765;
status.updateProgress();
assert.equal(status.els.fileName.textContent, '1:23');
assert.equal(status.els.fileProgress.style.width, (83 / 765 * 100) + '%');
status.els.showTotalDurationInput.checked = true;
status.els.showTotalDurationInput.onchange();
assert.equal(status.els.fileName.textContent, '1:23 / 12:45');
assert.equal(boot().api.state.settings.showTotalDuration, true);
status.els.audio.currentTime = 84;
status.updateProgress();
assert.equal(status.els.fileName.textContent, '1:24 / 12:45');
status.els.audio.duration = NaN;
status.updateProgress();
assert.equal(status.els.fileName.textContent, '1:24 / --:--');
status.els.statusDisplayInput.value = 'title';
status.els.statusDisplayInput.onchange();
assert.equal(status.els.fileName.textContent, 'Example <audio>.mp3');
assert.equal(status.els.showTotalDurationInput.disabled, true);
assert.equal(boot().api.state.settings.statusDisplay, 'title');
status.els.statusDisplayInput.value = 'progress';
status.els.statusDisplayInput.onchange();
assert.equal(status.els.showTotalDurationInput.disabled, false);
assert.equal(status.els.fileName.textContent, '1:24 / --:--');
console.log('Continuous mode and status display checks passed.');
