function handleImmersiveSwipe(direction) {
  if (direction === "right") {
    seekBy(getNumber(state.settings.forwardStep, defaults.forwardStep));
  } else {
    seekBy(-getNumber(state.settings.backStep, defaults.backStep));
  }
}

function handleMiddleSwipe(direction) {
  if (direction === "right") {
    jumpNextMark();
  } else {
    jumpPrevMark();
  }
}

function handleReadingSwipe(direction) {
  if (direction === "left") {
    changeLine(1);
  } else {
    changeLine(-1);
  }
}

function showMiddleFeedback(text) {
  if (!els.markZoneLabel) {
    return;
  }
  if (state.markFeedbackTimer) {
    window.clearTimeout(state.markFeedbackTimer);
  }
  els.markZoneLabel.innerHTML = escapeHtml(text);
  state.markFeedbackTimer = window.setTimeout(function () {
    els.markZoneLabel.innerHTML = "点击打点，左右滑动跳转点位";
    state.markFeedbackTimer = null;
  }, 1000);
}

