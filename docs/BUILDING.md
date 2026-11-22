# 从源码构建

## 电脑端安装器

需要 Python 3.12。GUI 和 CLI 共用 `installer/core.py`，不会携带维护者的 ADB 授权、设备配置或账号。

```sh
python -m pip install -r requirements-installer.txt
python -m unittest discover -s tests -v
python tools/build_desktop.py
```

在 Windows 上生成 Windows exe，在 Apple Silicon / Intel Mac 上分别生成 arm64 / x64 app。GitHub Actions 的 `Desktop installers` 工作流执行相同检查，运行打包程序的 `--self-test-result` 入口后才上传产物。macOS app 使用本机构建签名，没有 Apple Developer ID 公证；Windows exe 没有商业代码签名。

## Android APK

需要 JDK 17、Android SDK Platform 28、Build Tools 35.0.0。设置 `JAVA_HOME`、`ANDROID_HOME`，然后：

```sh
python tools/build_android.py --unsigned
```

脚本从 `dependencies.json` 指定位置获取 ZXing，并验证 SHA256。编译结果位于 `dist/`。开发时可以用自己的外部 keystore 签名，不能覆盖安装官方发布签名的应用：

```sh
# HOMEVIEW_KEY_PASSWORD 通过本机环境提供；不要写进源码、命令历史或 GitHub。
python tools/build_android.py --keystore /path/outside/repository/homeview.jks
```

旧客户端兼容入口独立构建，使用同一个外部签名密钥：

```sh
python tools/build_compat.py --keystore /path/outside/repository/homeview.jks
```

公开包名为 `io.github.wegooo_cell.homeview`。个人测试包和旧朋友分享包可能使用不同包名与签名，安装器不自动读取或迁移其私有数据。两个 HomeView 版本不能同时运行本地服务；测试时先退出另一个版本。

## AirPlay 原生库的对应源码

`android-launcher/lib/armeabi-v7a` 中的原生库来自 Android AirPlay Server v0.0.36 的未修改公开发行包，并非本项目宣称自行重新编译的二进制。确切提交、原始 APK 校验值和库校验值分别记录在 `android-launcher/third_party/AirPlay-SOURCE.json`、`third_party/native-libraries.json`。

每个 Release 同时提供 `HomeView-corresponding-source.zip`：包含本项目源码、固定版本依赖源码归档和构建说明。无须依赖源码网站继续在线。根目录 `third_party/sources.lock.json` 记录归档的 URL、版本和 SHA256；源仓库还保留原生库上游的完整构建项目 `third_party/airplay`。

将 Release 的对应源码包解压后，进入其中的 `HomeView`：

```sh
python tools/fetch_sources.py --archives ../dependency-sources --offline --materialize /tmp/homeview-native-source
```

源码仓库用户也可在线获取同一组固定归档：

```sh
python tools/fetch_sources.py --materialize /tmp/homeview-native-source
```

在 Linux 上准备 JDK 21、Android SDK 37、NDK 27.0.12077973、CMake、GNU make、Perl、Python、patch，按上游 `airplay/README.md` 和 Gradle 配置执行 `./gradlew assembleDebug`。脚本会还原 UxPlay、FFmpeg、libplist、openssl-cmake 的固定源码，并为上游 UxPlay 补丁步骤建立局部 Git 工作目录。OpenSSL 3.4.4 与 Oboe 1.9.3 的源码也随归档提供；上游正常 Gradle 构建仍会从公开依赖站获取构建工具与 Maven/NDK 依赖。源码归档支持审阅与重建，不声称整个 Android 工具链完全离线或构建结果逐字节一致。

重建后，从对应 ABI 的构建目录复制 `libairplay_native.so`、`libcrypto.so`、`liboboe.so`、`libc++_shared.so` 到 HomeView 的库目录，再构建 APK。Android NDK 的 libc++ 为工具链运行库，适用 Apache-2.0 WITH LLVM-exception，其许可证随 NDK 提供。

## 字体、图标与音效

- 字体：`python tools/generate_fonts.py`，需要 `fonttools[woff]`。固定 Adobe 字体来源及校验值见生成器。修改后的字体已改名为 HomeView Sans，保留 OFL 声明。
- 图标和场景：源码树提供可再分发的默认素材，SVG 与各资源许可见 `ASSETS.json`。构建器支持 `--appearance-archive /path/outside/repository/appearance.zip`，仅覆盖 `frame/` 与 `android-launcher/res/` 下的图片、字体和 SVG；代码从当前源码构建，资源权利需单独确认。此可选归档不存入 Git，默认源码构建使用仓库素材。
- 闹钟：`python tools/generate_alarm.py`，需要 NumPy；音效由正弦波合成，无外部录音采样。
- 默认壁纸：仅 `WALLPAPER.json` 指定的一张图片。用户导入的图片、截图和配置不会进入构建过程。
