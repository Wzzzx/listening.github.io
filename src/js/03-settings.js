function loadSettings() {
  var result = copyDefaults();
  var raw;
  var parsed;
  try {
    raw = window.localStorage.getItem(storageKey);
    if (raw) {
      parsed = JSON.parse(raw);
      mergeSettings(result, parsed);
    }
  } catch (e) {}
  return result;
}

function copyDefaults() {
  var copy = {};
  var key;
  for (key in defaults) {
    if (defaults.hasOwnProperty(key)) {
      copy[key] = defaults[key];
    }
  }
  return copy;
}

function mergeSettings(target, source) {
  if (!source) {
    return;
  }
  target.forwardStep = normalizeNumber(source.forwardStep, 1, 300, defaults.forwardStep);
  target.backStep = normalizeNumber(source.backStep, 1, 300, defaults.backStep);
  target.markJumpTimeout = normalizeNumber(source.markJumpTimeout, 0.1, 10, defaults.markJumpTimeout);
  target.maskText = !!source.maskText;
  target.continuousMode = source.continuousMode === true;
  target.statusDisplay = source.statusDisplay === "title" ? "title" : "progress";
  target.showTotalDuration = source.showTotalDuration === true;
  target.swipeThreshold = normalizeNumber(source.swipeThreshold, 30, 160, defaults.swipeThreshold);
  target.topRatio = normalizeNumber(source.topRatio, 15, 60, defaults.topRatio);
  target.middleRatio = normalizeNumber(source.middleRatio, 15, 60, defaults.middleRatio);
  keepRatiosObjectValid(target, "middle");
}

function saveSettings() {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state.settings));
  } catch (e) {}
}

function loadPlaybackState() {
  var result = { version: 1, files: {} };
  var raw;
  var parsed;
  try {
    raw = window.localStorage.getItem(playbackStateKey);
    if (!raw) {
      return result;
    }
    parsed = JSON.parse(raw);
    if (parsed && parsed.files && typeof parsed.files === "object") {
      result.files = parsed.files;
    }
  } catch (e) {}
  return result;
}

function getPlaybackStateId(fileKey) {
  return encodeURIComponent(fileKey || "");
}

function restorePlaybackState() {
  var saved;
  var marks = [];
  var i;
  if (!state.fileKey) {
    state.marks = [];
    state.pendingLineIndex = null;
    return;
  }
  saved = state.savedPlaybackState.files[getPlaybackStateId(state.fileKey)];
  if (!saved) {
    state.marks = [];
    state.pendingLineIndex = null;
    return;
  }
  if (saved.marks && saved.marks.length) {
    for (i = 0; i < saved.marks.length; i += 1) {
      if (typeof saved.marks[i] === "number" && isFinite(saved.marks[i]) && saved.marks[i] >= 0) {
        marks.push(normalizeMarkTime(saved.marks[i]));
      }
    }
  }
  marks.sort(function (a, b) { return a - b; });
  state.marks = marks;
  state.pendingLineIndex = normalizeSavedLineIndex(saved.lineIndex);
}

function normalizeSavedLineIndex(value) {
  var index = parseInt(value, 10);
  return isNaN(index) || index < 0 ? 0 : index;
}

function savePlaybackState() {
  var id;
  if (!state.fileKey) {
    return;
  }
  id = getPlaybackStateId(state.fileKey);
  state.savedPlaybackState.files[id] = {
    marks: state.marks.slice(0),
    lineIndex: state.lineIndex
  };
  try {
    window.localStorage.setItem(playbackStateKey, JSON.stringify(state.savedPlaybackState));
  } catch (e) {}
}

function applySettingsToControls() {
  els.statusDisplayInput.value = state.settings.statusDisplay;
  els.showTotalDurationInput.checked = state.settings.showTotalDuration;
  els.showTotalDurationInput.disabled = state.settings.statusDisplay === "title";
  updateStatusText();
  els.continuousModeInput.checked = state.settings.continuousMode;
  applyPlayerMode();
  els.forwardStepInput.value = state.settings.forwardStep;
  els.backStepInput.value = state.settings.backStep;
  els.markJumpTimeoutInput.value = state.settings.markJumpTimeout;
  els.swipeThresholdInput.value = state.settings.swipeThreshold;
  els.swipeThresholdValue.innerHTML = state.settings.swipeThreshold + "px";
  els.topRatioInput.value = state.settings.topRatio;
  els.topRatioValue.innerHTML = state.settings.topRatio + "%";
  els.middleRatioInput.value = state.settings.middleRatio;
  els.middleRatioValue.innerHTML = state.settings.middleRatio + "%";
  applyImmersiveRatio();
}

function showPage(page) {
  state.page = page;
  removeClass(els.startPage, "active");
  removeClass(els.playerPage, "active");
  removeClass(els.configPage, "active");
  if (page === "start") {
    addClass(els.startPage, "active");
  } else if (page === "config") {
    addClass(els.configPage, "active");
    renderMarkList();
  } else {
    addClass(els.playerPage, "active");
  }
  refreshTranscriptFollow();
}

