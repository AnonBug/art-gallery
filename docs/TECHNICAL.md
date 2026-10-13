# 漫览画廊技术文档

本文面向本地运行、维护馆藏和部署画廊的开发者。画廊介绍与参观方式见 [README](../README.md)。

## 技术栈与目录

| 部分 | 实现 |
| --- | --- |
| 3D 展厅、模型与漫游 | Three.js |
| 绘画高清细看 | OpenSeadragon + 本地 DZI 瓦片 |
| 应用与构建 | TypeScript、Vite、npm |
| 图像处理 | sharp |
| 线上托管 | GitHub Pages + GitHub Actions |

运行所需的画作图像、瓦片、雕塑模型和 Draco 解码器均位于 `public/assets/`，随静态站点发布；外部馆藏与许可页面作为来源链接。依赖版本以 [package.json](../package.json) 和锁文件为准。

## 当前展厅与启动流程

五厅依次连通：斯奈德斯—伦勃朗—达芬奇—米开朗基罗—奈费尔提蒂。空间数据由 `src/museum-layout.mjs` 统一维护，建筑、门洞、行走区域和路线规划共用同一套坐标。

- 各厅层高8米，居中门洞净宽3.6米、高4.8米，墙厚0.2米。进入和「回到中央」均位于当前房间中央；长凳偏置到侧后方。
- 两座雕塑底座顶部均为1.52米，模型按包围盒缩放至2.05米高，底部落在展台上。数字展示比例不等同于原作尺寸。底座参与行走边界，自动路线绕开展台。
- 初次加载直接显示伦勃朗展厅。展厅切换面板默认隐藏，不生成初始空间预览；打开时选择当前房间，按需生成实际场景截图并缓存。
- 桌面鼠标锁定由用户点击触发。锁定失败时回退到拖动看向，触屏使用摇杆和拖动。
- 画作本体采用两步点击：先驻足，再打开高清；绘画展签与雕塑展签直接打开介绍，雕塑本体直接打开3D细看。
- 介绍层只暂停背景，不能给包含介绍的 `#app` 整体设置 `inert`。关闭时恢复此前的查看器或展厅；点击关闭与Esc的鼠标恢复行为分别处理。

## 雕塑资源与查看器

| 模型 | 体积 | 来源与许可 |
| --- | --- | --- |
| 米开朗基罗《蹲伏的男孩》 | 6,023,996字节 | [Scan-the-World / Zenodo](https://zenodo.org/records/21353106)，[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) |
| 《奈费尔提蒂王后半身像》 | 12,178,252字节 | [柏林国立博物馆 / TrigonArt 2008年扫描](https://www.smb.museum/en/museums-institutions/aegyptisches-museum-und-papyrussammlung/collection-research/bust-of-nefertiti/the-replica/)，[CC BY-NC-SA 3.0 DE](https://creativecommons.org/licenses/by-nc-sa/3.0/de/) |

奈费尔提蒂使用已压缩的GLB，保留200万个三角面、4096×4096彩色贴图、Draco压缩和原彩绘材质。《蹲伏的男孩》源模型无材质，应用统一暖白石材。来源、署名、校验值与转换说明分别保存在 [男孩模型元数据](../public/assets/sculptures/crouching-boy/metadata.json) 和 [王后模型元数据](../public/assets/sculptures/nefertiti/metadata.json)。

- [sculptures.json](../src/data/sculptures.json)：两件雕塑的展厅、模型、封面、介绍、署名与许可。
- [sculpture-model.ts](../src/sculpture-model.ts)：按作品ID独立缓存和重试，展厅与细看共享解码后的几何与材质。Draco解码器从本站加载。
- [sculpture-pedestal.ts](../src/sculpture-pedestal.ts)：内收石质台身、分层台脚、铜边、接地阴影和可点击展签；石材纹理本地生成。
- [sculpture-viewer.ts](../src/sculpture-viewer.ts)：独立3D细看、旋转、缩放、平移、重置、自动旋转与参考网格。关闭时销毁控件、渲染器和WebGL上下文；异步会话标记阻止过期结果覆盖新一轮查看。
- [hall-browser.ts](../src/hall-browser.ts)：按需打开的展厅切换面板。预览同时加载门洞视野内可见的相邻雕塑，避免出现空展台。

## 安装与启动

需要 Node.js 22.12+ 和 npm；GitHub Actions 使用 Node.js 24。

```bash
cd art-gallery
npm ci
npm run dev
```

开发服务器默认监听 **0.0.0.0:5173**。

- 本机：http://localhost:5173/
- 局域网：使用电脑当前的局域网 IP，例如 `http://<电脑IP>:5173/`。

手机与电脑连接同一局域网，访问电脑的 Wi-Fi IP；IP 变化后需换成新地址。公共 Wi-Fi 可能启用设备隔离，因此手机访问失败不一定是应用故障；也可检查本机防火墙是否允许此端口。

## GitHub 与在线访问

- 仓库：https://github.com/AnonBug/art-gallery
- 在线画廊：https://anonbug.github.io/art-gallery/
- 部署记录：https://github.com/AnonBug/art-gallery/actions/workflows/deploy.yml

`main` 分支每次推送会自动安装依赖、运行测试和资源检查，再通过 GitHub Actions 构建并部署至 GitHub Pages。Pages 发布源为 GitHub Actions，工作流位于 `.github/workflows/deploy.yml`。图片、高清瓦片与运行依赖随站点一起发布，无需运行中的本地电脑。

本地开发默认从 `/` 加载；Pages 构建根据部署地址添加子目录前缀。作品配置仍使用 `/assets/...`，应用启动时统一解析路径。可在本地检查相同的构建：

```bash
npm run build -- --base=/art-gallery/
npm run preview -- --base=/art-gallery/
# 打开 http://localhost:4173/art-gallery/
```

`originals/`、依赖目录、构建产物、环境变量文件不上传仓库；应用运行所需的展示图与瓦片均位于受版本控制的 `public/`。本地原始画源备份需自行保留。未来加入更大资源时需关注GitHub仓库与Pages体积限制。

```bash
npm run build              # TypeScript 检查 + Vite 生产构建，输出 dist/
npm run preview            # 在 0.0.0.0:4173 预览生产版本
npm test                   # 审视距离、转向、摇杆、两步交互、图片处理回归测试
npm run assets:check       # 文件体积、像素尺寸、完整 DZI 层级和每张必需瓦片
npm run assets:check -- --http http://localhost:5173  # 同时逐一 HEAD 检查所有展出资源
```

如本机安装了全局 libvips，sharp 安装可能尝试本地编译。可用下面的命令强制使用 npm 预编译依赖，之后仍照常 npm ci：

```bash
SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm ci
```

## 交互行为

- 电脑：首次点击「开始漫游」启用原生鼠标锁定并隐藏箭头；上下左右移动鼠标看向，WASD / 方向键移动。中心准星既是视线中心，也是点击位置。按 Esc 释放鼠标并暂停漫游，点击展厅继续。打开介绍或高清也会释放鼠标；点击关闭返回展厅时直接恢复漫游，按 Esc 关闭则保持暂停。手机保留摇杆、拖动和直接点按。
- 手机：左下圆形摇杆移动，偏移大小决定速度；其它区域单指拖动转向。向右拖时视线向左，向下拖时视线向上。
- 点击画面或画框：电脑瞄准中心准星点击，手机直接点按；第一次走到作品前，到达后再次点同一幅，打开高清看画。进入/恢复鼠标锁定的首次点击不会触发作品。
- 移动速度：键盘/摇杆步行维持 2.65 米/秒；点击地板使用 6 米/秒；点击画作靠近使用 12 米/秒，同厅和跨厅统一按实际路线长度计算过渡时长，并保留平滑起步与减速。近距离保留很短的动画下限，避免视角突跳。
- 点击地板：电脑用中心准星看向地板，出现柔和光圈时点击，平滑走到该位置；途中可继续环顾或点击新的位置。手机可直接点按地板。WASD / 方向键、摇杆、触屏拖动、Esc、失焦或打开面板会停止自动行走；光圈仅显示在边界内可选的空地，不出现在长凳上或下方。
- 到达画作后，鼠标转向或触屏原地环顾保持驻足审视；再次瞄准同一幅画点击可直接打开高清。WASD / 方向键、摇杆或点击地板离开驻足位置时回到自由漫游；Esc暂停、失焦或打开面板保留已完成的审视状态。走近动画期间桌面鼠标看向暂时暂停，触屏拖动或 Esc 可停止到达动画。重复选择会从当前相机姿态重新平滑过渡。
- 画框右下的米白展签打开中文介绍。高清层也提供「作品介绍」，始终在画布上方，可滚动和关闭。
- 高清层：滚轮 / 双指缩放、拖动平移；提供上一幅、下一幅、缩放与全画按钮。
- 进入高清细看即显示左下角画幅位置小地图，默认细看与原画都可用；点击或拖动小地图可定位当前画幅区域。
- 仅在所得最高分辨率的像素数高于默认细看版本时显示「查看原画」。它指数字图像，不指实体原作。
- 展厅默认只显示品牌和右上操作按钮；顶部馆藏信息、左侧展览介绍和底部作品导航已移除。驻足操作面板按需出现，手机摇杆位于左下角。
- 右上「诊断」可开关版本、相机与高清状态，包括作品、图源、容器尺寸、缩放、待完成瓦片请求和加载/错误事件。

## 资源与高清稳定性

当前展品按1 MB（1,000,000字节）下限筛选，优先采用原始画源大小；旧作品缺少原文件记录时采用现有最高分辨率完整图。逐件撤展依据见`docs/image-size-selection.json`，缩略图和单张瓦片不参与筛选。

所有运行依赖通过 npm 安装，构建后由本地静态服务提供。图像、DZI、瓦片均位于 `public/assets/artworks/`。字体采用操作系统本地中文字体栈（PingFang SC、Microsoft YaHei 等），无远程字体或 CDN 请求。外部来源链接仅在用户主动查看来源时访问。

每幅画具有：

1. `far.webp / medium.webp / near.webp`：长边约 640、1600、3000 像素，不放大较小原图，每个完整文件 ≤ **3,000,000 字节**。展厅按距离、投影尺寸选择级别，替换时释放旧 GPU 纹理。
2. `detail.webp`：默认细看完整源 ≤ **20,000,000 字节**，对应 `detail.dzi` 与 `detail_files/`。20 MB 不指所有瓦片的累计大小。
3. 若原始源分辨率更高：`original.dzi` 与 `original_files/`；否则最高版本直接复用细看 DZI，隐藏切源按钮。

DZI 为每层减半、512 像素瓦片、1 像素重叠的金字塔。浏览器只请求当前视野/级别所需瓦片，没有单张巨图 CSS 放大路径。

OpenSeadragon 强制 Canvas drawer、DPR=1（包含横竖屏变化后），缓存最多100张瓦片、并发4、最大1.5倍原始像素缩放。关闭、重开、换作品和换源都会销毁旧 viewer，清理 DOM、事件、超时和待完成瓦片 XHR。介绍面板可暂时覆盖查看器而无需创建新实例。容器 resize、orientationchange 和后台恢复均触发尺寸/绘制更新。加载超时、DZI/瓦片失败有显式提示和重试。

Three.js 的像素比上限1.6；每幅画只保留当前展示纹理，高清层开启时暂停展厅绘制。中央长凳只装饰，不参与碰撞；墙内保留1.25米活动边距，居中门洞净宽3.6米，按0.28米身体半径留宽。键盘、摇杆通过连续可行走区域约束；地板点击与驻足自动行走跨厅时经过门口，墙体参与射线遮挡。回到中央只重置当前展厅。驻足采用平视，按图像宽高、视场角、屏幕比例和控件占用留白计算距离。

中心瞄准画作或展签时，细金色描边淡入，中心光点展开呼吸提示；移开淡出，Esc或打开面板立即清除。系统减少动态效果设置会关闭动画。提示复用单个无光照网格，无额外灯光或后处理。

实时画作照明共用固定4盏射灯，优先分配给视野内的作品；转向或跨厅不会增删灯光、触发不同灯数的着色器编译。相邻展厅只在门洞进入视野时绘制，门洞内保留双厅。墙面、线脚、灯轨按材质合并；远处画框只画主体，靠近时恢复雕花、珠饰。Esc暂停后的静止画面按需重绘，图片完成或窗口变化仍会更新；高清层和后台停止展厅绘制。性能采样记录见`docs/render-performance.json`。

## 新增画作与生成瓦片

将完整原始文件放在 `originals/`（已忽略于 Git），不要用缩略图冒充原图。先建立作品信息 JSON，例如 `originals/my-painting.json`：

```json
{
  "title": "作品中文名",
  "originalTitle": "Original title",
  "author": "作者",
  "date": "年代待确认",
  "dimensions": "原作尺寸待确认",
  "medium": "材料待确认",
  "collection": "馆藏归属待确认",
  "displayStatus": "当前实际陈列位置待确认",
  "description": "中文简介",
  "looking": "建议观察的细节",
  "source": "https://具体来源文件页",
  "originalUrl": "https://实际取得的源图",
  "credit": "画家 / 数字图像提供者",
  "license": "许可待确认",
  "licenseStatus": "许可待确认"
}
```

执行：

```bash
npm run images -- originals/my-painting.jpg my-painting originals/my-painting.json
npm run artwork:add -- my-painting north 3.5 2.0 2.6
npm run assets:check
npm run build
```

第一条会应用 EXIF 方向，建立临时无损母版，生成多尺寸 WebP、≤20MB 细看源、细看及必要的原画 DZI，输出完整像素/字节/路径清单到作品 `metadata.json`。在 WebP 单边16383像素编码限制内优先维持原始像素（原画 DZI 仍保持完整源分辨率），尝试94/90/86/82质量，仍超限才逐步缩小。原始文件始终保留，重复执行将旧输出移动至 `originals/generated-backups/`，不覆盖或删除用户输入。

第二条将生成清单加入 `src/data/artworks.json`，或更新同 ID 项。参数依次是：作品ID、墙、沿墙位置（米）、展示高度（米）、画心离地高度（米，可省略，默认2.6）。可使用 `north / south / east / west`。沿墙位置以墙中心为零，按各墙自己的局部横轴排列；需预留画框及右下展签位置，避免重叠。

随后可以直接编辑 `src/data/artworks.json` 调整尺寸、墙面、介绍、来源与许可。宽度由实际像素比例自动计算，不拉伸。

对现有本地 DZI 的导入，无需重新生成：复制相应作品目录和清单，将路径设为 `/assets/artworks/<id>/...`，再添加配置即可。只有瓦片而无最高分辨率完整母图时，不能凭默认细看文件重新生成更高细节；需要另行取得完整源图。脚本不自动下载和推断未知许可。

## 架构与主题扩展

- `src/data/artworks.json`：独立作品信息、资源级别与挂画位置。
- `src/data/stories.json`：按作品ID维护背景故事；每项包含`title`、`paragraphs`段落、`sources`（`label`/`url`）与`checkedAt`核查日期。在此增加同ID条目即可显示于展厅和高清层的作品介绍。正文保存在本地，阅读不依赖外部请求；资料链接按需打开。史料事实与观看解读需区分，不替未知人物或创作动机补编故事。
- `src/data/theme.ts`：主题名、艺术家、博物馆、房间尺寸/墙色、初始相机与空间说明。`lighting` 配置环境光、主光、射灯颜色/亮度，以及轨道距墙和距顶距离；每幅作品记录灯具位置与灯束范围，实时照明由固定4盏射灯池分配。换主题时修改此配置并替换作品数据，渲染器不依赖冬宫专属接口。
- `src/gallery.ts`：Three.js 展厅、画框展签、LOD、碰撞边界、驻足动画与指针输入。
- `src/museum-layout.mjs`：五个展厅与居中薄墙门洞的共享尺寸、可行走区域、连续移动边界与门口路径规划。
- `src/render-budget.ts`：门洞视野剔除、静态建筑合批与固定数量画作射灯池；合批保留独立墙面拾取代理及其世界坐标。
- `docs/market-hall-catalog.json`：第二厅8幅作品的策展信息、图源、作者与陈列位置；保留逐件图源、归属与使用条件。
- `scripts/import-market-hall.mjs`：复用研究会话下载目录导入第二厅资源，补充作品从`originals/market-hall/`读取；再次运行只同步已有作品信息，保留已生成图像。
- `src/artwork-label.ts`：象牙色薄卡展签，按作者、渐淡金线、宋体作品名、年代及尺寸排版；长文本自动适配，本地字体就绪后重绘。卡片具有实体薄边、贴墙阴影与受光材质，正面仍是作品介绍的点击目标。
- `src/floor-marker.ts`：中心射线地板瞄准与已选目的地共用的柔和光圈纹理及呼吸动画；自动行走与拾取优先级由 `src/gallery.ts` 管理。
- `src/bench.ts`：深色木框皮革长凳，包含弧面分块坐垫、包边、铜钉、车旋支脚与横撑；本地生成木纹、皮革凹凸和接地阴影，按材质合并几何并实例化铜钉。
- `src/ornate-frame.ts`：胡桃木凹面与旧金雕花框、密纹、叶饰、珠边和角花；本地生成木纹、旧金斑驳、凹凸及粗糙度/金属度贴图，复用材质并用实例化几何绘制浮雕。主题`frame`配置画框宽度比例及上下限，驻足距离和展签位置随框宽调整。
- `src/navigation.mjs`：距离、转向、摇杆约束与两步点击判定。
- `src/pointer-look.mjs`：桌面原生鼠标锁定、相对位移、中心点击通知及 Esc / 失焦 / 面板暂停生命周期；独立事件回归测试不依赖 WebGL。
- `src/viewer.ts`：独立 OpenSeadragon 生命周期、请求取消、诊断与错误重试。
- `src/main.ts / style.css`：HTML 介绍层、驻足操作、摇杆与响应式界面。
- `scripts/`：可重复的图片处理、画作导入和资源验证。

## 来源与已知限制

先检查了 [art-history-museum](https://github.com/justdataplease/art-history-museum) 的 README 和 Gallery 组件，参考漫游/审视/展签思路，代码独立实现。空间参考 [冬宫官方全景 node172](https://pano.hermitagemuseum.org/newpano/en/main/#node172)，补充馆藏信息来自 [Commons 冬宫伦勃朗馆藏类别](https://commons.wikimedia.org/wiki/Category:Paintings_by_Rembrandt_in_the_Hermitage) 及每幅作品文件页。来源清单见 `docs/sources.json`。

- 第一厅15×13.5米、第二厅17.5×15.5米，按现有9幅/8幅作品收紧布画间距；空间、布画和灯光为合理近似，非精确测绘复原。
- 官方全景配置的历史拍摄时间是2011年，不是2026年的陈列清单。馆藏归属与现行254号厅展出明确区分，后者统一待确认。
- 《卸下十字架》的所用 Commons 文件页归属为伦勃朗工作室；界面保留该表述及不同归属的核查说明。
- 大部分图片优先复用用户提供的衍生图/瓦片；原有完整高分辨率母图不在项目内。保存了旧元数据快照，图源文件的密码学对应关系未重新证明。
- 《大卫与约拿单》另取得3344×4000源图，并保留原1920×2297版本于 `originals/generated-backups/`。
- 本次通过桌面浏览器检查了桌面与手机尺寸，**没有真实手机测试，也没有真实双指触摸或 iOS/Safari 测试**。不将尺寸模拟和鼠标指针测试称为手机验证。具体结果见 [基础验证](verification.md)、[文艺复兴展厅验证](renaissance-verification.md)和[奈费尔提蒂展厅验证](nefertiti-verification.md)。
