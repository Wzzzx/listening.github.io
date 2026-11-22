var storageKey = "phoneListenerSettings";
var playbackStateKey = "phoneListenerPlaybackState";
var defaults = {
  forwardStep: 10,
  backStep: 5,
  markJumpTimeout: 1,
  maskText: false,
  continuousMode: false,
  statusDisplay: "progress",
  showTotalDuration: false,
  swipeThreshold: 50,
  topRatio: 25,
  middleRatio: 25
};
var state = {
  page: "start",
  settings: loadSettings(),
  audioIndex: null,
  browserPath: [],
  browserItems: [],
  transcriptLoadToken: 0,
  audioReady: false,
  audioLoadToken: 0,
  audioObjectUrl: "",
  currentAudioUrl: "",
  wantsPlay: false,
  fileKey: "",
  fileName: "",
  lyrics: [],
  transcriptType: "plain",
  transcriptCues: [],
  transcriptIndex: -1,
  transcriptFrame: null,
  transcriptAnimation: null,
  transcriptResumeTimer: null,
  transcriptManual: false,
  transcriptPointerDown: false,
  lineIndex: 0,
  marks: [],
  markJumpAnchor: null,
  markJumpAt: 0,
  pendingOpenMarkSeek: null,
  markFeedbackTimer: null,
  progressDragging: false,
  lineJumpVisible: false,
  pendingLineIndex: null,
  savedPlaybackState: loadPlaybackState()
};
var els = {};

