# deepseek-world-execute-me-crt

> THE WORLD IS A CRT. THE PROTAGONIST IS A CURSOR. THE SONG IS ITS OWN CURRENT.

一支**整幅画面就是一台老式 CRT 显像管**的节拍同步动画 MV —— 荧光绿代码、以终端日志形式逐字打出的歌词、
真正算对的数学图解、由同一锅字形 morph 出来的角色。示例曲目：Mili —《world.execute(me);》，
1920×1080 / 30 fps / 6359 帧 / 211.967 s / 实测 130.006 BPM。

**本仓库全部代码由 DeepSeek 制作**：人类只负责选题、写首轮 brief、逐轮下达指令与审美把关。
这里只放**源代码**与**两代的初始提示词**，外加交代来源与许可的
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)；设计文档、分镜、验收报告、成片、音频、歌词文件、
立绘一概不入库。首轮下达给 DeepSeek 的完整 brief 原文（未作修改）按代数分成两份：
[`prompts/gen1_提示词.txt`](prompts/gen1_提示词.txt) 与 [`prompts/gen2_提示词.txt`](prompts/gen2_提示词.txt)。

这个身份也写进了片子里：P00 开机幕的 `MODEL CARD` 第一行就是
`base deepseek · moe · distilled to 7.2e9 live`。

---

## ⚠️ 先读这一段：仓库里有 Mili 的歌词

源码为了把歌词逐字打在终端上，**以字符串形式内嵌了示例曲目的歌词片段与双语译文**。

| 位置 | 规模 |
|---|---|
| [`gen2-crt-mv/src/scenes.js`](gen2-crt-mv/src/scenes.js) | 86 处 `MV.cue("…")` 调用，把每句歌词锚到实测时间码上 |
| [`gen2-crt-mv/tools/gloss.py`](gen2-crt-mv/tools/gloss.py) | 双语字幕对照表 |
| [`gen2-crt-mv/work/p*.txt`](gen2-crt-mv/work/) | 14 份分幕补丁，共约 250 KB，正文含歌词 |
| `gen1-terminal-mv/src/mv-scenes.js` | 第一代的歌词行 |

**这是示例成片的痕迹，不是再分发授权。** 音乐与歌词版权归 **Mili** 所有；本仓库不含音频与 LRC 文件，
但上述字符串确实在仓库里。要发布你自己基于本仓库的成片，必须先取得词曲授权，或把示例曲目换成
你拥有权利的歌。`crt-anime-mv-skill/` 的九个 reference 模块**不含任何歌词**。

---

## 结构

| 路径 | 内容 |
|---|---|
| [`prompts/`](prompts/) | 两代的初始提示词 —— 首轮下达给 DeepSeek 的完整 brief 原文，[`gen1_提示词.txt`](prompts/gen1_提示词.txt)（导演 + 四阶段叙事 + 歌词规范）与 [`gen2_提示词.txt`](prompts/gen2_提示词.txt)（整帧显像管原则 + 发散要求） |
| [`gen2-crt-mv/`](gen2-crt-mv/) | **第二代**源码 —— 当前交付版本（v4）。整帧即显像管：15 幕逐帧动画、字形汤 metaball、ink 图层、两道闸门 |
| [`gen1-terminal-mv/`](gen1-terminal-mv/) | **第一代**源码 —— 分区式终端：HUD / STAGE / PANEL / LOG / STATUS 五区、角色立绘抠像 + 四色磷光染色、Manim 数学图集 |
| [`crt-anime-mv-skill/`](crt-anime-mv-skill/) | 把上面两代的做法压缩成的 **agent skill**：[`SKILL.md`](crt-anime-mv-skill/SKILL.md) + 九个 [`references/*.md`](crt-anime-mv-skill/references/) + 插件清单 |
| [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) | 融合来源、被引用的段落、外部依赖的 URL 与 license 逐项交代 |

两代的根本区别只有一句话：**第一代把 CRT 当作画面里的一个元素，第二代让 CRT 成为画面的全部边界。**

---

## 融合来源（致谢）

`crt-anime-mv` skill 与这两代管线，是在下列来源 skill 的做法之上**融合、改写**而成的。
本仓库**不含它们的任何文件**，只吸收其方法并在此列明来源：

| 来源 skill | 上游仓库 · license | 带进来的东西 | 落在本仓库的哪里 |
|---|---|---|---|
| `creative-music-video-director` | [FrameCoreWorks/framecore-works-claude-skills](https://github.com/FrameCoreWorks/framecore-works-claude-skills) · 专有（保留所有权利） | 先立论点再谈画面：一支 MV 要能被一句话复述 | [`SKILL.md`](crt-anime-mv-skill/SKILL.md) 的 composition model、`gen2-crt-mv/src/scenes.js` 的 `MODEL CARD` |
| `storyboard-director` | [kevinchin12/storyboard-director](https://github.com/kevinchin12/storyboard-director) · MIT | 分幕 + 时间码 + 每幕验收镜头，写成可执行的表 | `gen2-crt-mv/tools/analyze.py` 的 `SECTIONS`（P00–P14）、`gen2-crt-mv/work/shot.cjs` |
| `video-prompt-architect` | [FrameCoreWorks/framecore-works-codex-chatgpt-workflow-kit](https://github.com/FrameCoreWorks/framecore-works-codex-chatgpt-workflow-kit) · Apache-2.0 | 提示词的分层结构：身份块 → 叙事阶段 → 视觉规范 → 执行流程 | [`prompts/gen1_提示词.txt`](prompts/gen1_提示词.txt)、[`prompts/gen2_提示词.txt`](prompts/gen2_提示词.txt) |
| `any2video` | [chanktb/any2video](https://github.com/chanktb/any2video) · MIT | 输入约定：一首歌 + 一份 LRC + 一张透明立绘就能复现整条流程 | [`SKILL.md`](crt-anime-mv-skill/SKILL.md) 的 pipeline 图、两代的 `tools/` 分析入口 |
| `manim-skills` | [adithya-s-k/manim_skill](https://github.com/adithya-s-k/manim_skill) · MIT | 数学动画用 Manim 预渲染再打包成精灵图，Canvas 侧留回退 | `gen1-terminal-mv/manim/scenes.py`、`gen1-terminal-mv/tools/pack-math.py`、`gen1-terminal-mv/src/mv-math.js` |
| `motion-video-skill` | [bestagentkits/motion-video-skill](https://github.com/bestagentkits/motion-video-skill) · MIT | 运动由实测节拍与逐拍能量驱动，不用均匀正弦 | [`references/beat-and-timeline.md`](crt-anime-mv-skill/references/beat-and-timeline.md)、`gen1-terminal-mv/tools/beat-energy.mjs`、`gen2-crt-mv/tools/analyze.py` |
| `hyperframes-workflow` | [FrameCoreWorks/framecore-works-codex-chatgpt-workflow-kit](https://github.com/FrameCoreWorks/framecore-works-codex-chatgpt-workflow-kit) · Apache-2.0 | HTML + CSS + GSAP 的第二条渲染路径与它的 lint / layout / contrast / motion 闸门 | [`references/hyperframes.md`](crt-anime-mv-skill/references/hyperframes.md)、[`SKILL.md`](crt-anime-mv-skill/SKILL.md) 第 8 条铁律 |
| `find-skills` | [WhizZest/find-skills](https://github.com/WhizZest/find-skills) · **无 LICENSE 文件**（README 自称 MIT，但链接指向的文件不存在） | 技能的发现与安装约定：一个目录一个 skill、`npx skills add`、`--list` 自检 | [`tools/verify-skill.py`](crt-anime-mv-skill/tools/verify-skill.py) |
| `framecore-works-claude-skills` | [FrameCoreWorks/framecore-works-claude-skills](https://github.com/FrameCoreWorks/framecore-works-claude-skills) · 专有（保留所有权利） | 打包形态：`plugin.json` 与 `.claude-plugin/`、`.agents/plugins/` 清单并存且版本同步 | [`crt-anime-mv-skill/`](crt-anime-mv-skill/) 的三份清单 + [`verify-skill.py`](crt-anime-mv-skill/tools/verify-skill.py) 第 1、3 项检查 |

**上面九项只吸收了做法：不含任何一个仓库的文件，也没有复制它们的文本。** 链接与 license 一律按上游原样
列明（2026-09-30 逐个读过各仓库自带的 `LICENSE` 与 README 核对）。其中两项是不开放的：
`framecore-works-claude-skills` 明确写着「未经书面许可不得复制、修改、分发或使用」，
`find-skills` 根本没有 license 文件。所以本仓库的 MIT **只覆盖自己的源码与文档**，
不对它们主张任何权利。

**另有两处是例外，属于「引用」而不是「只有方法」**：`references/ascii-video.md` 从 Hermes Agent 的
`ascii-video` skill（MIT，© 2025 Nous Research）引用了一段 `tonemap` 函数、网格密度表与性能预算数字；
`references/hyperframes.md` 的 `check` 与 `*.motion.json` 两节改写自 HyperFrames 自带的 skill 文档
（Apache-2.0，© HeyGen）。两处都在模块内就地标注了来源、license 与「哪些地方改过」。
逐条清单见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 的 *Quoted material* 一节。

> 表里的九个仓库链接在 2026-09-30 逐个核过（存在、可访问、license 与所写一致）。
> 上游仓库改名或归档是常事，**如果你发现某个链接 404 了，请开 issue 或直接改这一行** ——
> 致谢里的死链比没有致谢更糟。

---

## 跑起来之前：代码是可移植的

两代脚本**不含任何写死的绝对路径**，也不含任何开发机的用户名或目录名。外部程序按下表解析，
每一处都可以用环境变量覆盖，不必改代码：

| 需要什么 | 解析顺序 | 覆盖变量 |
|---|---|---|
| ffmpeg / ffprobe | 环境变量 → 项目根目录下的 `ffmpeg/` → `PATH` →（第一代还认 Playwright 自带的那份，但会先验证它能不能解码音频，不能就排除） | `MV_FFMPEG` / `MV_FFPROBE`（gen2 也认 `FFMPEG` / `FFPROBE`） |
| Chrome / Chromium | 环境变量 → `ms-playwright` 里**版本号最大**的那个 chromium → 系统安装的 Chrome / Edge | `MV_CHROME` 或 `CHROME_PATH` |
| 歌曲 | 环境变量 → `input/song.mp3` | `MV_SONG` |
| LRC 歌词 | 环境变量 → `input/lyrics.lrc` | `MV_LRC` |
| 角色立绘 | 环境变量 → `input/character.png`（或 `input/character_sheet.jpg`） | `MV_CHARACTER` / `MV_CHARACTER_SHEET` |

找不到时脚本会在加载阶段就打印明确的下一步怎么做，而不是在渲染跑到一半时报一句看不懂的错。
唯一的例外是 `PATH` 这条兜底：如果那里没有，就把 `ffmpeg` 这个名字直接交给系统，让系统报错。

解析逻辑集中在 [`gen1-terminal-mv/tools/lib/env.cjs`](gen1-terminal-mv/tools/lib/env.cjs)、
[`gen2-crt-mv/tools/lib/env.cjs`](gen2-crt-mv/tools/lib/env.cjs) 与
[`gen1-terminal-mv/tools/lib/paths.py`](gen1-terminal-mv/tools/lib/paths.py)，改一处即可。
想确认本机能不能渲染，先跑一句：

```bash
node -e "const e=require('./tools/lib/env.cjs'); console.log(e.ROOT, e.chrome(), e.ffmpeg||'')"
```

---

## 跑第二代

环境：Node 20+（playwright 1.63 要求；开发时为 v24.15.0）、Python 3.9+（numpy）、
完整功能的 FFmpeg、本机 Chrome 或 Edge。

```bash
cd gen2-crt-mv
npm install                              # playwright-core

# 素材自备（不入库），放在 input/：
#   input/song.mp3                    ← 换成你自己的歌也行，path 由 MV_SONG 覆盖
#   input/lyrics.lrc                  ← [mm:ss.xx] 格式
# 音频/歌词路径写在 tools/analyze.py 顶部，可用环境变量覆盖

python tools/analyze.py                  # 实测 BPM / 相位 / 逐拍能量 / LRC 吸附 → work/data/{timeline,audio}.json
python tools/gloss.py                    # 套用双语字幕表 → src/data/timeline.js

# src/data/audio.js 是纯数值（波形 / 频带 / 逐拍能量），没有单独的重建脚本，把上一步产物包一层即可：
node -e "const f=require('fs');f.mkdirSync('src/data',{recursive:true});f.writeFileSync('src/data/audio.js','window.MV_AUDIO='+f.readFileSync('work/data/audio.json','utf8')+';')"

node tools/check-gates.cjs               # 闸门 1：合成级检查（墨层字符串、颜色戏剧、双语成对、红色闸门…）
node work/zone.cjs                       # 闸门 2：带区检查，确认没有文字挤进 HUD / 字幕 / 状态栏
node tools/render-all.cjs --workers 6    # 6359 帧分片渲染 + 拼接 + 混音 → work/out/
```

只预览不渲染：浏览器打开 `gen2-crt-mv/src/index.html`（需先生成 `src/data/`）。
改动画的入口只有一个：`src/scenes.js`；逐幕补丁在 `work/pNN.txt`，用
`node work/splice.cjs p02.txt "P02 GEOMETRY" "P03 CURRENT"` 回写。

`work/` 是本代的设计与调试工具台，每个脚本的用途见
[`gen2-crt-mv/work/README.md`](gen2-crt-mv/work/README.md) —— 里面有 30 多个针对具体失败模式写的小工具，
从「这行字落在哪个带区」到「两个渲染结果是否逐帧同哈希」。

## 跑第一代

```bash
cd gen1-terminal-mv
npm install playwright                   # 无头渲染，浏览器复用系统 Chrome

# 素材自备：input/character.png（必须 RGBA 透明通道）、input/song.mp3、input/lyrics.lrc
python tools/prep-fishmaid.py            # 角色抠像 → 四种磷光染色（绿/青/琥珀/白）
python tools/pack-math.py                # （可选）Manim 数学动画帧 → 精灵图；没装 Manim 会走 Canvas 回退
node tools/decode-audio.mjs              # mp3 → PCM
node tools/analyze-audio.mjs             # 自相关 + 相位扫描 → BPM / offset
node tools/beat-energy.mjs               # 每拍 onset 与低/中/高频带能量
node tools/build-timeline.mjs            # LRC + 节拍网格 → data/timeline.json
node tools/gen-data.cjs                  # → src/data.js（生成物，不入库）
node tools/gen-sheet-meta.cjs            # → src/mv-sheet-meta.js
node tools/render-all.cjs                # 8 进程并行渲染 + 拼接 + 混音 → render/
node tools/verify-render.cjs             # 客观 QC：时长 / 帧数 / 响度
node tools/verify-beat-sync.cjs          # 节拍调制检验：亮不亮在节上，错网格对照组必须更低
```

---

## 实测数字

| 项 | 值 | 怎么量的 |
|---|---|---|
| BPM | **130.006**（不是标注的 130） | 96 频带谱通量 onset 包络 → 自相关 + 0.005 步长相位扫描 |
| 相位偏移 | 0.1846 s | 同上 |
| 拍数 / 帧数 / 时长 | 459 拍 / 6359 帧 / 211.967 s | 30 fps 恒定，`gen2-crt-mv/tools/analyze.py` |
| 结构验证 | 15 个段落边界全部落在 8 小节的整数倍上（16/24/32/40/56/64/68/88） | 段落表 vs 节拍网格 |
| 漂移 | 前半 −0.025 拍（−11.5 ms），后半 0.000 拍 | 前后半各自寻相 |
| LRC 吸附率 | 51.9%（阈值 120 ms） | `gen2-crt-mv/tools/analyze.py` |
| 输出 | H.264 / yuv420p / MP4 + **原曲 mp3 原封直通**（另有 AAC 320k 版本） | `gen2-crt-mv/tools/render-all.cjs` |

这些数字都可以用上面的命令在你的机器上重跑复现；本仓库不保存它们所在的报告文档。

---

## 装上这个 skill

```bash
cd crt-anime-mv-skill
npx skills add .
npx skills add . --list                  # 应当只报告一个 skill：crt-anime-mv
python tools/verify-skill.py             # 清单一致性 + references 引用可解析
```

---

## 为什么没有音频、歌词文件和成片

1. **体积。** 成片 422.7 MB，超出 GitHub 单文件上限；渲染分片、精灵图与 venv 合计 4 GB 以上。
2. **版权。** 音乐与歌词版权归 **Mili** 所有，角色立绘版权归其画师所有。

缺席的是**文件和音频**，不是**字符串** —— 源码里的歌词片段见本文开头的警示。
[`crt-anime-mv-skill/`](crt-anime-mv-skill/) 不含歌词，可以独立使用。

---

## 许可

本仓库的 **MIT** 只覆盖 DeepSeek 为这两代写下的那部分：源码与工具、仓库自身的文档、
以及 [`crt-anime-mv-skill/`](crt-anime-mv-skill/)。见 [LICENSE](LICENSE) 开头的
`SCOPE OF THIS LICENSE` —— 它写明不覆盖什么，并说明「MV Studio」是项目集体署名而非个人署名。

| 内容 | 归属与条款 |
|---|---|
| 两代源码、`tools/`、[`crt-anime-mv-skill/`](crt-anime-mv-skill/)、本 README | MIT（[LICENSE](LICENSE)） |
| 音乐《world.execute(me);》与歌词、双语译文 | © Mili —— **未授权**。本仓库不含音频与 LRC 文件；源码里内嵌的歌词字符串只是成片痕迹 |
| 角色立绘 | © 其画师，本仓库不含 |
| `references/ascii-video.md` 引用的 tonemap / 表格 / 数字 | [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)，MIT，© 2025 Nous Research |
| `references/hyperframes.md` 引用的 `check` / motion 两节 | [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)，Apache-2.0，© HeyGen |
| `creative-music-video-director`、`framecore-works-claude-skills` | [FrameCoreWorks/framecore-works-claude-skills](https://github.com/FrameCoreWorks/framecore-works-claude-skills) —— **专有，保留所有权利**，本仓库不含其任何文件 |
| `find-skills` | [WhizZest/find-skills](https://github.com/WhizZest/find-skills) —— **无 LICENSE 文件**，README 自称 MIT 但指向的文件不存在；本仓库不含其任何文件 |
| `storyboard-director`、`any2video`、`manim-skills`、`motion-video-skill` | 各自仓库，MIT（链接见上表） |
| `video-prompt-architect`、`hyperframes-workflow`、HyperFrames 本体 | 各自仓库，Apache-2.0（链接见上表） |

所以：**拿走本仓库的代码没问题；用它复现示例曲目不行** —— 那需要先取得 Mili 词曲的授权，
或者换成你自己有权利的歌。逐条依据见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
