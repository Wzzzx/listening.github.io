var rangeCuePattern = /^\[\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,](\d{1,3}))?\s*[-–—~]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,](\d{1,3}))?\s*\]\s*(\S.*)$/;
var rangeEndPattern = /[.!?…。！？]["'”’)\]]*$/;
var rangeMergeGap = 2;
var rangeMergeLength = 400;
// A speaker turn is often exported as one very long line. Continuous mode
// scrolls on cue changes, so a 3000-character turn would both freeze the
// page for minutes and read as a wall of text.
var turnSplitLength = 200;
var turnSegmentLength = 150;
var turnSpeechRate = 14;

function parseTranscript(text) {
  var raw = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  var lines = raw.filter(function (line) { return trim(line) !== ""; });
  var fallback = { type: "plain", lines: lines, cues: [] };
  var range = parseRangeTranscript(lines);
  if (range) { return range; }
  var cues = [];
  if (!lines.length || lines.length % 3 !== 0) { return fallback; }
  for (var i = 0; i < lines.length; i += 3) {
    var match = /^(\d+):([0-5]\d)\.(\d{2})$/.exec(trim(lines[i]));
    if (!match) { return fallback; }
    var start = Number(match[1]) * 60 + Number(match[2]) + Number(match[3]) / 100;
    if (!isFinite(start)) { return fallback; }
    cues.push({ start: start, speaker: trim(lines[i + 1]), text: lines[i + 2], sourceIndex: i / 3 });
  }
  // Speaker turns can overlap and be exported slightly out of time order.
  // Keep both the displayed paragraphs and binary-search timeline aligned.
  cues.sort(function (a, b) { return a.start - b.start || a.sourceIndex - b.sourceIndex; });
  cues = expandTurnCues(cues);
  return { type: "timed-speaker", cues: cues, lines: cues.map(function (cue) { return cue.text; }) };
}

// Each long turn becomes several sentence-sized cues whose start times are
// interpolated by character count inside the turn. Speech rate is steady
// enough for that to stay within a sentence, and every turn boundary
// realigns the natural search, so the error never accumulates.
function expandTurnCues(cues) {
  var expanded = [];
  var i;
  var cue;
  var next;
  var total;
  var estimate;
  var span;
  var parts;
  var elapsed;
  var j;
  var partStart;
  var partEnd;
  for (i = 0; i < cues.length; i += 1) {
    cue = cues[i];
    next = cues[i + 1];
    total = cue.text.length;
    if (total <= turnSplitLength) {
      expanded.push(cue);
      continue;
    }
    estimate = Math.max(1, total / turnSpeechRate);
    if (isFinite(cue.end) && cue.end > cue.start) {
      span = cue.end - cue.start;
    } else if (next && isFinite(next.start) && next.start > cue.start) {
      // A long silence after the turn must not stretch the text across it.
      span = Math.min(next.start - cue.start, estimate * 1.6);
    } else {
      span = estimate;
    }
    if (!(span > 0)) { span = estimate; }
    parts = splitTurnText(cue.text, turnSegmentLength);
    elapsed = 0;
    for (j = 0; j < parts.length; j += 1) {
      partStart = cue.start + (elapsed / total) * span;
      elapsed += parts[j].length;
      partEnd = cue.start + (elapsed / total) * span;
      expanded.push({
        start: partStart,
        end: Math.max(partStart, partEnd),
        speaker: cue.speaker,
        text: parts[j],
        sourceIndex: cue.sourceIndex,
        part: j
      });
    }
  }
  return expanded;
}

// Split on terminal punctuation, then pack complete sentences into segments
// no longer than maxLength. A single sentence that long is cut at a space
// (or at the limit for scripts that do not use spaces).
function splitTurnText(text, maxLength) {
  var pieces = String(text).match(/[^.!?…。！？]+[.!?…。！？]*["'”’)\]]*\s*/g) || [String(text)];
  var segments = [];
  var current = "";
  var i;
  var piece;
  var cut;
  for (i = 0; i < pieces.length; i += 1) {
    piece = pieces[i];
    if (trim(piece) === "") { continue; }
    while (piece.length > maxLength) {
      cut = piece.lastIndexOf(" ", maxLength);
      if (cut <= 0) { cut = maxLength; }
      if (trim(current) !== "") {
        segments.push(trim(current));
        current = "";
      }
      segments.push(trim(piece.slice(0, cut)));
      piece = piece.slice(cut);
    }
    if (trim(piece) === "") { continue; }
    if (trim(current) !== "" && current.length + piece.length > maxLength) {
      segments.push(trim(current));
      current = piece;
    } else {
      current += piece;
    }
  }
  if (trim(current) !== "") { segments.push(trim(current)); }
  return segments.length ? segments : [trim(text)];
}

// "[MM:SS - MM:SS] text" subtitle exports. Each line is an ASR fragment, so
// adjacent fragments are joined into one sentence for display. The start time
// drives scrolling exactly like timed-speaker; the end time is only a hint for
// deciding where a sentence stops (long silent gap, or terminal punctuation).
function parseRangeTranscript(lines) {
  var cues = [];
  var i;
  var match;
  var start;
  var end;
  if (!lines.length) { return null; }
  for (i = 0; i < lines.length; i += 1) {
    match = rangeCuePattern.exec(trim(lines[i]));
    if (!match) { return null; }
    start = parseClockSeconds(match[1], match[2], match[3], match[4]);
    end = parseClockSeconds(match[5], match[6], match[7], match[8]);
    if (!isFinite(start) || !isFinite(end)) { return null; }
    cues.push({
      start: start,
      end: Math.max(start, end),
      speaker: "",
      text: trim(match[9]),
      sourceIndex: i
    });
  }
  cues.sort(function (a, b) { return a.start - b.start || a.sourceIndex - b.sourceIndex; });
  cues = mergeRangeCues(cues);
  return { type: "timed-range", cues: cues, lines: cues.map(function (cue) { return cue.text; }) };
}

function parseClockSeconds(first, second, third, fraction) {
  var hours = 0;
  var minutes;
  var seconds;
  var total;
  if (third !== undefined) {
    hours = parseInt(first, 10);
    minutes = parseInt(second, 10);
    seconds = parseInt(third, 10);
    if (minutes > 59 || seconds > 59) { return NaN; }
  } else {
    minutes = parseInt(first, 10);
    seconds = parseInt(second, 10);
    if (seconds > 59) { return NaN; }
  }
  total = hours * 3600 + minutes * 60 + seconds;
  if (fraction) {
    total += parseInt(fraction, 10) / Math.pow(10, fraction.length);
  }
  return total;
}

function mergeRangeCues(cues) {
  var merged = [];
  var current = null;
  var i;
  for (i = 0; i < cues.length; i += 1) {
    if (!current) {
      current = createRangeSentence(cues[i]);
    } else if (rangeCueStartsSentence(current, cues[i])) {
      merged.push(current);
      current = createRangeSentence(cues[i]);
    } else {
      current.text += " " + cues[i].text;
      current.end = Math.max(current.end, cues[i].end);
    }
  }
  if (current) { merged.push(current); }
  return merged;
}

function createRangeSentence(cue) {
  return { start: cue.start, end: cue.end, speaker: "", text: cue.text, sourceIndex: cue.sourceIndex };
}

function rangeCueStartsSentence(current, cue) {
  // Fragments exported with the same start time belong together; keeping them
  // apart would make the binary search skip the earlier one entirely.
  if (cue.start <= current.start) { return false; }
  if (cue.start - current.end > rangeMergeGap) { return true; }
  if (current.text.length >= rangeMergeLength) { return true; }
  return rangeEndPattern.test(current.text);
}

