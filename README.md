# 漫览画廊

独立、离线资源的浏览器 3D 数字画廊。首展「光与归途」选取冬宫伦勃朗相关馆藏，包含指定的六幅核心作品及六幅补充作品。当前项目目录就是仓库根目录，不另套一个同名子目录；未修改其它项目。

## 安装与启动

需要 Node.js 22.12+（本次使用 24.16）及 npm。

```bash
cd art-gallery
npm ci
npm run dev
```

开发服务器默认监听 **0.0.0.0:5173**。

- 本机：http://localhost:5173/
- 本次检测的 Wi-Fi 局域网：http://192.168.10.224:5173/

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

## 使用

- 电脑：WASD / 方向键移动，按住鼠标拖动画面转向。
- 手机：左下圆形摇杆移动，偏移大小决定速度；其它区域单指拖动转向。向右拖时视线向左，向下拖时视线向上。
- 点击画面或画框：第一次走到作品前；到达后再次点同一幅，打开高清看画。底部作品标签直接驻足。
- 拖动或移动取消自动行走。自动行走期间重复选择会从当前相机姿态重新平滑过渡。
- 画框右下的米白展签打开中文介绍。高清层也提供「作品介绍」，始终在画布上方，可滚动和关闭。
- 高清层：滚轮 / 双指缩放、拖动平移；提供上一幅、下一幅、缩放与全画按钮。
- 进入高清细看即显示左下角画幅位置小地图，默认细看与原画都可用；点击或拖动小地图可定位当前画幅区域。
- 仅在所得最高分辨率的像素数高于默认细看版本时显示「查看原画」。它指数字图像，不指实体原作。
- 页面显示 `v1.0.0 · 20261011`。右上「诊断」可开关相机与高清状态，包括作品、图源、容器尺寸、缩放、待完成瓦片请求和加载/错误事件。

## 资源与高清稳定性

所有运行依赖通过 npm 安装，构建后由本地静态服务提供。图像、DZI、瓦片均位于 `public/assets/artworks/`。字体采用操作系统本地中文字体栈（PingFang SC、Microsoft YaHei 等），无远程字体或 CDN 请求。外部来源链接仅在用户主动查看来源时访问。

每幅画具有：

1. `far.webp / medium.webp / near.webp`：长边约 640、1600、3000 像素，不放大较小原图，每个完整文件 ≤ **3,000,000 字节**。展厅按距离、投影尺寸选择级别，替换时释放旧 GPU 纹理。
2. `detail.webp`：默认细看完整源 ≤ **20,000,000 字节**，对应 `detail.dzi` 与 `detail_files/`。20 MB 不指所有瓦片的累计大小。
3. 若原始源分辨率更高：`original.dzi` 与 `original_files/`；否则最高版本直接复用细看 DZI，隐藏切源按钮。

DZI 为每层减半、512 像素瓦片、1 像素重叠的金字塔。浏览器只请求当前视野/级别所需瓦片，没有单张巨图 CSS 放大路径。

OpenSeadragon 强制 Canvas drawer、DPR=1（包含横竖屏变化后），缓存最多100张瓦片、并发4、最大1.5倍原始像素缩放。关闭、重开、换作品和换源都会销毁旧 viewer，清理 DOM、事件、超时和待完成瓦片 XHR。介绍面板可暂时覆盖查看器而无需创建新实例。容器 resize、orientationchange 和后台恢复均触发尺寸/绘制更新。加载超时、DZI/瓦片失败有显式提示和重试。

Three.js 的像素比上限1.6；每幅画只保留当前展示纹理，高清层开启时暂停展厅绘制。中央长凳只装饰，不参与碰撞；墙内保留1.25米活动边距。驻足采用平视，按图像宽高、视场角、屏幕比例和控件占用留白计算距离。

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
- `src/data/theme.ts`：主题名、艺术家、博物馆、房间尺寸/墙色、初始相机与空间说明。`lighting` 配置环境光、主光、射灯颜色/亮度，以及轨道距墙和距顶距离；每幅作品自动生成对应射灯，灯束按画幅尺寸适配。换主题时修改此配置并替换作品数据，渲染器不依赖冬宫专属接口。
- `src/gallery.ts`：Three.js 展厅、画框展签、LOD、碰撞边界、驻足动画与指针输入。
- `src/ornate-frame.ts`：胡桃木凹面与旧金雕花框、密纹、叶饰、珠边和角花；本地生成木纹、旧金斑驳、凹凸及粗糙度/金属度贴图，复用材质并用实例化几何绘制浮雕。主题`frame`配置画框宽度比例及上下限，驻足距离和展签位置随框宽调整。
- `src/navigation.mjs`：距离、转向、摇杆约束与两步点击判定。
- `src/viewer.ts`：独立 OpenSeadragon 生命周期、请求取消、诊断与错误重试。
- `src/main.ts / style.css`：HTML 介绍层、导航、摇杆与响应式界面。
- `scripts/`：可重复的图片处理、画作导入和资源验证。

## 来源与已知限制

先检查了 [art-history-museum](https://github.com/justdataplease/art-history-museum) 的 README 和 Gallery 组件，参考漫游/审视/展签思路，代码独立实现。空间参考 [冬宫官方全景 node172](https://pano.hermitagemuseum.org/newpano/en/main/#node172)，补充馆藏信息来自 [Commons 冬宫伦勃朗馆藏类别](https://commons.wikimedia.org/wiki/Category:Paintings_by_Rembrandt_in_the_Hermitage) 及每幅作品文件页。来源清单见 `docs/sources.json`。

- 20×17米空间、布画和灯光为合理近似，非精确测绘复原。
- 官方全景配置的历史拍摄时间是2011年，不是2026年的陈列清单。馆藏归属与现行254号厅展出明确区分，后者统一待确认。
- 《卸下十字架》的所用 Commons 文件页归属为伦勃朗工作室；界面保留该表述及不同归属的核查说明。
- 大部分图片优先复用用户提供的衍生图/瓦片；原有完整高分辨率母图不在项目内。保存了旧元数据快照，图源文件的密码学对应关系未重新证明。
- 《大卫与约拿单》另取得3344×4000源图，并保留原1920×2297版本于 `originals/generated-backups/`。
- 本次通过桌面浏览器检查了桌面与手机尺寸，**没有真实手机测试，也没有真实双指触摸或 iOS/Safari 测试**。不将尺寸模拟和鼠标指针测试称为手机验证。具体结果见 `docs/verification.md`。
