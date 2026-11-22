# listening.github.io

手机端的听力练习播放器：逐句跟读、打点跳转、全文滚动、按词遮盖。纯静态站点，
GitHub Pages 直接从仓库根目录的 `index.html` 提供服务，音频与字幕放在 `audio/`。

## 开发流程

源码在 `src/`，根目录的 `index.html` 是**构建产物**：

```bash
npm run build    # src/ → index.html
npm test         # 先校验产物是否最新，再跑测试
```

改了 `src/` 之后必须重新 `npm run build`，并把 `index.html` 一起提交——线上直接
读这个文件。`npm test` 里的 `--check` 会拦住忘记构建的情况。

`index.html` 顶部有生成标记，请勿手改；`npm run check` 可以单独做一次产物校验。

## 目录

```
index.html                构建产物：单文件页面，内联全部样式与脚本
src/index.template.html   页面骨架，含 <!--@styles--> / <!--@scripts--> 两个占位槽
src/styles/01-base.css      版式、按钮、页面容器
src/styles/02-browser.css   起始页的音频浏览
src/styles/03-player.css    顶栏、进度拖动面板、跑马灯
src/styles/04-immersive.css 触控区、全文滚动、遮盖模式
src/styles/05-config.css    配置页
src/js/01-state.js          存储键、默认值、共享 state、元素缓存
src/js/02-bootstrap.js      init、元素查找、事件绑定
src/js/03-settings.js       设置与按音频保存的播放状态
src/js/04-browser.js        音频索引、目录浏览、选集、字幕拉取
src/js/05-playback.js       播放控制、进度、点位、状态栏文本
src/js/06-transcript-parse.js 三种字幕格式的解析与长轮次切句
src/js/07-transcript-follow.js 全文滚动跟随与渲染
src/js/08-reading.js        单行视图、遮盖、行号跳转
src/js/09-gestures.js       滑动动作与区域反馈
src/js/10-utils.js          时间格式化、URL 拼接、DOM 工具
scripts/build.js           拼接器（无第三方依赖）
scripts/test-*.js          解析与跟随逻辑的测试
scripts/generate-audio-index.js 扫描 audio/ 生成 index.json
compress.cmd               批量压缩 mp3 的辅助脚本（Windows）
```

## 约定

- 所有脚本按编号顺序拼进**同一个 IIFE**，共享 `state`、`els` 和全部函数；新增文件
  需要在 `scripts/build.js` 的 `styles` / `scripts` 列表里登记顺序。
- 样式同样按编号顺序级联，编号即优先级顺序。
- 拼接是纯文本操作：不压缩、不转译，产物与 `src/` 逐字对应（除顶部生成标记），
  所以线上仍然是零外部请求的单文件页面。

## 字幕格式

`audio/index.json` 的 `transcriptUrl` 指向的 txt 支持三种写法：

1. 纯文本，每行一句（无时间轴，仅逐行阅读）；
2. `MM:SS.ss` / 说话人 / 文本 三行一组（播客 ASR 导出）；超过 200 字符的轮次会在
   播放时按句子切成多段，并用字符数插值出段内时间，避免全文滚动长时间停在一大段上；
3. `[MM:SS - MM:SS] 文本` 每行一条（字幕导出）；相邻片段会合并成句，单句上限
   400 字符，起止时间用原始时间戳。

新增音频后运行 `node scripts/generate-audio-index.js` 重建索引。
