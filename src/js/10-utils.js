function formatTime(seconds) {
  var total = Math.max(0, Math.floor(seconds));
  var minutes = Math.floor(total / 60);
  var rest = total % 60;
  return minutes + ":" + (rest < 10 ? "0" + rest : rest);
}

function formatTimeWithTenths(seconds) {
  var totalTenths = Math.round(normalizeMarkTime(seconds) * 10);
  var totalSeconds = Math.floor(totalTenths / 10);
  var minutes = Math.floor(totalSeconds / 60);
  var rest = totalSeconds % 60;
  var tenths = totalTenths % 10;
  return minutes + ":" + (rest < 10 ? "0" + rest : rest) + "." + tenths;
}

function normalizeMarkTime(seconds) {
  return Math.round(Math.max(0, seconds) * 10) / 10;
}

function keepImmersiveRatiosValid(changed) {
  keepRatiosObjectValid(state.settings, changed);
}

function keepRatiosObjectValid(settings, changed) {
  settings.topRatio = normalizeNumber(settings.topRatio, 15, 60, defaults.topRatio);
  settings.middleRatio = normalizeNumber(settings.middleRatio, 15, 60, defaults.middleRatio);
  if (settings.topRatio + settings.middleRatio > 80) {
    if (changed === "top") {
      settings.middleRatio = 80 - settings.topRatio;
    } else {
      settings.topRatio = 80 - settings.middleRatio;
    }
  }
  settings.topRatio = normalizeNumber(settings.topRatio, 15, 60, defaults.topRatio);
  settings.middleRatio = normalizeNumber(settings.middleRatio, 15, 60, defaults.middleRatio);
}

function bindSwipe(el, onSwipe, onTap) {
  var startX = 0;
  var startY = 0;
  var startTime = 0;
  var ignoreGesture = false;
  var suppressMouseUntil = 0;
  el.ontouchstart = function (event) {
    var touch = event.changedTouches[0];
    ignoreGesture = isInteractiveTarget(event.target || event.srcElement, el);
    if (ignoreGesture) {
      return;
    }
    startX = touch.clientX;
    startY = touch.clientY;
    startTime = new Date().getTime();
  };
  el.ontouchend = function (event) {
    var touch = event.changedTouches[0];
    suppressMouseUntil = new Date().getTime() + 700;
    if (ignoreGesture) {
      ignoreGesture = false;
      return;
    }
    var dx = touch.clientX - startX;
    var dy = touch.clientY - startY;
    var absX = Math.abs(dx);
    var absY = Math.abs(dy);
    var threshold = normalizeNumber(state.settings.swipeThreshold, 30, 160, defaults.swipeThreshold);
    var elapsed = new Date().getTime() - startTime;
    if (absX >= threshold && absX > absY * 1.25) {
      onSwipe(dx < 0 ? "left" : "right");
      if (event.preventDefault) {
        event.preventDefault();
      }
      return;
    }
    if (onTap && absX < 10 && absY < 10 && elapsed < 500) {
      onTap();
    }
  };
  el.onmousedown = function (event) {
    if (new Date().getTime() < suppressMouseUntil) {
      ignoreGesture = true;
      return;
    }
    if (isInteractiveTarget(event.target || event.srcElement, el)) {
      ignoreGesture = true;
      return;
    }
    ignoreGesture = false;
    startX = event.clientX;
    startY = event.clientY;
    startTime = new Date().getTime();
  };
  el.onmouseup = function (event) {
    var dx;
    var dy;
    var absX;
    var absY;
    var threshold;
    var elapsed;
    if (ignoreGesture) {
      ignoreGesture = false;
      return;
    }
    dx = event.clientX - startX;
    dy = event.clientY - startY;
    absX = Math.abs(dx);
    absY = Math.abs(dy);
    threshold = normalizeNumber(state.settings.swipeThreshold, 30, 160, defaults.swipeThreshold);
    elapsed = new Date().getTime() - startTime;
    if (absX >= threshold && absX > absY * 1.25) {
      onSwipe(dx < 0 ? "left" : "right");
      return;
    }
    if (onTap && absX < 10 && absY < 10 && elapsed < 500) {
      onTap();
    }
  };
}

function isInteractiveTarget(node, boundary) {
  var tag;
  while (node && node !== boundary) {
    tag = node.tagName ? node.tagName.toLowerCase() : "";
    if (tag === "button" || tag === "input" || hasClass(node, "masked-word")) {
      return true;
    }
    node = node.parentNode;
  }
  return false;
}

function normalizeNumber(value, min, max, fallback) {
  var num = parseFloat(value);
  if (isNaN(num)) {
    num = fallback;
  }
  if (num < min) {
    num = min;
  }
  if (num > max) {
    num = max;
  }
  return num;
}

function getNumber(value, fallback) {
  var num = parseFloat(value);
  return isNaN(num) ? fallback : num;
}

function buildAudioUrl(entry) {
  var url = entry.url;
  if (entry.version) {
    url += (url.indexOf("?") >= 0 ? "&" : "?") + "v=" + encodeURIComponent(entry.version);
  }
  return url;
}

function getUrlApi() {
  return window.URL || window.webkitURL;
}

function getEventClientX(event) {
  if (event && event.touches && event.touches.length) {
    return event.touches[0].clientX;
  }
  if (event && event.changedTouches && event.changedTouches.length) {
    return event.changedTouches[0].clientX;
  }
  return event ? event.clientX : 0;
}

function preventEvent(event) {
  if (event && event.preventDefault) {
    event.preventDefault();
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function trim(text) {
  return String(text).replace(/^\s+|\s+$/g, "");
}

function addClass(el, name) {
  if (!hasClass(el, name)) {
    el.className = trim(el.className + " " + name);
  }
}

function removeClass(el, name) {
  var parts = el.className.split(/\s+/);
  var next = [];
  var i;
  for (i = 0; i < parts.length; i += 1) {
    if (parts[i] && parts[i] !== name) {
      next.push(parts[i]);
    }
  }
  el.className = next.join(" ");
}

function hasClass(el, name) {
  return (" " + el.className + " ").indexOf(" " + name + " ") > -1;
}

