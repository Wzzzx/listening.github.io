// Assemble src/ into the single-file index.html that GitHub Pages serves.
//
// The deployed page must stay one self-contained HTML file (no extra requests,
// no server, no runtime modules), so this script only concatenates text: styles
// and scripts are inlined into src/index.template.html at the marked slots.
// There are deliberately no build dependencies.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const templatePath = path.join(root, 'src', 'index.template.html');
const targetPath = path.join(root, 'index.html');

// Inlining order is significant: every script shares one closure, and the
// stylesheet rules rely on their cascade order.
const styles = [
  ['01-base.css', 'page shell, typography, buttons'],
  ['02-browser.css', 'audio browser on the start page'],
  ['03-player.css', 'top bar, progress drag panel, marquee'],
  ['04-immersive.css', 'touch zones, transcript, mask mode'],
  ['05-config.css', 'configuration page']
];

const scripts = [
  ['01-state.js', 'storage keys, defaults, shared state, element cache'],
  ['02-bootstrap.js', 'init, element lookup, event binding'],
  ['03-settings.js', 'settings and per-file playback state'],
  ['04-cache.js', 'media cache: download, replay from cache, prune, status'],
  ['05-browser.js', 'audio index, folder browser, entry selection, transcript fetch'],
  ['06-playback.js', 'transport, progress, marks and status text'],
  ['07-transcript-parse.js', 'plain, speaker and range transcript parsing'],
  ['08-transcript-follow.js', 'continuous-mode scrolling and rendering'],
  ['09-reading.js', 'single-line view, mask mode, line jump'],
  ['10-gestures.js', 'swipe actions and zone feedback'],
  ['11-utils.js', 'formatting, URL building, DOM helpers']
];

const styleSlot = '<!--@styles-->\n';
const scriptSlot = '<!--@scripts-->\n';

function readPart(folder, name) {
  return fs.readFileSync(path.join(root, 'src', folder, name), 'utf8').replace(/\r\n/g, '\n');
}

function indent(text, width) {
  const pad = ' '.repeat(width);
  return text.split('\n').map(function (line) { return line === '' ? line : pad + line; }).join('\n');
}

function build() {
  const template = fs.readFileSync(templatePath, 'utf8').replace(/\r\n/g, '\n');
  const inlineStyles = styles.map(function (entry) { return indent(readPart('styles', entry[0]), 4); }).join('');
  const body = scripts.map(function (entry) { return indent(readPart('js', entry[0]), 6); }).join('');
  const inlineScript = '    (function () {\n' + body + '      init();\n    }());\n';

  if (template.indexOf(styleSlot) < 0 || template.indexOf(scriptSlot) < 0) {
    throw new Error('src/index.template.html lost its <!--@styles--> or <!--@scripts--> slot');
  }
  if (inlineStyles.indexOf('\n') < 0 || inlineScript.length < 100) {
    throw new Error('refusing to write an empty build');
  }
  return template
    .replace(styleSlot, function () { return inlineStyles; })
    .replace(scriptSlot, function () { return inlineScript; });
}

function main() {
  const html = build();
  const check = process.argv.indexOf('--check') >= 0;
  if (check) {
    const current = fs.existsSync(targetPath)
      ? fs.readFileSync(targetPath, 'utf8').replace(/\r\n/g, '\n')
      : '';
    if (current !== html) {
      console.error('index.html is out of date with src/. Run `npm run build` and commit the result.');
      process.exit(1);
    }
    console.log('index.html matches src/');
    return;
  }
  fs.writeFileSync(targetPath, html);
  console.log('Built index.html from ' + styles.length + ' stylesheets and ' + scripts.length + ' scripts');
}

module.exports = { build };

if (require.main === module) {
  main();
}
