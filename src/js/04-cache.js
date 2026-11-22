// Local media cache.
//
// The first time an episode plays, its mp3 is downloaded into the Cache API in
// the background. Transcripts and the catalog are stored there as well. Later
// visits read the mp3 back as a blob URL, so replay starts instantly and costs
// no mobile data. Whenever the catalog is fetched, entries that are no longer
// listed are pruned. Everything here is best-effort: without the Cache API the
// player keeps streaming straight from the network.
var mediaCacheName = "listening-media-v1";
var mediaCacheLimit = 60 * 1024 * 1024;
var mediaCacheOpen = null;
var mediaCacheInFlight = {};
var mediaCachePersistAsked = false;

function mediaCacheSupported() {
  return !!(window.caches && typeof window.caches.open === "function");
}

function openMediaCache() {
  if (!mediaCacheSupported()) {
    return Promise.resolve(null);
  }
  if (!mediaCacheOpen) {
    mediaCacheOpen = window.caches.open(mediaCacheName).catch(function () {
      mediaCacheOpen = null;
      return null;
    });
  }
  return mediaCacheOpen;
}

// Cache keys are absolute URLs; the catalog uses paths relative to the page.
function mediaCacheKey(path) {
  try {
    return new window.URL(path, window.location.href).href;
  } catch (e) {
    return String(path);
  }
}

function mediaCacheKind(url) {
  var path = String(url).split("?")[0].toLowerCase();
  if (/\.mp3$/.test(path)) { return "audio"; }
  if (/\.txt$/.test(path)) { return "transcript"; }
  return "other";
}

function cacheRequest(key) {
  return new Request(key, { credentials: "same-origin" });
}

// --- write path -----------------------------------------------------------

function downloadToCache(path) {
  var key = mediaCacheKey(path);
  if (!mediaCacheSupported()) {
    return Promise.resolve(false);
  }
  if (mediaCacheInFlight[key]) {
    return mediaCacheInFlight[key];
  }
  var task = openMediaCache().then(function (cache) {
    if (!cache) {
      return false;
    }
    return cache.match(cacheRequest(key)).then(function (hit) {
      if (hit) {
        return true;
      }
      return fetch(key, { credentials: "same-origin" }).then(function (response) {
        if (!response || !response.ok) {
          return false;
        }
        var size = parseInt(response.headers.get("Content-Length") || "0", 10);
        if (size > mediaCacheLimit) {
          return false;
        }
        return cache.put(cacheRequest(key), response).then(function () {
          return true;
        });
      });
    });
  }).catch(function () {
    return false;
  });
  mediaCacheInFlight[key] = task;
  task.then(function (stored) {
    delete mediaCacheInFlight[key];
    if (stored) {
      refreshCacheStatus();
    }
  });
  return task;
}

// Audio is only cached while it is actually being played, and only when the
// user has not asked the browser to save data. The download waits a couple of
// seconds so the media element can establish its own stream first.
function cacheCurrentAudio() {
  if (!state.currentAudioUrl || state.audioObjectUrl) {
    return;
  }
  var connection = window.navigator && window.navigator.connection;
  if (connection && connection.saveData) {
    return;
  }
  requestPersistentStorage();
  var url = state.currentAudioUrl;
  window.setTimeout(function () {
    if (state.currentAudioUrl !== url || state.audioObjectUrl) {
      return;
    }
    if (els.audio.paused && els.audio.currentTime < 5) {
      return;
    }
    downloadToCache(url);
  }, 2000);
}

function requestPersistentStorage() {
  var storage = window.navigator && window.navigator.storage;
  if (mediaCachePersistAsked || !storage || typeof storage.persist !== "function") {
    return;
  }
  mediaCachePersistAsked = true;
  storage.persist().catch(function () {});
}

function cacheIndexPayload(data) {
  if (!mediaCacheSupported() || !data) {
    return Promise.resolve(false);
  }
  var key = mediaCacheKey("audio/index.json");
  return openMediaCache().then(function (cache) {
    if (!cache) {
      return false;
    }
    return cache.put(cacheRequest(key), new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json; charset=utf-8" }
    })).then(function () {
      return true;
    });
  }).catch(function () {
    return false;
  });
}

function cacheTranscriptText(path, text) {
  if (!mediaCacheSupported() || !path) {
    return Promise.resolve(false);
  }
  var key = mediaCacheKey(path);
  return openMediaCache().then(function (cache) {
    if (!cache) {
      return false;
    }
    return cache.put(cacheRequest(key), new Response(String(text), {
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    })).then(function () {
      return true;
    });
  }).catch(function () {
    return false;
  });
}

// --- read path ------------------------------------------------------------

function readCachedResponse(path) {
  if (!mediaCacheSupported()) {
    return Promise.resolve(null);
  }
  var key = mediaCacheKey(path);
  return openMediaCache().then(function (cache) {
    return cache ? cache.match(cacheRequest(key)) : null;
  }).catch(function () {
    return null;
  });
}

function readCachedAudioUrl(path) {
  return readCachedResponse(path).then(function (response) {
    return response ? response.blob() : null;
  }).then(function (blob) {
    return blob ? getUrlApi().createObjectURL(blob) : "";
  }).catch(function () {
    return "";
  });
}

function readCachedIndexPayload() {
  return readCachedResponse("audio/index.json").then(function (response) {
    return response ? response.json() : null;
  }).catch(function () {
    return null;
  });
}

function readCachedTranscriptText(path) {
  return readCachedResponse(path).then(function (response) {
    return response ? response.text() : "";
  }).catch(function () {
    return "";
  });
}

// --- maintenance ----------------------------------------------------------

function pruneMediaCache(keepPaths) {
  if (!mediaCacheSupported() || !keepPaths) {
    return Promise.resolve(0);
  }
  var keep = {};
  keep[mediaCacheKey("audio/index.json")] = true;
  for (var i = 0; i < keepPaths.length; i += 1) {
    if (keepPaths[i]) {
      keep[mediaCacheKey(keepPaths[i])] = true;
    }
  }
  return openMediaCache().then(function (cache) {
    return cache ? cache.keys() : [];
  }).then(function (requests) {
    var jobs = [];
    for (var i = 0; i < requests.length; i += 1) {
      if (!keep[requests[i].url]) {
        jobs.push(removeCachedRequest(requests[i]));
      }
    }
    return Promise.all(jobs).then(function () {
      return jobs.length;
    });
  }).catch(function () {
    return 0;
  });
}

function removeCachedRequest(request) {
  return openMediaCache().then(function (cache) {
    return cache ? cache.delete(request) : false;
  }).catch(function () {
    return false;
  });
}

function clearMediaCache() {
  if (!mediaCacheSupported()) {
    return Promise.resolve(false);
  }
  mediaCacheOpen = null;
  mediaCacheInFlight = {};
  return window.caches.delete(mediaCacheName).catch(function () {
    return false;
  });
}

function describeCache() {
  var result = { supported: mediaCacheSupported(), audio: 0, transcripts: 0, bytes: 0 };
  if (!result.supported) {
    return Promise.resolve(result);
  }
  return openMediaCache().then(function (cache) {
    return cache ? cache.keys() : [];
  }).then(function (requests) {
    for (var i = 0; i < requests.length; i += 1) {
      var kind = mediaCacheKind(requests[i].url);
      if (kind === "audio") { result.audio += 1; }
      if (kind === "transcript") { result.transcripts += 1; }
    }
    return estimateStorageUsage();
  }).then(function (bytes) {
    result.bytes = bytes;
    return result;
  }).catch(function () {
    return result;
  });
}

function estimateStorageUsage() {
  var storage = window.navigator && window.navigator.storage;
  if (!storage || typeof storage.estimate !== "function") {
    return Promise.resolve(0);
  }
  return storage.estimate().then(function (usage) {
    return usage && isFinite(usage.usage) ? usage.usage : 0;
  }).catch(function () {
    return 0;
  });
}

// --- playback integration -------------------------------------------------

// Playback must never wait for the cache. The network source is applied right
// away so the first tap always plays; when the episode turns out to be cached,
// the element is switched to the blob while it is still paused, which keeps the
// cached copy free of network traffic. A tap that lands before the lookup
// finishes just keeps streaming instead of being interrupted.
function loadAudioSource(path) {
  var token = state.audioLoadToken + 1;
  state.audioLoadToken = token;
  state.currentAudioUrl = path;
  els.audio.pause();
  applyAudioSource(path);
  releaseCachedAudio();
  if (!mediaCacheSupported()) {
    return Promise.resolve();
  }
  return readCachedAudioUrl(path).then(function (objectUrl) {
    if (!objectUrl) {
      return;
    }
    if (token !== state.audioLoadToken || !els.audio.paused) {
      getUrlApi().revokeObjectURL(objectUrl);
      return;
    }
    var resumeAt = els.audio.currentTime || 0;
    state.audioObjectUrl = objectUrl;
    els.audio.src = objectUrl;
    if (resumeAt > 0) {
      els.audio.currentTime = resumeAt;
    }
  }).catch(function () {
    if (token === state.audioLoadToken && state.audioObjectUrl) {
      releaseCachedAudio();
    }
  });
}

function applyAudioSource(src) {
  els.audio.src = src;
  els.audio.currentTime = 0;
  seekToPendingOpenMark();
  updateMarkButtons();
  updateFileProgress();
}

function releaseCachedAudio() {
  if (!state.audioObjectUrl) {
    return;
  }
  getUrlApi().revokeObjectURL(state.audioObjectUrl);
  state.audioObjectUrl = "";
}

// --- configuration UI -----------------------------------------------------

function refreshCacheStatus() {
  if (!els.cacheStatus) {
    return;
  }
  describeCache().then(function (info) {
    if (!info.supported) {
      els.cacheStatus.innerHTML = "当前浏览器不支持本地缓存";
      if (els.clearCacheBtn) {
        els.clearCacheBtn.disabled = true;
      }
      return;
    }
    if (els.clearCacheBtn) {
      els.clearCacheBtn.disabled = false;
    }
    els.cacheStatus.innerHTML = "已缓存 " + info.audio + " 个音频、" + info.transcripts +
      " 份台词 · 占用约 " + formatBytes(info.bytes);
  });
}

function clearMediaCacheAndRefresh() {
  if (!mediaCacheSupported()) {
    return;
  }
  if (els.clearCacheBtn) {
    els.clearCacheBtn.disabled = true;
  }
  if (els.cacheStatus) {
    els.cacheStatus.innerHTML = "正在清除...";
  }
  clearMediaCache().then(function () {
    refreshCacheStatus();
  });
}
