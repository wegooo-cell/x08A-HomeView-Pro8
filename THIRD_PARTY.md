# 第三方组件与许可

本公开发行版整体提供 GPL-3.0 源码及完整对应源码归档。各独立素材、工具和组件的原许可与声明继续保留；不能把“重写”理解为去掉上游版权声明。

| 组件 | 来源 / 版本 | 许可及记录 |
| --- | --- | --- |
| HomeView 原始代码 | Jesse McConnell 的 HomeView，保留原始版权声明 | `LICENSE-MIT-Upstream` |
| Android AirPlay Server | [jqssun/android-airplay-server](https://github.com/jqssun/android-airplay-server)，v0.0.36，确切提交见锁文件 | GPL-3.0，`third_party/airplay/LICENSE` |
| UxPlay、FFmpeg、libplist、openssl-cmake | 原生构建固定子模块 | 源码内各自 LICENSE / COPYING；归档见 `third_party/sources.lock.json` |
| OpenSSL | 3.4.4 | Apache-2.0；对应源码归档提供 |
| Oboe | 1.9.3 | Apache-2.0；对应源码归档提供 |
| Android NDK libc++ | 上游发行包运行库 | Apache-2.0 WITH LLVM-exception，属于 NDK 工具链 |
| ZXing core | 3.5.3 | Apache-2.0，`android-launcher/third_party/zxing-LICENSE`，校验见 `dependencies.json` |
| Ionicons | 7.4.0 | MIT，各资源目录的 `ionicons-LICENSE.txt` |
| Bootstrap Icons | 天气符号 | MIT，`frame/hv/desktop/assets/bootstrap-icons-LICENSE.txt` |
| D3 array / geo | 1.2.4 / 1.12.1 | BSD-3-Clause，`frame/hv/clock/assets/` 中的许可 |
| World Atlas / Natural Earth | 2.0.2 / geographic data | ISC / public domain，地图资源目录保留声明 |
| node-forge | 1.4.0 | 选择 BSD-3-Clause，`android-launcher/third_party/node-forge/` |
| Simple Icons | 固定来源提交见其声明 | CC0，`android-launcher/third_party/simple-icons/` |
| 源码默认字体 | Source Han Sans，生成与改名见 `tools/generate_fonts.py` | OFL-1.1；`frame/hv/fonts/OFL.txt` |
| Nunito 等独立字体 | 场景目录内各字体与声明 | 保留对应 OFL 声明 |
| 小企鹅输入法 | 官方 0.1.3 ARMv7 APK，按需直接下载 | 上游主许可 LGPL-2.1，各组件保留自身许可；不重新打包、不改签名；来源见 `release.json` |
| PyInstaller | 6.20.0，仅用于电脑端打包 | GPL-2.0-or-later，附带 bootloader 分发例外；[官方许可](https://pyinstaller.org/en/stable/license.html) |
| Python | 电脑端打包的 Python 3.12 运行时 | PSF License；运行时保留其自带声明 |

源码默认图标与几何场景由可编辑 SVG 生成，闹钟来自 `tools/generate_alarm.py` 的合成音。默认壁纸来源与校验值见 `WALLPAPER.json`，只选择这一张。代码许可不授予第三方商标或独立图片、字体的权利；可选外部资源包须按各自许可使用，不包含在开源素材授权中。

## 获取和重建对应源码

每个二进制 Release 均提供 `HomeView-corresponding-source.zip`，其中包含 HomeView 源文件、依赖固定版本源码归档及 `docs/BUILDING.md`。安装器、APK 和源码归档可在同一 Release 页面直接下载。也可按 `tools/fetch_sources.py` 下载并验证完全相同的归档。

本项目不打包无明确许可的 blbl 客户端，不声称兼容第三方应用的图标、品牌名或接口属于本项目。第三方账户与媒体内容不包含在开源软件许可中，用户仍须遵守服务提供方的使用条件。
