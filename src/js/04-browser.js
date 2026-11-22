function loadAudioIndex() {
  setBrowserMessage("正在读取 audio/index.json...");
  fetch("audio/index.json", { cache: "no-cache" })
    .then(function (response) {
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      return response.json();
    })
    .then(function (data) {
      state.audioIndex = normalizeAudioIndex(data);
      state.browserPath = [];
      renderAudioBrowser();
    })
    .catch(function () {
      state.audioIndex = null;
      setBrowserMessage("无法读取 audio/index.json，请先运行 node scripts/generate-audio-index.js");
    });
}

function normalizeAudioIndex(data) {
  var files = data && data.files && data.files.length ? data.files : [];
  var list = [];
  var i;
  var item;
  for (i = 0; i < files.length; i += 1) {
    item = files[i];
    if (String(item.extension || "").toLowerCase() !== "mp3") {
      continue;
    }
    list.push({
      name: item.name || item.title || item.path || "audio.mp3",
      title: item.title || item.name || "audio",
      url: item.url || item.path,
      version: item.modifiedAt ? String(item.modifiedAt) : (item.size ? String(item.size) : ""),
      folders: item.folders && item.folders.length ? item.folders.slice(0) : getFoldersFromPath(item.path),
      transcriptUrl: item.transcriptUrl || null
    });
  }
  return list;
}

function getFoldersFromPath(filePath) {
  var parts = String(filePath || "").split("/");
  if (parts[0] === "audio") {
    parts.shift();
  }
  parts.pop();
  return parts;
}

function renderAudioBrowser() {
  var folders = {};
  var folderNames = [];
  var files = [];
  var html = "";
  var list = state.audioIndex || [];
  var path = state.browserPath;
  var i;
  var item;
  var nextFolder;

  state.browserItems = [];
  els.browserPath.innerHTML = escapeHtml(path.length ? "audio / " + path.join(" / ") : "audio");
  els.browserBackBtn.disabled = path.length === 0;

  for (i = 0; i < list.length; i += 1) {
    item = list[i];
    if (!isInBrowserPath(item, path)) {
      continue;
    }
    if (item.folders.length > path.length) {
      nextFolder = item.folders[path.length];
      if (!folders[nextFolder]) {
        folders[nextFolder] = true;
        folderNames.push(nextFolder);
      }
    } else {
      files.push(item);
    }
  }

  folderNames.sort(function (a, b) { return a.localeCompare(b, "en"); });
  files.sort(function (a, b) { return a.name.localeCompare(b.name, "en"); });

  for (i = 0; i < folderNames.length; i += 1) {
    state.browserItems.push({ type: "folder", name: folderNames[i] });
    html += renderBrowserItem(state.browserItems.length - 1, "folder", folderNames[i]);
  }
  for (i = 0; i < files.length; i += 1) {
    state.browserItems.push({ type: "audio", audio: files[i] });
    html += renderBrowserItem(state.browserItems.length - 1, "audio", files[i].name);
  }

  if (!html) {
    html = '<div class="browser-message">这个目录下没有 mp3 文件</div>';
  }
  els.browserList.innerHTML = html;
}

function isInBrowserPath(item, path) {
  var i;
  if (!item || item.folders.length < path.length) {
    return false;
  }
  for (i = 0; i < path.length; i += 1) {
    if (item.folders[i] !== path[i]) {
      return false;
    }
  }
  return true;
}

function renderBrowserItem(index, type, name) {
  var icon = type === "folder" ? "目录" : "音频";
  return '<button class="browser-item" type="button" data-browser-index="' + index + '">' +
    '<span class="browser-icon">' + escapeHtml(icon) + '</span>' +
    '<span class="browser-name">' + escapeHtml(name) + '</span>' +
    '</button>';
}

function setBrowserMessage(message) {
  els.browserList.innerHTML = '<div class="browser-message">' + escapeHtml(message) + '</div>';
}

function onBrowserListClick(event) {
  var target = event.target || event.srcElement;
  var itemNode = findBrowserItemNode(target);
  var index;
  var item;
  var folderPath;
  var singleAudio;
  if (!itemNode) {
    return;
  }
  index = parseInt(itemNode.getAttribute("data-browser-index"), 10);
  item = state.browserItems[index];
  if (!item) {
    return;
  }
  if (item.type === "folder") {
    folderPath = state.browserPath.concat([item.name]);
    singleAudio = getSingleFolderAudio(folderPath);
    if (singleAudio) {
      selectAudioEntry(singleAudio);
    } else {
      state.browserPath = folderPath;
      renderAudioBrowser();
    }
  } else if (item.type === "audio") {
    selectAudioEntry(item.audio);
  }
}

function getSingleFolderAudio(folderPath) {
  var list = state.audioIndex || [];
  var singleAudio = null;
  var item;
  var i;
  for (i = 0; i < list.length; i += 1) {
    item = list[i];
    if (!isInBrowserPath(item, folderPath)) {
      continue;
    }
    if (singleAudio || item.folders.length !== folderPath.length || !item.transcriptUrl) {
      return null;
    }
    singleAudio = item;
  }
  return singleAudio;
}

function findBrowserItemNode(node) {
  while (node && node !== els.browserList) {
    if (node.getAttribute && node.getAttribute("data-browser-index") !== null) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}

function goBrowserParent() {
  if (!state.browserPath.length) {
    return;
  }
  state.browserPath.pop();
  renderAudioBrowser();
}

function selectAudioEntry(entry) {
  if (!entry || !entry.url) {
    return;
  }
  if (state.fileUrl) {
    getUrlApi().revokeObjectURL(state.fileUrl);
  }
  state.fileUrl = "";
  state.fileKey = entry.url;
  state.fileName = entry.name || entry.title || "audio.mp3";
  state.audioReady = true;
  state.lineIndex = 0;
  restorePlaybackState();
  prepareOpenMarkSeek();
  renderMarkList();
  clearMarkJumpAnchor();
  els.audio.pause();
  els.audio.src = buildAudioUrl(entry);
  els.audio.currentTime = 0;
  seekToPendingOpenMark();
  els.fileName.innerHTML = escapeHtml(state.fileName);
  updateFileNameScroll();
  setLyricsText("");
  loadTranscript(entry);
  applyImmersiveRatio();
  updatePlayButton();
  updateMarkButtons();
  updateFileProgress();
  showPage("player");
}

function loadTranscript(entry) {
  var token = state.transcriptLoadToken + 1;
  state.transcriptLoadToken = token;
  if (!entry.transcriptUrl) {
    return;
  }
  fetch(entry.transcriptUrl, { cache: "no-cache" })
    .then(function (response) {
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      return response.text();
    })
    .then(function (text) {
      if (state.transcriptLoadToken === token) {
        setLyricsText(text);
      }
    })
    .catch(function () {
      if (state.transcriptLoadToken === token) {
        setLyricsText("");
      }
    });
}

function setLyricsText(text) {
  els.lyricsInput.value = text;
  updateLyrics(text);
}

function onFileSelected() {
  var input = els.startFileInput;
  var file = input.files && input.files[0];
  if (!file) {
    return;
  }
  stopTranscriptFollow();
  state.transcriptIndex = -1;
  if (state.fileUrl) {
    getUrlApi().revokeObjectURL(state.fileUrl);
  }
  state.fileUrl = getUrlApi().createObjectURL(file);
  state.fileKey = "local:" + file.name + ":" + file.size + ":" + file.lastModified;
  state.fileName = file.name || "已选择音频";
  state.audioReady = true;
  state.lineIndex = 0;
  restorePlaybackState();
  prepareOpenMarkSeek();
  renderMarkList();
  clearMarkJumpAnchor();
  els.audio.src = state.fileUrl;
  els.audio.currentTime = 0;
  seekToPendingOpenMark();
  els.fileName.innerHTML = escapeHtml(state.fileName);
  updateFileNameScroll();
  els.audio.pause();
  applyImmersiveRatio();
  updatePlayButton();
  updateMarkButtons();
  updateFileProgress();
  showPage("player");
}

