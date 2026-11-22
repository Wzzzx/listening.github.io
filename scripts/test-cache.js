const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function keyOf(request) {
  return typeof request === 'string' ? request : request.url;
}

function makeCacheStorage() {
  const entries = new Map();
  const cache = {
    put(request, response) {
      // The real Cache API stores a copy; match() hands out a fresh body.
      entries.set(keyOf(request), response.clone());
      return Promise.resolve();
    },
    match(request) {
      const hit = entries.get(keyOf(request));
      return Promise.resolve(hit ? hit.clone() : undefined);
    },
    keys() {
      return Promise.resolve(Array.from(entries.keys(), url => ({ url })));
    },
    delete(request) {
      return Promise.resolve(entries.delete(keyOf(request)));
    }
  };
  return {
    entries,
    open() { return Promise.resolve(cache); },
    delete() { entries.clear(); return Promise.resolve(true); }
  };
}

const origin = 'https://example.test/listening/';
const fetched = [];
function fetchStub(url) {
  fetched.push(url);
  if (url.indexOf('/audio/index.json') >= 0) {
    const body = JSON.stringify({ files: [{ name: 'a.mp3' }] });
    return Promise.resolve(new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(body.length) }
    }));
  }
  return Promise.resolve(new Response(new Uint8Array([1, 2, 3, 4]), {
    status: 200,
    headers: { 'Content-Length': '4' }
  }));
}

function boot(options = {}) {
  const storage = makeCacheStorage();
  const objects = new Map();
  let objectId = 0;
  class FakeURL extends URL {
    static createObjectURL(blob) {
      const url = 'blob:' + (++objectId);
      objects.set(url, blob);
      return url;
    }
    static revokeObjectURL(url) {
      objects.delete(url);
    }
  }
  const window = {
    location: { href: origin + 'index.html' },
    localStorage: { getItem() { return null; }, setItem() {} },
    URL: FakeURL,
    caches: options.caches === false ? undefined : storage,
    navigator: {
      storage: {
        estimate() { return Promise.resolve({ usage: 1234, quota: 100000 }); },
        persist() { return Promise.resolve(true); }
      }
    },
    requestAnimationFrame() { return 1; },
    cancelAnimationFrame() {},
    setTimeout() { return 1; },
    clearTimeout() {},
    addEventListener() {}
  };
  const context = {
    window,
    document: { addEventListener() {} },
    URL,
    Response,
    Request,
    Blob,
    fetch: fetchStub
  };
  vm.createContext(context);
  vm.runInContext(script.replace('      init();', `
    window.api = {
      state: state,
      download: downloadToCache,
      cacheAudioCurrent: cacheCurrentAudio,
      readAudio: readCachedAudioUrl,
      cacheIndex: cacheIndexPayload,
      readIndex: readCachedIndexPayload,
      cacheText: cacheTranscriptText,
      readText: readCachedTranscriptText,
      prune: pruneMediaCache,
      pruneCatalog: pruneCatalogCache,
      describe: describeCache,
      clear: clearMediaCache,
      loadSource: loadAudioSource,
      els: els
    };
  `), context);
  return { api: window.api, storage, objects };
}

// The player touches a handful of elements while switching sources; stub the
// ones updateFileProgress / updateMarkButtons need.
function installAudioTargets(api) {
  api.state.audioReady = true;
  api.els.audio = {
    src: '', currentTime: 0, duration: NaN, paused: true, ended: false,
    pause() {},
    play() { return Promise.resolve(); },
    removeAttribute(name) { if (name === 'src') { this.src = ''; } }
  };
  api.els.fileMarks = { innerHTML: '' };
  api.els.fileProgress = { style: {} };
  api.els.fileName = { textContent: '', className: '', scrollWidth: 0, parentNode: { clientWidth: 200 } };
}

(async function main() {
  const { api, storage, objects } = boot();

  assert.equal(await api.download('audio/a.mp3'), true);
  assert.equal(fetched.length, 1);
  assert.equal(await api.download('audio/a.mp3'), true, 'a cached file counts as stored');
  assert.equal(fetched.length, 1, 'the second request never hits the network');

  const objectUrl = await api.readAudio('audio/a.mp3');
  assert.match(objectUrl, /^blob:/);
  assert.equal(objects.get(objectUrl).size, 4, 'playback reads the cached bytes');

  // Selecting a cached episode plays the blob; an uncached one streams instead.
  installAudioTargets(api);
  await api.loadSource('audio/a.mp3');
  const cachedSrc = api.els.audio.src;
  assert.match(cachedSrc, /^blob:/, 'cached episode plays from the cache');
  assert.equal(api.state.audioObjectUrl, cachedSrc);
  const fetchedBefore = fetched.length;
  api.cacheAudioCurrent();
  assert.equal(fetched.length, fetchedBefore, 'an episode already in cache is not downloaded again');

  await api.loadSource('audio/not-cached.mp3');
  assert.equal(api.els.audio.src, 'audio/not-cached.mp3', 'missing episodes still stream');
  assert.equal(api.state.audioObjectUrl, '', 'the old blob is released');
  assert.equal(objects.has(cachedSrc), false, 'the previous object URL is revoked');

  assert.equal(await api.cacheIndex({ files: [] }), true);
  assert.deepEqual(await api.readIndex(), { files: [] });

  assert.equal(await api.cacheText('audio/a.txt', 'hello'), true);
  assert.equal(await api.readText('audio/a.txt'), 'hello');
  assert.equal(await api.readText('audio/missing.txt'), '');

  let info = await api.describe();
  assert.equal(info.supported, true);
  assert.equal(info.audio, 1);
  assert.equal(info.transcripts, 1);
  assert.equal(info.bytes, 1234);

  // Pruning follows the catalog: removed episodes and their transcripts go.
  await api.download('audio/gone.mp3');
  await api.cacheText('audio/gone.txt', 'gone');
  assert.equal(await api.prune(['audio/a.mp3', 'audio/a.txt']), 2, 'exactly the stale entries are dropped');
  let keys = Array.from(storage.entries.keys());
  assert.ok(keys.some(key => key.endsWith('/audio/a.mp3')));
  assert.ok(keys.some(key => key.endsWith('/audio/a.txt')));
  assert.ok(keys.some(key => key.endsWith('/audio/index.json')), 'the catalog itself is never pruned');
  assert.ok(!keys.some(key => key.includes('gone')));

  // A new catalog version of the same file replaces the cached copy.
  api.state.audioIndex = [{ url: 'audio/keep.mp3', version: 'v2', transcriptUrl: 'audio/keep.txt' }];
  await api.download('audio/keep.mp3?v=v2');
  await api.cacheText('audio/keep.txt', 'keep');
  await api.pruneCatalog();
  keys = Array.from(storage.entries.keys());
  assert.ok(keys.some(key => key.includes('keep.mp3?v=v2')), 'listed audio is kept');
  assert.ok(keys.some(key => key.endsWith('/audio/keep.txt')), 'listed transcript is kept');

  api.state.audioIndex = [{ url: 'audio/keep.mp3', version: 'v3', transcriptUrl: 'audio/keep.txt' }];
  await api.pruneCatalog();
  keys = Array.from(storage.entries.keys());
  assert.ok(!keys.some(key => key.includes('keep.mp3?v=v2')), 'a replaced episode leaves the cache');

  assert.equal(await api.clear(), true);
  assert.equal(storage.entries.size, 0);
  info = await api.describe();
  assert.equal(info.audio, 0);
  assert.equal(info.transcripts, 0);

  // Without the Cache API everything degrades to plain streaming.
  const plain = boot({ caches: false });
  assert.equal(await plain.api.download('audio/a.mp3'), false);
  assert.equal(await plain.api.readAudio('audio/a.mp3'), '');
  const unsupported = await plain.api.describe();
  assert.equal(unsupported.supported, false);

  console.log('Media cache download, replay, pruning and fallback checks passed.');
}()).catch(function (error) {
  console.error(error);
  process.exit(1);
});
