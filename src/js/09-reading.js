function renderLine() {
  var line = state.lyrics[state.lineIndex];
  var i;
  var parts;
  var html = "";
  if (!line) {
    els.lineCard.innerHTML = '<div class="empty-line">暂无台词，请到配置页添加</div>';
    updateLineJump();
    return;
  }
  if (!state.settings.maskText) {
    els.lineCard.innerHTML = '<div class="line-text">' + escapeHtml(line) + '</div>';
    updateLineJump();
    return;
  }
  parts = line.split(/(\s+)/);
  for (i = 0; i < parts.length; i += 1) {
    if (/^\s+$/.test(parts[i])) {
      html += escapeHtml(parts[i]);
    } else if (parts[i] !== "") {
      html += '<span class="masked-word">' + escapeHtml(parts[i]) + '</span>';
    }
  }
  els.lineCard.innerHTML = '<div class="line-text">' + html + '</div>';
  bindMaskedWords();
  updateLineJump();
}

function toggleMask(event) {
  state.settings.maskText = !state.settings.maskText;
  renderLine();
  saveSettings();
  if (event && event.stopPropagation) {
    event.stopPropagation();
  }
}

function bindMaskedWords() {
  var words = els.lineCard.getElementsByTagName("span");
  var i;
  for (i = 0; i < words.length; i += 1) {
    if (hasClass(words[i], "masked-word")) {
      words[i].onclick = function (event) {
        addClass(this, "revealed");
        if (event && event.stopPropagation) {
          event.stopPropagation();
        }
      };
    }
  }
}

function changeLine(delta) {
  var next;
  if (!state.lyrics.length) {
    return;
  }
  next = state.lineIndex + delta;
  if (next < 0 || next >= state.lyrics.length) {
    return;
  }
  state.lineIndex = next;
  els.lineArea.scrollTop = 0;
  renderLine();
  savePlaybackState();
}

function onLineJumpInput() {
  var index = parseInt(els.lineJumpInput.value, 10) - 1;
  jumpToLine(index);
}

function jumpToLine(index) {
  if (!state.lyrics.length) {
    return;
  }
  if (isNaN(index)) {
    return;
  }
  if (index < 0) {
    index = 0;
  }
  if (index >= state.lyrics.length) {
    index = state.lyrics.length - 1;
  }
  state.lineIndex = index;
  els.lineArea.scrollTop = 0;
  renderLine();
  savePlaybackState();
}

function updateLineJump() {
  var total = state.lyrics.length;
  var current = total ? state.lineIndex + 1 : 0;
  if (!els.lineJumpText || !els.lineJumpInput) {
    return;
  }
  if (els.lineJump) {
    if (total && state.lineJumpVisible) {
      removeClass(els.lineJump, "hidden");
    } else {
      addClass(els.lineJump, "hidden");
    }
  }
  els.lineCount.innerHTML = current + "/" + total;
  els.lineJumpText.innerHTML = current + "/" + total;
  els.maskBtn.innerHTML = state.settings.maskText ? "关闭遮盖" : "启用遮盖";
  els.lineJumpInput.min = total ? "1" : "0";
  els.lineJumpInput.max = total ? String(total) : "0";
  els.lineJumpInput.value = total ? String(current) : "0";
  els.lineJumpInput.disabled = total < 2;
}

function toggleLineJump() {
  if (!state.lyrics.length) {
    return;
  }
  state.lineJumpVisible = !state.lineJumpVisible;
  updateLineJump();
}

function hideLineJump() {
  state.lineJumpVisible = false;
  updateLineJump();
}

