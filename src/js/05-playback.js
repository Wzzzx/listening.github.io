function applyImmersiveRatio() {
  var topRatio;
  var middleRatio;
  keepImmersiveRatiosValid("middle");
  topRatio = normalizeNumber(state.settings.topRatio, 15, 60, defaults.topRatio);
  middleRatio = normalizeNumber(state.settings.middleRatio, 15, 60, defaults.middleRatio);
  els.topZone.style.flex = "0 0 " + topRatio + "%";
  els.middleZone.style.flex = "0 0 " + middleRatio + "%";
  els.bottomZone.style.flex = "1 1 0";
  els.topRatioInput.value = topRatio;
  els.topRatioValue.innerHTML = topRatio + "%";
  els.middleRatioInput.value = middleRatio;
  els.middleRatioValue.innerHTML = middleRatio + "%";
}

function togglePlay() {
  if (!state.audioReady) {
    return;
  }
  if (els.audio.paused) {
    var promise = els.audio.play();
    if (promise && promise.catch) {
      promise.catch(function () {});
    }
  } else {
    els.audio.pause();
  }
  updatePlayButton();
}

function updatePlayButton() {
  if (!els.playZoneLabel) {
    return;
  }
  els.playZoneLabel.innerHTML = els.audio.paused ?
    "点击播放，左右滑动快退/快进" :
    "播放中，点击暂停，左右滑动快退/快进";
}

function seekBy(seconds) {
  if (!state.audioReady || isNaN(els.audio.duration)) {
    return;
  }
  var next = els.audio.currentTime + seconds;
  if (next < 0) {
    next = 0;
  }
  if (next > els.audio.duration) {
    next = els.audio.duration;
  }
  clearMarkJumpAnchor();
  els.audio.currentTime = next;
  updateMarkButtons();
  updateFileProgress();
}

function bindProgressDrag() {
  if (!els.fileNameBox) {
    return;
  }
  els.fileNameBox.ontouchstart = function (event) {
    beginProgressDrag(getEventClientX(event), event);
  };
  els.fileNameBox.onmousedown = function (event) {
    beginProgressDrag(getEventClientX(event), event);
  };
}

function beginProgressDrag(clientX, event) {
  if (!state.audioReady || !els.audio.duration || isNaN(els.audio.duration)) {
    return;
  }
  state.progressDragging = true;
  addClass(els.progressDragPanel, "active");
  updateProgressFromClientX(clientX);
  document.addEventListener("touchmove", onProgressDragMove, false);
  document.addEventListener("touchend", endProgressDrag, false);
  document.addEventListener("touchcancel", endProgressDrag, false);
  document.addEventListener("mousemove", onProgressDragMove, false);
  document.addEventListener("mouseup", endProgressDrag, false);
  preventEvent(event);
}

function onProgressDragMove(event) {
  if (!state.progressDragging) {
    return;
  }
  updateProgressFromClientX(getEventClientX(event));
  preventEvent(event);
}

function endProgressDrag(event) {
  if (!state.progressDragging) {
    return;
  }
  state.progressDragging = false;
  removeClass(els.progressDragPanel, "active");
  document.removeEventListener("touchmove", onProgressDragMove, false);
  document.removeEventListener("touchend", endProgressDrag, false);
  document.removeEventListener("touchcancel", endProgressDrag, false);
  document.removeEventListener("mousemove", onProgressDragMove, false);
  document.removeEventListener("mouseup", endProgressDrag, false);
  preventEvent(event);
}

function updateProgressFromClientX(clientX) {
  var rect = els.progressDragTrack.getBoundingClientRect();
  var ratio;
  if (!rect.width) {
    return;
  }
  ratio = (clientX - rect.left) / rect.width;
  if (ratio < 0) {
    ratio = 0;
  }
  if (ratio > 1) {
    ratio = 1;
  }
  clearMarkJumpAnchor();
  els.audio.currentTime = ratio * els.audio.duration;
  updateMarkButtons();
  updateFileProgress();
}

function addMark(showFeedback) {
  var mark;
  if (!state.audioReady) {
    return;
  }
  clearMarkJumpAnchor();
  mark = normalizeMarkTime(els.audio.currentTime);
  if (hasMark(mark)) {
    if (showFeedback) {
      showMiddleFeedback("点位已存在 " + formatTimeWithTenths(mark));
    }
    return;
  }
  state.marks.push(mark);
  state.marks.sort(function (a, b) { return a - b; });
  savePlaybackState();
  updateMarkButtons();
  renderMarkList();
  if (showFeedback) {
    showMiddleFeedback("已打点 " + formatTimeWithTenths(mark));
  }
}

function hasMark(mark) {
  var i;
  for (i = 0; i < state.marks.length; i += 1) {
    if (normalizeMarkTime(state.marks[i]) === mark) {
      return true;
    }
  }
  return false;
}

function onMarkListClick(event) {
  var target = event.target || event.srcElement;
  var index;
  if (!target || !hasClass(target, "mark-delete")) {
    return;
  }
  index = parseInt(target.getAttribute("data-mark-index"), 10);
  deleteMark(index);
}

function deleteMark(index) {
  if (isNaN(index) || index < 0 || index >= state.marks.length) {
    return;
  }
  state.marks.splice(index, 1);
  savePlaybackState();
  clearMarkJumpAnchor();
  updateMarkButtons();
  renderMarkList();
}

function renderMarkList() {
  var html = "";
  var i;
  if (!els.markList) {
    return;
  }
  if (!state.marks.length) {
    els.markList.innerHTML = '<div class="mark-empty">暂无点位</div>';
    return;
  }
  for (i = 0; i < state.marks.length; i += 1) {
    html += '<div class="mark-row">';
    html += '<div class="mark-time">' + (i + 1) + ". " + escapeHtml(formatTimeWithTenths(state.marks[i])) + '</div>';
    html += '<button class="mark-delete" type="button" data-mark-index="' + i + '">删除</button>';
    html += '</div>';
  }
  els.markList.innerHTML = html;
}

function getUniqueMarks() {
  var list = [];
  var i;
  var value;
  for (i = 0; i < state.marks.length; i += 1) {
    value = normalizeMarkTime(state.marks[i]);
    if (!list.length || Math.abs(list[list.length - 1] - value) > 0.1) {
      list.push(value);
    }
  }
  return list;
}

function prepareOpenMarkSeek() {
  var list = getUniqueMarks();
  state.pendingOpenMarkSeek = list.length ? list[list.length - 1] : null;
}

function seekToPendingOpenMark() {
  var mark = state.pendingOpenMarkSeek;
  if (mark === null || !state.audioReady) {
    return;
  }
  if (els.audio.duration && !isNaN(els.audio.duration) && mark > els.audio.duration) {
    mark = els.audio.duration;
  }
  try {
    els.audio.currentTime = mark;
    state.pendingOpenMarkSeek = null;
  } catch (e) {
    return;
  }
  updateMarkButtons();
  updateFileProgress();
}

function getMarkSearchBase() {
  if (isMarkJumpAnchorActive()) {
    return state.markJumpAnchor;
  }
  return els.audio.currentTime;
}

function isMarkJumpAnchorActive() {
  var timeout = normalizeNumber(state.settings.markJumpTimeout, 0.1, 10, defaults.markJumpTimeout) * 1000;
  if (state.markJumpAnchor === null) {
    return false;
  }
  if (new Date().getTime() - state.markJumpAt <= timeout) {
    return true;
  }
  clearMarkJumpAnchor();
  return false;
}

function setMarkJumpAnchor(mark) {
  state.markJumpAnchor = mark;
  state.markJumpAt = new Date().getTime();
}

function clearMarkJumpAnchor() {
  state.markJumpAnchor = null;
  state.markJumpAt = 0;
}

function findPrevMark(baseTime) {
  var list = getUniqueMarks();
  var current = typeof baseTime === "number" ? baseTime : getMarkSearchBase();
  var i;
  for (i = list.length - 1; i >= 0; i -= 1) {
    if (list[i] < current - 0.15) {
      return list[i];
    }
  }
  return null;
}

function findNextMark(baseTime) {
  var list = getUniqueMarks();
  var current = typeof baseTime === "number" ? baseTime : getMarkSearchBase();
  var i;
  for (i = 0; i < list.length; i += 1) {
    if (list[i] > current + 0.15) {
      return list[i];
    }
  }
  return null;
}

function jumpPrevMark() {
  var mark = findPrevMark();
  if (mark !== null) {
    els.audio.currentTime = mark;
    setMarkJumpAnchor(mark);
    updateMarkButtons();
    updateFileProgress();
    showMiddleFeedback("上一点 " + formatTime(mark));
  }
}

function jumpNextMark() {
  var mark = findNextMark();
  if (mark !== null) {
    els.audio.currentTime = mark;
    setMarkJumpAnchor(mark);
    updateMarkButtons();
    updateFileProgress();
    showMiddleFeedback("下一点 " + formatTime(mark));
  }
}

function updateMarkButtons() {
  var duration = els.audio.duration;
  var html = "";
  var i;
  var percent;
  if (state.audioReady && isFinite(duration) && duration > 0) {
    for (i = 0; i < state.marks.length; i += 1) {
      if (!isFinite(state.marks[i]) || state.marks[i] < 0 || state.marks[i] > duration) {
        continue;
      }
      percent = state.marks[i] / duration * 100;
      html += '<span class="file-mark" style="left:' + percent + '%"></span>';
    }
  }
  if (els.fileMarks.innerHTML !== html) {
    els.fileMarks.innerHTML = html;
  }
}

function updateFileProgress() {
  updateStatusText();
  var percent = 0;
  if (state.audioReady && els.audio.duration && !isNaN(els.audio.duration)) {
    percent = (els.audio.currentTime / els.audio.duration) * 100;
  }
  if (percent < 0) {
    percent = 0;
  }
  if (percent > 100) {
    percent = 100;
  }
  els.fileProgress.style.width = percent + "%";
  if (state.progressDragging) {
    updateProgressDragPanel(percent);
  }
}

function updateProgressDragPanel(percent) {
  els.progressDragFill.style.width = percent + "%";
  els.progressDragHandle.style.left = percent + "%";
  els.progressDragTime.innerHTML = formatTime(els.audio.currentTime) + " / " + formatTime(els.audio.duration);
}

function updateStatusText() {
  var text = state.fileName || "未选择音频";
  if (state.settings.statusDisplay === "progress" && state.audioReady) {
    text = formatTime(isFinite(els.audio.currentTime) ? els.audio.currentTime : 0);
    if (state.settings.showTotalDuration) {
      text += " / " + (isFinite(els.audio.duration) && els.audio.duration > 0 ? formatTime(els.audio.duration) : "--:--");
    }
  }
  if (els.fileName.textContent !== text) {
    els.fileName.textContent = text;
    updateFileNameScroll();
  }
}

function updateFileNameScroll() {
  removeClass(els.fileName, "scrolling");
  if (state.settings.statusDisplay !== "title") { return; }
  window.setTimeout(function () {
    if (state.settings.statusDisplay === "title" && els.fileName.scrollWidth > els.fileName.parentNode.clientWidth + 2) {
      addClass(els.fileName, "scrolling");
    }
  }, 0);
}

