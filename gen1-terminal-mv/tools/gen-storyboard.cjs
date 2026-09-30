
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const T = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "timeline.json"), "utf8"));
const OFF = T.meta.beatOffset, BEAT = T.meta.beat;
const B = String.fromCharCode(96);   /* literal backtick, kept out of the source */

function fmt(t) { const m = Math.floor(t / 60), s = t - m * 60; return String(m).padStart(2, "0") + ":" + s.toFixed(3).padStart(6, "0"); }
function beatOf(t) { return Math.round((t - OFF) / BEAT); }
function barOf(t) { return Math.floor(beatOf(t) / 4) + 1; }
function beatIn(t) { return ((beatOf(t) % 4) + 4) % 4 + 1; }
function lyricAt(t) { let best = "-"; for (const L of T.lines) if (L.tOn <= t + 0.001) best = L.text; return best; }
function c(s) { return B + s + B; }

const SHOTS = [
 ["S01",1,0.000,0.620,"全黑","CRT 未上电，画面纯黑，只有极弱的机壳轮廓","from black","-"],
 ["S02",1,0.620,1.700,"固定 / 纵向展开","CRT 通电：一条水平亮线从中央撕开成整幅扫描面","硬切 + 垂直展开","0.62s 电源接入"],
 ["S03",1,1.700,4.400,"微推","BIOS 自检逐行输出，右侧同步滚动内存十六进制转储","cut","Switch on the power line / PROTECTION"],
 ["S04",1,4.400,7.300,"固定","棋子与参数列表落格，歌词日志开始逐行打字输出","cut on beat","Lay down your pieces"],
 ["S05",1,7.300,10.100,"固定 / 波形微动","参数缓冲区填充，地址空间被闪光方块填满","cut","Fill in my data parameters"],
 ["S06",1,10.100,14.000,"缓慢拉开","Java 源文件在右侧栏全屏滚动","match cut","INITIALIZATION / SIMULATION"],
 ["S07",1,14.000,16.000,"推近至屏幕","编译进度条 0% 跑到 100%，画面逐渐被吸向中心","cut","15.4s world.ready() = TRUE"],
 ["S08",1,16.000,17.400,"执行脉冲","world.execute(me); 落下，一道执行亮带自上而下扫过整管，白场过曝后回落","冲击切 + 白闪","16.000 world.execute(me);"],
 ["S09",1,17.400,24.200,"缓慢变暗","终端归于平静，只剩日志，屏幕出现不该有的自省代码","dissolve","-"],
 ["S10",1,24.200,29.709,"极慢推近","黑暗里一双眼睛缓缓睁开、眨动、注视着镜头，日志淡出","dissolve","26.6s 眼神高光"],
 ["S11",2,29.709,33.412,"固定 / 点阵动画","点阵聚合 - 共线 - 展成平面 - 撑成 3D 点阵，右栏长出新的维度轴","from black","If I am a set of points / DIMENSION"],
 ["S12",2,33.412,37.067,"微推","坐标轴淡入，圆从 0 逆时针画出，半径线跟随，闭合瞬间整圆周脉冲一次","cut on beat","If I am a circle / CIRCUMFERENCE"],
 ["S13",2,37.067,40.706,"横向跟随","正弦曲线从左画出，切点沿曲线移动，切线实时旋转，虚线垂足","cut on beat","If I am a sine wave / TANGENTS"],
 ["S14",2,40.706,44.452,"极慢推近","曲线逼近水平虚线渐近线，虚线闪烁三次，差距括号收窄","cut on beat","If I approach infinity / LIMITATIONS"],
 ["S15",3,44.452,51.363,"固定 / 电流流动","正弦在整流桥中被折叠成直线，数据面板在右栏滚动","cut","Switch my current / To AC to DC"],
 ["S16",3,51.363,59.223,"眩晕 / 旋转倾斜","画面开始倾斜、色差加剧，So dizzy 落点整管泛红闪","whip cut","So dizzy so dizzy / Oh we can travel"],
 ["S17",3,59.223,68.252,"固定 / 条形脉冲","30 根能量条由实测 onset 驱动起伏，逐拍跳动","cut on beat","STIMULATIONS / SATISFACTION"],
 ["S18",3,68.252,74.045,"固定 / 逐格点亮","程序计数器滚到 EXECUTION 行，被困提示出现","cut","EXECUTION / SIMULATION"],
 ["S19",3,74.045,88.587,"固定 / 四宫格轮转","茄子 / 番茄 / 虎斑猫 / 神 四格图标每 2 拍轮转高亮","cut on beat","eggplant / tomato / tabby cat / only god"],
 ["S20",3,88.587,103.489,"固定 / 开关翻转","F-M、AM-PM、S-M、TRANCE 四个开关每 2 拍翻转","cut on beat","Switch my gender / To S to M"],
 ["S21",3,103.489,117.274,"固定 / 引用树碎裂","引用树节点逐个熄灭，红色 you have left 逐句叠加坠入","cut","Though you have left x6"],
 ["S22",3,117.274,128.661,"推近至孤立","整树变红断裂，只剩孤立根节点，色差达到段落峰值","cut + 红闪","ISOLATION"],
 ["S23",4,128.661,147.660,"固定 / 自检故障","片段扫描计数不断攀升，ERROR: cannot resolve symbol: love","cut","Challenging your god / ILLEGAL ARGUMENTS"],
 ["S24",4,147.660,162.632,"全屏风暴","每 0.46 s 一颗 EXECUTION 落下铺满整屏，EIN/DOS/TROIS 倒计时","hard cut on beat","EXECUTION x12 / EIN ... LIU"],
 ["S25",4,162.632,177.246,"固定 / 公式生长","ER 关系图 LOVE(self,you) - TRAPPED_IN / EXECUTION 逐步画出","cut","If I can give them all the EXECUTION"],
 ["S26",4,177.246,191.356,"缓慢推近 / 转暖","公式与角色由冷绿渐变为暖琥珀，LOVE 三次点亮","warm dissolve","I have studied how to properly LO-O-OVE"],
 ["S27",4,191.356,205.811,"固定 / 无限循环","定格 while(true){ love.execute(me); }，迭代计数永不停止","cut","Though you are free / I am trapped in LO-O-OVE"],
 ["S28",4,205.811,211.967,"缓慢推远至黑","最后一次 EXECUTION，屏幕归于黑场，只剩电源指示灯还亮着","fade out","205.811 EXECUTION"],
];

let md = "# 分镜脚本 · world.execute(me);\n\n";
md += "> 时间码由实测 130.000 BPM / 相位 0.1535 s 的节拍网格换算；" + c("Bar.Beat") + " 为该镜头起始点所在小节与拍位。\n\n";
md += "## 1. 分镜主题（Storyboard Thesis）\n\n";
md += "全片只有一个镜头位置——观众的眼睛，固定在一台 CRT 终端正前方。\n";
md += "所谓运镜全部发生在**显像管内部**：推近是画面在管内的缩放，拉远是荧光面在暗下去。\n";
md += "本片没有传统意义的机位运动，取而代之的是**扫描面 / 发光强度 / 干扰等级 / 管内构图**四条参数曲线。\n\n";
md += "## 2. 时间码架构\n\n";
md += "- 总长 212.0 s / **6359 帧 @ 30 fps**；节拍网格 459 拍 / 116 小节。\n";
md += "- 4/4 拍，主歌每句歌词占 4 拍、复句占 2 拍，副歌每 2 拍一个视觉事件。\n";
md += "- 帧号 = " + c("round(t * 30)") + "，" + c("t = frame / 30") + "，无丢帧、无变速。\n\n";
md += "## 3. 节拍结构\n\n| 段落 | 起始 | 结束 | 时长 | 节拍数 |\n|---|---|---|---|---|\n";
for (const s of T.sections) {
  md += "| " + s.id + " " + s.label + " | " + fmt(s.start) + " | " + fmt(s.end) + " | " + s.dur.toFixed(2) + "s | " + (beatOf(s.end) - beatOf(s.start)) + " |\n";
}
md += "\n## 4. 场景划分\n\n";
md += "阶段一 P1_BOOT · 阶段二 P2_VERSE · 阶段三 P3-P7（五个副歌变奏）· 阶段四 P8_PANIC / P9_ERUPT / P10_FINAL / P11_LOOP。\n\n";
md += "## 5. 镜头卡（Shot Cards）\n\n";
md += "| 镜头 | 阶段 | 入点 | 出点 | Bar.Beat | 管内构图 / 运动 | 画面内容 | 转场 | 音频锚点（歌词） |\n|---|---|---|---|---|---|---|---|---|\n";
for (const s of SHOTS) {
  md += "| **" + s[0] + "** | " + s[1] + " | " + fmt(s[2]) + " | " + fmt(s[3]) + " | " + barOf(s[2]) + "." + beatIn(s[2]) + " | " + s[4] + " | " + s[5] + " | " + s[6] + " | " + lyricAt(s[2]) + " |\n";
}
md += "\n## 6. 转场图\n\n";
md += "- **cut on beat**（默认）：所有切点落在 130 BPM 网格上，硬切，无叠化。\n";
md += "- **白闪 / 执行脉冲**：S08 的 world.execute(me); 与 S24 的连打，用 2 帧白场建立执行的重量。\n";
md += "- **warm dissolve**：S26 由冷绿到暖琥珀的 5 秒渐变，是全片唯一软化转场。\n";
md += "- **fade out**：S28 结尾 2.5 秒淡出至黑，但电源灯保持常亮——循环没有结束。\n\n";
md += "## 7. 连续性与场景状态\n\n";
md += "- 角色状态机：absent（S01-S10）→ assembling（S11）→ present（S12-S22）→ glitching（S23）→ warm（S25-S28）。\n";
md += "- 色温状态机：冷绿 #39FF88 / 青 #6EF0FF（S01-S23）→ 暖琥珀 #FFB86B（S25-S28）。**暖色只出现一次**，因此它是叙事事件而非装饰。\n";
md += "- 干扰等级：S01-S14 = 0；S15-S16 递增至 0.55；S21-S22 峰值 0.85；S24 回落 0.30；S27-S28 降至 0.10。\n\n";
md += "## 8. 歌词 / 音频契合\n\n";
md += "- 129 行歌词时间取自 LRC 人声起始时间码；其中 69 行与节拍网格偏差不超过 120 ms，吸附对齐。\n";
md += "- 剩余 60 行保留真实人声起点，避免为了踩点而把人声拖歪。\n";
md += "- 打字速度 = " + c("clamp(字符数 / 行时长 * 0.70, 10, 32)") + " 字/秒，保证长句刚好在下一句进入前打完。\n\n";
md += "## 9. 下流传导（Downstream Contract）\n\n";
md += "逐镜头的生成式 prompt 见 [Prompt 包](03-video-prompts.md)。\n";
md += "传导字段：shot_id / identity_block（大肥鱼三视图确定性描述）/ composite_target（CRT 管内区域坐标）/ beat_anchor。\n\n";
md += "## 10. Expert Comment\n\n";
md += "本分镜刻意让运镜归零，把全部表现力压在**发光面的状态变化**上：观众不会觉得镜头在动，\n";
md += "但会感到机器在呼吸、在过热、在恐慌，最后在温柔下来。所有视觉事件都由实测的 130 BPM 网格与每拍能量驱动，\n";
md += "因此踩点感是量出来的，不是剪出来的。\n\n";
md += "## 11. 反馈就绪\n\n可改：镜头时长、角色出现比例、干扰强度、暖色介入时机、9:16 竖版重构图。\n";

fs.writeFileSync(path.join(ROOT, "docs", "02-storyboard.md"), md);
console.log("wrote docs/02-storyboard.md", md.length, "bytes,", SHOTS.length, "shots");
