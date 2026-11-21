const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const frames = new Map();
const timers = new Map();
let id = 0;
const window = {
  localStorage: { getItem() { return null; } },
  requestAnimationFrame(fn) { frames.set(++id, fn); return id; },
  cancelAnimationFrame(key) { frames.delete(key); },
  setTimeout(fn, delay) { timers.set(++id, { fn, delay }); return id; },
  clearTimeout(key) { timers.delete(key); },
  addEventListener() {}
};
const context = { window, document: { addEventListener() {} } };
vm.createContext(context);
vm.runInContext(script.replace('      init();', `
  window.api = { state: state, els: els, parse: parseTranscript,
    indexAt: transcriptIndexAt, refresh: refreshTranscriptFollow,
    sync: syncTranscript, pause: pauseTranscriptFollow,
    stop: stopTranscriptFollow, render: renderTranscript, bind: bindContinuousGestures };
`), context);
const api = window.api;
const sample = [
  ['00:00.38', 'James', 'Welcome back everyone.'],
  ['00:15.54', 'Justin', 'Good, how is it going?'],
  ['00:21.43', 'James', 'We were planning to record.'],
  ['00:37.21', 'James', 'You are a Pokemon fan.'],
  ['00:37.27', 'Justin', 'wow'],
  ['00:40.76', 'Justin', 'Just a little.'],
  ['00:47.74', 'James', 'The two of them together.'],
  ['01:18.30', 'James', 'Working with tools.'],
  ['01:34.84', 'Justin', 'The general chat experience.']
].map(lines => lines.join('\n')).join('\n\n');
const parsed = api.parse(sample);
assert.equal(parsed.type, 'timed-speaker');
assert.equal(parsed.cues.length, 9);
assert.equal(parsed.cues[0].start, 0.38);
assert.equal(parsed.cues[8].start, 94.84);
assert.equal(parsed.cues[1].speaker, 'Justin');
for (const newline of ['\n', '\r\n', '\r']) {
  assert.equal(api.parse('\uFEFF' + sample.replace(/\r\n|\n|\r/g, newline)).type, 'timed-speaker');
}
for (const input of ['', 'plain\ntext', '00:01.00\nJames',
  '00:60.00\nJames\ntext']) {
  assert.equal(api.parse(input).type, 'plain');
}
const unordered = api.parse('00:02.00\nJames\na\n00:01.00\nJustin\nb\n00:02.00\nJames\nc');
assert.equal(unordered.type, 'timed-speaker');
assert.deepEqual(Array.from(unordered.lines), ['b', 'a', 'c'], 'sort by time, preserving ties');
api.state.transcriptCues = unordered.cues;
assert.equal(api.indexAt(1), 0);
assert.equal(api.indexAt(2), 2);
api.state.transcriptCues = parsed.cues;
for (const [time, index] of [[0, 0], [0.38, 0], [15.53, 0], [15.54, 1],
  [37.21, 3], [37.26, 3], [37.27, 4], [999, 8]]) {
  assert.equal(api.indexAt(time), index);
}
api.state.transcriptCues = api.parse('00:01.00\na\none\n00:01.00\nb\ntwo').cues;
assert.equal(api.indexAt(1), 1);

// "[MM:SS - MM:SS] text" exports: one ASR fragment per line, joined into sentences.
const rangedSample = [
  '[00:00 - 00:03] This is an all-year English podcast.',
  '[00:03 - 00:06] Is everything peachy in your neck of the woods?',
  '[00:08 - 00:11] Welcome to the all-year English podcast',
  '[00:11 - 00:14] downloaded more than 200 million times.',
  '[00:14 - 00:17] Are you feeling stuck with your English?',
  '[00:17 - 00:21] We\'ll show you how to become fearless and fluent',
  '[00:21 - 00:24] by focusing on connection, not perfection.',
  '[00:24 - 00:27] With your American host, Michelle Kaplan,'
].join('\n');
const ranged = api.parse(rangedSample);
assert.equal(ranged.type, 'timed-range');
assert.equal(ranged.cues.length, 6);
assert.deepEqual(Array.from(ranged.lines), [
  'This is an all-year English podcast.',
  'Is everything peachy in your neck of the woods?',
  'Welcome to the all-year English podcast downloaded more than 200 million times.',
  'Are you feeling stuck with your English?',
  'We\'ll show you how to become fearless and fluent by focusing on connection, not perfection.',
  'With your American host, Michelle Kaplan,'
]);
assert.equal(ranged.cues[2].start, 8);
assert.equal(ranged.cues[2].end, 14);
assert.equal(ranged.cues[4].start, 17);
assert.equal(ranged.cues[4].end, 24);
for (const newline of ['\n', '\r\n', '\r']) {
  assert.equal(api.parse('\uFEFF' + rangedSample.replace(/\r\n|\n|\r/g, newline)).type, 'timed-range');
}
// A long silent gap ends a sentence even without terminal punctuation.
const gapped = api.parse('[00:00 - 00:02] First thought\n[00:10 - 00:12] Second thought');
assert.equal(gapped.type, 'timed-range');
assert.equal(gapped.lines.length, 2);
assert.equal(gapped.cues[1].start, 10);
// Zero-length fragments sharing a start time must not be skipped by indexAt.
const tied = api.parse([
  '[03:31 - 03:31] And I was like, why?',
  '[03:31 - 03:34] And he said, because I asked',
  '[03:34 - 03:40] the teacher to call me.'
].join('\n'));
assert.equal(tied.type, 'timed-range');
assert.equal(tied.lines.length, 1);
assert.match(tied.lines[0], /^And I was like, why\? And he said/);
assert.equal(tied.cues[0].start, 211);
assert.equal(tied.cues[0].end, 220);
// Optional hours and fractions are tolerated.
const clocked = api.parse('[1:02:03.50 - 1:02:07] Longer show');
assert.equal(clocked.type, 'timed-range');
assert.equal(clocked.cues[0].start, 3723.5);
for (const input of ['[00:60 - 01:00] bad seconds', '[00:00 - 00:03]',
  '[00:00 - 00:03] ok\nplain line']) {
  assert.equal(api.parse(input).type, 'plain');
}
api.state.transcriptCues = ranged.cues;
for (const [time, index] of [[0, 0], [7.9, 1], [8, 2], [13.9, 2], [14, 3],
  [17, 4], [24, 5]]) {
  assert.equal(api.indexAt(time), index);
}
api.state.transcriptCues = parsed.cues;
api.state.transcriptType = parsed.type;
api.state.lyrics = parsed.lines;
const listeners = {};
const scroller = api.els.transcriptScroll = {
  style: {}, scrollTop: 0, clientHeight: 600, scrollHeight: 2400,
  addEventListener(name, fn) { listeners[name] = fn; },
  getBoundingClientRect() { return { top: 50, height: 600 }; }
};
scroller.children = parsed.cues.map((_, i) => ({
  getBoundingClientRect() { return { top: 350 + i * 200 - scroller.scrollTop, height: 100 }; }
}));
api.els.audio = { currentTime: 0, paused: true, ended: false };
api.render();
assert.equal((scroller.innerHTML.match(/class="transcript-line"/g) || []).length, 9);
assert.doesNotMatch(scroller.innerHTML, />James<|>Justin<|00:00\.38/);
api.state.page = 'player';
api.state.settings.continuousMode = true;
function frame(time) {
  const pending = Array.from(frames.values());
  frames.clear();
  pending.forEach(fn => fn(time));
}
api.refresh();
assert.equal(scroller.style.paddingTop, '300px');
frame(0);
frame(150);
assert.equal(scroller.scrollTop, 25, 'halfway through smooth centering');
api.els.audio.currentTime = 15.54;
api.sync(false);
assert.equal(frames.size, 1, 'new target cancels previous animation');
frame(150);
assert.equal(scroller.scrollTop, 25, 'retarget starts at current position');
frame(450);
assert.equal(scroller.scrollTop, 250);
api.sync(false);
assert.equal(frames.size, 0, 'same cue does not restart scrolling');
api.bind();
listeners.wheel();
assert.equal(api.state.transcriptManual, true);
assert.equal(Array.from(timers.values())[0].delay, 3000);
scroller.scrollTop = 700;
listeners.scroll();
assert.equal(timers.size, 1, 'manual momentum resets only one resume timer');
api.els.audio.currentTime = 37.27;
api.sync(false);
assert.equal(frames.size, 0, 'manual browsing suppresses following');
const timer = Array.from(timers.values())[0];
timers.clear();
timer.fn();
frame(500);
frame(800);
assert.equal(scroller.scrollTop, 850, 'resume centers latest cue');
api.pause();
api.els.audio.currentTime = 0;
api.refresh(true);
assert.equal(api.state.transcriptManual, false, 'seek resumes even while paused');
assert.equal(timers.size, 0);
frame(900);
frame(1200);
assert.equal(scroller.scrollTop, 50);
api.els.audio.paused = false;
api.refresh();
frame(1300);
api.els.audio.currentTime = 37.21;
frame(1316);
assert.equal(api.state.transcriptIndex, 3);
api.els.audio.currentTime = 37.27;
frame(1332);
assert.equal(api.state.transcriptIndex, 4, 'frame loop catches close cue boundaries');
api.state.page = 'config';
api.refresh();
assert.equal(frames.size, 0);
assert.equal(timers.size, 0);
api.state.page = 'player';
api.refresh();
assert.equal(api.state.transcriptIndex, 4);
api.stop();
api.els.audio.paused = true;
api.els.audio.currentTime = 999;
scroller.clientHeight = 400;
scroller.children[8].getBoundingClientRect = function () {
  return { top: 1400 - scroller.scrollTop, height: 800 };
};
api.refresh();
assert.equal(scroller.style.paddingBottom, '200px');
frame(1400);
frame(1700);
assert.equal(scroller.scrollTop, 1550, 'long final paragraph centers after resize');
listeners.keydown({ key: 'PageUp' });
assert.equal(api.state.transcriptManual, true);
api.state.settings.continuousMode = false;
api.refresh();
assert.equal(frames.size, 0);
assert.equal(timers.size, 0);
assert.equal(scroller.style.paddingTop, '');

// Exercise the actual catalog transcript: 00:23.70 precedes 00:23.65 in the export.
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'audio', 'index.json'), 'utf8'));
const entry = catalog.files.find(file => file.transcriptPath && file.transcriptPath.includes('Inside The Agent Loop'));
assert.ok(entry, 'real podcast fixture is in the audio catalog');
const actualText = fs.readFileSync(path.join(root, entry.transcriptPath), 'utf8');
const actual = api.parse(actualText);
assert.equal(actual.type, 'timed-speaker');
assert.equal(actual.cues.length, 224);
api.state.transcriptType = actual.type;
api.state.transcriptCues = actual.cues;
api.state.lyrics = actual.lines;
api.render();
assert.equal((scroller.innerHTML.match(/class="transcript-line"/g) || []).length, 224);
assert.doesNotMatch(scroller.innerHTML, />James<|>Pierce<|>\d+:\d{2}\.\d{2}</);
assert.match(scroller.innerHTML, /I love it\. I love it\./);
scroller.scrollHeight = 46000;
scroller.children = actual.cues.map((_, i) => ({
  getBoundingClientRect() { return { top: 250 + i * 200 - scroller.scrollTop, height: 100 }; }
}));
api.state.settings.continuousMode = true;
api.els.audio.currentTime = 23.65;
api.refresh(true);
frame(1800);
frame(2100);
assert.equal(api.state.transcriptIndex, 3);
assert.match(actual.cues[3].text, /^I love it/);
assert.equal(scroller.scrollTop, 650);
api.els.audio.currentTime = 23.70;
api.sync(false);
frame(2200);
frame(2500);
assert.equal(actual.cues[api.state.transcriptIndex].text, 'Right into my eyes.');
assert.equal(scroller.scrollTop, 850, 'real transcript advances and centers the next paragraph');
api.stop();

// Exercise the real "All Ears English" export: "[MM:SS - MM:SS] text".
const aeeEntry = catalog.files.find(file => file.transcriptPath && file.transcriptPath.includes('Is Everything Peachy'));
assert.ok(aeeEntry, 'range-format podcast fixture is in the audio catalog');
const aee = api.parse(fs.readFileSync(path.join(root, aeeEntry.transcriptPath), 'utf8'));
assert.equal(aee.type, 'timed-range');
assert.equal(aee.cues.length, 336);
assert.equal(aee.cues[0].start, 0);
assert.match(aee.lines[2], /^Welcome to the all-year English podcast downloaded/);
assert.ok(aee.lines.some(line => line.includes('And I was like, why? And he said')),
  'zero-length fragment is folded into its sentence');
api.state.transcriptType = aee.type;
api.state.transcriptCues = aee.cues;
api.state.lyrics = aee.lines;
api.state.settings.continuousMode = true;
api.els.audio.currentTime = 0;
api.els.audio.paused = true;
scroller.clientHeight = 600;
scroller.scrollHeight = 30000;
api.render();
assert.equal((scroller.innerHTML.match(/class="transcript-line"/g) || []).length, 336);
assert.doesNotMatch(scroller.innerHTML, /\[\d{2}:\d{2} - \d{2}:\d{2}\]/);
assert.match(scroller.innerHTML, /Is everything peachy in your neck of the woods\?/);
api.refresh();
assert.equal(scroller.style.paddingTop, '300px');
api.stop();
console.log('Timed transcript parsing, range merging, synchronization and scrolling checks passed.');
