import { App } from "@capacitor/app";
import { NativeAudio } from "@capgo/capacitor-native-audio";

var assetCounter = 0;

function noop() {}

function readNumber(getter, fallback) {
  var value;
  if (typeof getter !== "function") {
    return fallback;
  }
  try {
    value = Number(getter());
  } catch (e) {
    return fallback;
  }
  return isFinite(value) && value > 0 ? value : fallback;
}

function readTitle(getter) {
  var value = "";
  try {
    value = typeof getter === "function" ? getter() : "";
  } catch (e) {
    value = "";
  }
  value = String(value || "").replace(/\.[a-z0-9]+$/i, "");
  return value || "音频播放器";
}

// Mirrors the small part of HTMLAudioElement the player uses (src, play,
// pause, currentTime, duration, paused, ended and the on* handlers) on top of
// the native Media3 player. The web build never loads this file.
class NativeAudioElement {
  constructor(plugin, options) {
    this._plugin = plugin;
    this._options = options || {};
    this._assetId = "";
    this._src = "";
    this._duration = NaN;
    this._currentTime = 0;
    this._paused = true;
    this._ended = false;
    this._started = false;
    this._ready = false;
    this._loading = null;
    this._pendingSeek = null;
    this._loadToken = 0;
    this._lastTimeEvent = -1;
    this.playbackRate = 1;

    this.onplay = null;
    this.onpause = null;
    this.ontimeupdate = null;
    this.onseeked = null;
    this.onloadedmetadata = null;
    this.ondurationchange = null;
    this.onended = null;

    this._bindPluginEvents();
    this._bindAppLifecycle();
  }

  get src() {
    return this._src;
  }

  set src(value) {
    var next = String(value || "");
    if (next === this._src) {
      return;
    }
    this._src = next;
    this._ready = false;
    this._started = false;
    this._ended = false;
    this._paused = true;
    this._duration = NaN;
    this._currentTime = 0;
    this._pendingSeek = null;
    this._lastTimeEvent = -1;
    if (next) {
      this._load();
    }
  }

  get currentTime() {
    return this._currentTime;
  }

  set currentTime(value) {
    var time = Number(value);
    if (!isFinite(time)) {
      return;
    }
    if (time < 0) {
      time = 0;
    }
    if (isFinite(this._duration) && this._duration > 0 && time > this._duration) {
      time = this._duration;
    }
    this._currentTime = time;
    this._ended = false;
    if (!this._ready) {
      this._pendingSeek = time;
      return;
    }
    this._seekNative(time, true);
  }

  get duration() {
    return this._duration;
  }

  get paused() {
    return this._paused;
  }

  get ended() {
    return this._ended;
  }

  play() {
    var self = this;
    if (!this._src) {
      return Promise.resolve();
    }
    if (this._ended) {
      this._ended = false;
      this._started = false;
      this._currentTime = 0;
      this._pendingSeek = 0;
    }
    this._paused = false;
    this._emit("onplay");
    return this._whenReady()
      .then(function () {
        if (self._started) {
          return self._plugin.resume({ assetId: self._assetId });
        }
        self._started = true;
        return self._plugin.play({ assetId: self._assetId, time: self._currentTime || 0 });
      })
      .catch(function () {
        self._paused = true;
        self._emit("onpause");
      });
  }

  pause() {
    if (this._paused) {
      return;
    }
    this._paused = true;
    this._emit("onpause");
    if (this._started && this._assetId) {
      this._plugin.pause({ assetId: this._assetId }).catch(noop);
    }
  }

  _whenReady() {
    if (this._ready) {
      return Promise.resolve();
    }
    return this._loading || Promise.resolve();
  }

  _configure() {
    return this._plugin.configure({
      backgroundPlayback: true,
      showNotification: true,
      focus: true,
      progressInterval: 0.25,
      seekBackwardSeconds: readNumber(this._options.getBackStep, 5),
      seekForwardSeconds: readNumber(this._options.getForwardStep, 10)
    }).catch(noop);
  }

  _load() {
    var self = this;
    var token = ++this._loadToken;
    var previous = this._assetId;
    var assetId = "listening-" + (++assetCounter);
    var src = this._src;
    var title = readTitle(this._options.getTitle);
    this._assetId = assetId;
    this._loading = this._configure()
      .then(function () {
        if (!previous || previous === assetId) {
          return null;
        }
        return self._plugin.unload({ assetId: previous }).catch(noop);
      })
      .then(function () {
        return self._plugin.preload({
          assetId: assetId,
          assetPath: src,
          isUrl: true,
          audioChannelNum: 1,
          notificationMetadata: {
            title: title,
            artist: "音频播放器"
          }
        });
      })
      .then(function () {
        if (token !== self._loadToken) {
          return null;
        }
        return self._plugin.getDuration({ assetId: assetId });
      })
      .then(function (result) {
        if (token !== self._loadToken) {
          self._plugin.unload({ assetId: assetId }).catch(noop);
          return;
        }
        self._ready = true;
        if (result && isFinite(result.duration) && result.duration > 0) {
          self._duration = result.duration;
          self._emit("ondurationchange");
        }
        if (self._pendingSeek !== null) {
          var pending = self._pendingSeek;
          self._pendingSeek = null;
          self._currentTime = pending;
          self._seekNative(pending, false);
        }
        self._emit("onloadedmetadata");
      })
      .catch(function () {
        if (token === self._loadToken) {
          self._ready = false;
        }
      });
    return this._loading;
  }

  _seekNative(time, emitSeeked) {
    var self = this;
    var token = this._loadToken;
    if (!this._assetId) {
      return;
    }
    this._plugin.setCurrentTime({ assetId: this._assetId, time: time })
      .then(function () {
        if (token !== self._loadToken) {
          return;
        }
        self._currentTime = time;
        if (emitSeeked) {
          self._emit("onseeked");
        }
      })
      .catch(noop);
  }

  _bindPluginEvents() {
    var self = this;
    this._plugin.addListener("currentTime", function (event) {
      if (!self._isActive(event && event.assetId)) {
        return;
      }
      var time = Number(event.currentTime);
      if (!isFinite(time)) {
        return;
      }
      self._currentTime = time;
      if (Math.abs(time - self._lastTimeEvent) >= 0.2) {
        self._lastTimeEvent = time;
        self._emit("ontimeupdate");
      }
    }).catch(noop);
    this._plugin.addListener("playbackState", function (event) {
      if (!self._isActive(event && event.assetId)) {
        return;
      }
      self._applyState(event);
    }).catch(noop);
    this._plugin.addListener("complete", function (event) {
      if (!self._isActive(event && event.assetId)) {
        return;
      }
      self._handleComplete();
    }).catch(noop);
  }

  _bindAppLifecycle() {
    var self = this;
    if (typeof document === "undefined" || !document.addEventListener) {
      return;
    }
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) {
        self._syncState();
      }
    });
  }

  // Called when the WebView comes back to the foreground; playback may have
  // advanced or been paused from the lock screen while JS was suspended.
  _syncState() {
    var self = this;
    if (!this._assetId) {
      return;
    }
    this._plugin.getPlaybackState({ assetId: this._assetId })
      .then(function (state) {
        if (!state || state.assetId !== self._assetId) {
          return;
        }
        self._applyState(state);
        self._lastTimeEvent = -1;
        self._emit("ontimeupdate");
      })
      .catch(noop);
  }

  _applyState(event) {
    var wasPaused = this._paused;
    if (typeof event.isPlaying === "boolean") {
      this._paused = !event.isPlaying;
    } else if (event.state === "playing") {
      this._paused = false;
    } else if (event.state === "paused" || event.state === "stopped") {
      this._paused = true;
    }
    if (typeof event.currentTime === "number" && isFinite(event.currentTime)) {
      this._currentTime = event.currentTime;
    }
    if (typeof event.duration === "number" && event.duration > 0 && event.duration !== this._duration) {
      this._duration = event.duration;
      this._emit("ondurationchange");
    }
    if (wasPaused && !this._paused) {
      this._started = true;
      this._ended = false;
      this._emit("onplay");
    } else if (!wasPaused && this._paused) {
      this._emit("onpause");
    }
  }

  _handleComplete() {
    this._ended = true;
    this._paused = true;
    this._started = false;
    if (isFinite(this._duration)) {
      this._currentTime = this._duration;
    }
    this._emit("ontimeupdate");
    this._emit("onpause");
    this._emit("onended");
  }

  _isActive(assetId) {
    return !!assetId && assetId === this._assetId;
  }

  _emit(name) {
    var handler = this[name];
    if (typeof handler === "function") {
      try {
        handler.call(this);
      } catch (e) {}
    }
  }
}

export function createNativeAudioElement(plugin, options) {
  return new NativeAudioElement(plugin, options || {});
}

function create(options) {
  var cap = typeof window !== "undefined" ? window.Capacitor : null;
  if (!cap) {
    return null;
  }
  if (typeof cap.isNativePlatform === "function" && !cap.isNativePlatform()) {
    return null;
  }
  return new NativeAudioElement(NativeAudio, options || {});
}

function clearCache() {
  return Promise.resolve()
    .then(function () { return NativeAudio.clearCache(); })
    .catch(noop);
}

function exitApp() {
  return Promise.resolve()
    .then(function () { return App.exitApp(); })
    .catch(noop);
}

if (typeof window !== "undefined") {
  window.NativeAudioBridge = { create: create, clearCache: clearCache, exitApp: exitApp };
  if (window.Capacitor) {
    try {
      App.addListener("backButton", function () {
        window.dispatchEvent(new Event("native-back"));
      }).catch(noop);
    } catch (e) {}
  }
}
