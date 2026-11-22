function $(id) {
  return document.getElementById(id);
}

function init() {
  cacheElements();
  bindEvents();
  applySettingsToControls();
  applyImmersiveRatio();
  renderLine();
  showPage("start");
  loadAudioIndex();
}

function cacheElements() {
  els.startPage = $("startPage");
  els.playerPage = $("playerPage");
  els.configPage = $("configPage");
  els.browserBackBtn = $("browserBackBtn");
  els.browserPath = $("browserPath");
  els.browserList = $("browserList");
  els.configBtn = $("configBtn");
  els.fileProgress = $("fileProgress");
  els.fileMarks = $("fileMarks");
  els.fileName = $("fileName");
  els.fileNameBox = els.fileName ? els.fileName.parentNode : null;
  els.progressDragPanel = $("progressDragPanel");
  els.progressDragTrack = $("progressDragTrack");
  els.progressDragFill = $("progressDragFill");
  els.progressDragHandle = $("progressDragHandle");
  els.progressDragTime = $("progressDragTime");
  els.immersiveView = $("immersiveView");
  els.transcriptScroll = $("transcriptScroll");
  els.continuousModeInput = $("continuousModeInput");
  els.statusDisplayInput = $("statusDisplayInput");
  els.showTotalDurationInput = $("showTotalDurationInput");
  els.topZone = $("topZone");
  els.middleZone = $("middleZone");
  els.playZoneLabel = $("playZoneLabel");
  els.bottomZone = $("bottomZone");
  els.markZoneLabel = $("markZoneLabel");
  els.lineArea = $("lineArea");
  els.lineCard = $("lineCard");
  els.maskBtn = $("maskBtn");
  els.lineCount = $("lineCount");
  els.lineJump = $("lineJump");
  els.lineJumpText = $("lineJumpText");
  els.lineJumpInput = $("lineJumpInput");
  els.backConfigBtn = $("backConfigBtn");
  els.forwardStepInput = $("forwardStepInput");
  els.backStepInput = $("backStepInput");
  els.markJumpTimeoutInput = $("markJumpTimeoutInput");
  els.markList = $("markList");
  els.swipeThresholdInput = $("swipeThresholdInput");
  els.swipeThresholdValue = $("swipeThresholdValue");
  els.topRatioInput = $("topRatioInput");
  els.topRatioValue = $("topRatioValue");
  els.middleRatioInput = $("middleRatioInput");
  els.middleRatioValue = $("middleRatioValue");
  els.lyricsInput = $("lyricsInput");
  els.clearCacheBtn = $("clearCacheBtn");
  els.cacheStatus = $("cacheStatus");
  els.audio = $("audio");
}

function bindEvents() {
  els.browserBackBtn.onclick = goBrowserParent;
  els.browserList.onclick = onBrowserListClick;
  els.configBtn.onclick = function () { showPage("config"); };
  els.backConfigBtn.onclick = function () { showPage("player"); };
  els.maskBtn.onclick = toggleMask;
  els.lineJumpInput.oninput = onLineJumpInput;
  els.lineJumpInput.onchange = hideLineJump;
  els.markList.onclick = onMarkListClick;
  els.clearCacheBtn.onclick = clearMediaCacheAndRefresh;
  bindProgressDrag();
  bindContinuousGestures();

  els.audio.onplay = function () {
    updatePlayButton();
    refreshTranscriptFollow();
    cacheCurrentAudio();
  };
  els.audio.onpause = function () { updatePlayButton(); refreshTranscriptFollow(); };
  els.audio.onseeked = function () { refreshTranscriptFollow(true); };
  window.addEventListener("resize", function () { refreshTranscriptFollow(); });
  els.audio.ontimeupdate = function () {
    updateMarkButtons();
    updateFileProgress();
    syncTranscript(false);
  };
  els.audio.onloadedmetadata = function () {
    seekToPendingOpenMark();
    updateMarkButtons();
    updateFileProgress();
  };
  els.audio.ondurationchange = function () {
    updateMarkButtons();
    updateFileProgress();
  };

  bindSwipe(els.topZone, function (direction) {
    handleReadingSwipe(direction);
  }, function () {
    toggleLineJump();
  });
  bindSwipe(els.middleZone, function (direction) {
    handleImmersiveSwipe(direction);
  }, function () {
    togglePlay();
  });
  bindSwipe(els.bottomZone, function (direction) {
    handleMiddleSwipe(direction);
  }, function () {
    addMark(true);
  });

  bindSettingInputs();
}

function bindSettingInputs() {
  els.statusDisplayInput.onchange = function () {
    state.settings.statusDisplay = this.value === "title" ? "title" : "progress";
    els.showTotalDurationInput.disabled = state.settings.statusDisplay === "title";
    updateStatusText();
    saveSettings();
  };
  els.showTotalDurationInput.onchange = function () {
    state.settings.showTotalDuration = this.checked;
    updateStatusText();
    saveSettings();
  };
  els.continuousModeInput.onchange = function () {
    state.settings.continuousMode = this.checked;
    applyPlayerMode();
    saveSettings();
  };
  els.forwardStepInput.oninput = function () {
    state.settings.forwardStep = normalizeNumber(this.value, 1, 300, defaults.forwardStep);
    saveSettings();
  };
  els.backStepInput.oninput = function () {
    state.settings.backStep = normalizeNumber(this.value, 1, 300, defaults.backStep);
    saveSettings();
  };
  els.markJumpTimeoutInput.oninput = function () {
    state.settings.markJumpTimeout = normalizeNumber(this.value, 0.1, 10, defaults.markJumpTimeout);
    saveSettings();
  };
  els.swipeThresholdInput.oninput = function () {
    state.settings.swipeThreshold = normalizeNumber(this.value, 30, 160, defaults.swipeThreshold);
    els.swipeThresholdValue.innerHTML = state.settings.swipeThreshold + "px";
    saveSettings();
  };
  els.topRatioInput.oninput = function () {
    state.settings.topRatio = normalizeNumber(this.value, 15, 60, defaults.topRatio);
    keepImmersiveRatiosValid("top");
    applyImmersiveRatio();
    saveSettings();
  };
  els.middleRatioInput.oninput = function () {
    state.settings.middleRatio = normalizeNumber(this.value, 15, 60, defaults.middleRatio);
    keepImmersiveRatiosValid("middle");
    applyImmersiveRatio();
    saveSettings();
  };
  els.lyricsInput.oninput = function () {
    updateLyrics(this.value);
  };
}

