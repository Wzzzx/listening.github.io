function transcriptIndexAt(time) {
  var cues = state.transcriptCues;
  if (!cues.length) { return -1; }
  var low = 0;
  var high = cues.length;
  while (low < high) {
    var mid = Math.floor((low + high) / 2);
    if (cues[mid].start <= time) { low = mid + 1; }
    else { high = mid; }
  }
  return Math.max(0, low - 1);
}

function canFollowTranscript() {
  return state.page === "player" && state.settings.continuousMode &&
    (state.transcriptType === "timed-speaker" || state.transcriptType === "timed-range") &&
    state.transcriptCues.length > 0;
}

function cancelTranscriptAnimation() {
  if (state.transcriptAnimation !== null) {
    window.cancelAnimationFrame(state.transcriptAnimation);
    state.transcriptAnimation = null;
  }
}

function stopTranscriptFollow() {
  cancelTranscriptAnimation();
  if (state.transcriptFrame !== null) { window.cancelAnimationFrame(state.transcriptFrame); }
  if (state.transcriptResumeTimer !== null) { window.clearTimeout(state.transcriptResumeTimer); }
  state.transcriptFrame = null;
  state.transcriptResumeTimer = null;
  state.transcriptManual = false;
  state.transcriptPointerDown = false;
}

function centerTranscript(index) {
  var el = els.transcriptScroll;
  var line = el.children[index];
  if (!line || !el.clientHeight) { return; }
  cancelTranscriptAnimation();
  var from = el.scrollTop;
  var destination = from + line.getBoundingClientRect().top - el.getBoundingClientRect().top +
    line.getBoundingClientRect().height / 2 - el.clientHeight / 2;
  destination = Math.max(0, Math.min(destination, el.scrollHeight - el.clientHeight));
  var started = null;
  function animate(now) {
    if (started === null) { started = now; }
    var progress = Math.min(1, (now - started) / 300);
    var eased = progress * progress * (3 - 2 * progress);
    el.scrollTop = from + (destination - from) * eased;
    state.transcriptAnimation = progress < 1 ? window.requestAnimationFrame(animate) : null;
  }
  state.transcriptAnimation = window.requestAnimationFrame(animate);
}

function syncTranscript(force) {
  if (!canFollowTranscript() || state.transcriptManual) { return; }
  var index = transcriptIndexAt(els.audio.currentTime || 0);
  if (force || index !== state.transcriptIndex) {
    state.transcriptIndex = index;
    centerTranscript(index);
  }
}

function refreshTranscriptFollow(resetManual) {
  if (!canFollowTranscript()) {
    stopTranscriptFollow();
    if (els.transcriptScroll) {
      els.transcriptScroll.style.paddingTop = "";
      els.transcriptScroll.style.paddingBottom = "";
    }
    return;
  }
  if (resetManual) { stopTranscriptFollow(); }
  var el = els.transcriptScroll;
  el.style.paddingTop = el.clientHeight / 2 + "px";
  el.style.paddingBottom = el.clientHeight / 2 + "px";
  syncTranscript(true);
  if (state.transcriptFrame !== null) { window.cancelAnimationFrame(state.transcriptFrame); }
  state.transcriptFrame = null;
  function tick() {
    state.transcriptFrame = null;
    if (!canFollowTranscript() || els.audio.paused || els.audio.ended) { return; }
    syncTranscript(false);
    state.transcriptFrame = window.requestAnimationFrame(tick);
  }
  if (!els.audio.paused && !els.audio.ended) { state.transcriptFrame = window.requestAnimationFrame(tick); }
}

function pauseTranscriptFollow() {
  if (!canFollowTranscript()) { return; }
  cancelTranscriptAnimation();
  state.transcriptManual = true;
  if (state.transcriptResumeTimer !== null) { window.clearTimeout(state.transcriptResumeTimer); }
  state.transcriptResumeTimer = window.setTimeout(function () {
    state.transcriptResumeTimer = null;
    if (state.transcriptPointerDown) { pauseTranscriptFollow(); return; }
    state.transcriptManual = false;
    syncTranscript(true);
  }, 3000);
}

function updateLyrics(text) {
  var parsed = parseTranscript(text);
  var previousIndex = state.lineIndex;
  var restoredPendingIndex = false;
  stopTranscriptFollow();
  state.transcriptType = parsed.type;
  state.transcriptCues = parsed.cues;
  state.lyrics = parsed.lines;
  if (state.lyrics.length && state.pendingLineIndex !== null) {
    state.lineIndex = Math.min(state.pendingLineIndex, state.lyrics.length - 1);
    state.pendingLineIndex = null;
    restoredPendingIndex = true;
  } else if (state.lineIndex >= state.lyrics.length) {
    state.lineIndex = Math.max(0, state.lyrics.length - 1);
  }
  renderLine();
  renderTranscript();
  if (!restoredPendingIndex && state.lineIndex !== previousIndex) {
    savePlaybackState();
  }
}

function applyPlayerMode() {
  if (state.settings.continuousMode) {
    addClass(els.playerPage, "continuous-mode");
  } else {
    removeClass(els.playerPage, "continuous-mode");
  }
  els.topRatioInput.disabled = state.settings.continuousMode;
  els.middleRatioInput.disabled = state.settings.continuousMode;
  refreshTranscriptFollow();
}

function renderTranscript() {
  var html = "";
  var i;
  for (i = 0; i < state.lyrics.length; i += 1) {
    html += '<p class="transcript-line">' + escapeHtml(state.lyrics[i]) + '</p>';
  }
  els.transcriptScroll.innerHTML = html;
  els.transcriptScroll.scrollTop = 0;
  state.transcriptIndex = -1;
  refreshTranscriptFollow();
}

function bindContinuousGestures() {
  var el = els.transcriptScroll;
  var gesture = null;
  var suppressMouseUntil = 0;
  el.addEventListener("wheel", pauseTranscriptFollow, { passive: true });
  el.addEventListener("scroll", function () {
    if (state.transcriptManual) { pauseTranscriptFollow(); }
  }, { passive: true });
  el.addEventListener("keydown", function (event) {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].indexOf(event.key) !== -1) {
      pauseTranscriptFollow();
    }
  });

  function start(x, y, mouse) {
    state.transcriptPointerDown = true;
    var rect = el.getBoundingClientRect();
    gesture = {
      x: x, y: y, time: new Date().getTime(), axis: "",
      upper: y < rect.top + rect.height / 2,
      scrollTop: el.scrollTop, mouse: mouse, moved: false
    };
  }

  function move(x, y, event) {
    if (!gesture) { return; }
    var dx = Math.abs(x - gesture.x);
    var dy = Math.abs(y - gesture.y);
    if (dx >= 10 || dy >= 10) { gesture.moved = true; }
    if (!gesture.axis && gesture.moved) {
      if (dx > dy * 1.25) { gesture.axis = "x"; }
      else if (dy > dx * 1.25) { gesture.axis = "y"; }
    }
    if (gesture.axis === "x" && event.cancelable) {
      event.preventDefault();
    }
    if (gesture.axis === "y") { pauseTranscriptFollow(); }
    if (gesture.mouse && gesture.axis === "y") {
      el.scrollTop = gesture.scrollTop + gesture.y - y;
    }
  }

  function end(x, y, event) {
    state.transcriptPointerDown = false;
    if (state.transcriptManual) { pauseTranscriptFollow(); }
    if (!gesture) { return; }
    move(x, y, event);
    var completed = gesture;
    gesture = null;
    var dx = x - completed.x;
    var threshold = normalizeNumber(state.settings.swipeThreshold, 30, 160, defaults.swipeThreshold);
    if (completed.axis === "x" && Math.abs(dx) >= threshold) {
      if (completed.upper) { handleImmersiveSwipe(dx < 0 ? "left" : "right"); }
      else { handleMiddleSwipe(dx < 0 ? "left" : "right"); }
    } else if (!completed.moved && new Date().getTime() - completed.time < 500) {
      if (completed.upper) { togglePlay(); }
      else { addMark(true); }
    }
  }

  el.addEventListener("touchstart", function (event) {
    suppressMouseUntil = new Date().getTime() + 700;
    if (event.touches.length !== 1) { gesture = null; state.transcriptPointerDown = false; return; }
    start(event.touches[0].clientX, event.touches[0].clientY, false);
  }, { passive: true });
  el.addEventListener("touchmove", function (event) {
    if (event.touches.length !== 1) { gesture = null; state.transcriptPointerDown = false; return; }
    move(event.touches[0].clientX, event.touches[0].clientY, event);
  }, { passive: false });
  el.addEventListener("touchend", function (event) {
    suppressMouseUntil = new Date().getTime() + 700;
    if (event.touches.length) { gesture = null; state.transcriptPointerDown = false; return; }
    end(event.changedTouches[0].clientX, event.changedTouches[0].clientY, event);
  }, { passive: false });
  el.addEventListener("touchcancel", function () { gesture = null; state.transcriptPointerDown = false; });
  el.addEventListener("mousedown", function (event) {
    if (event.button !== 0 || new Date().getTime() < suppressMouseUntil) { return; }
    start(event.clientX, event.clientY, true);
  });
  document.addEventListener("mousemove", function (event) {
    if (gesture && gesture.mouse) { move(event.clientX, event.clientY, event); }
  });
  document.addEventListener("mouseup", function (event) {
    if (gesture && gesture.mouse) { end(event.clientX, event.clientY, event); }
  });
  window.addEventListener("blur", function () { gesture = null; state.transcriptPointerDown = false; });
}

