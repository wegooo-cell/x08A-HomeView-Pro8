# 小企鹅 · Pro8 定制主题

部署程序可选安装 **官方小企鹅输入法 0.1.3 ARMv7**，保持官方签名，配合本目录的原创浅色主题与 Pro8 横屏参数。它不包含个人词库、输入历史或账号，也不禁用系统输入法。

- [官方 APK 下载](https://github.com/fcitx5-android/fcitx5-android/releases/download/0.1.3/org.fcitx.fcitx5.android-0.1.3-0-g048f581c-armeabi-v7a-release.apk)
- [HomeView iOS Light 主题包](https://github.com/wegooo-cell/x08A-HomeView-Pro8/releases/latest/download/HomeView-iOS-Light.zip)
- [横屏参数](pro8-preset.json)

在电脑安装器中选择“小企鹅 · Pro8 定制主题”后，程序会验证、安装官方 APK，传入主题文件，并启用选择小企鹅。已有同名主题保留原文件。**首次仍需在设备的小企鹅设置 → 主题中选择 HomeView iOS Light**；不能通过普通 ADB 静默写入输入法的私有配置。

手动导入时，解压主题包，在小企鹅主题设置中导入其中的 JSON。建议横屏参数：键盘高度 38%、上下边距各 6dp、按键圆角 12、边框开启、描边与涟漪关闭、跟随深色关闭。主题 ZIP 只有主题 JSON；参数是独立参考，未修改官方 APK。

主题代码按仓库 GPL-3.0 发布。小企鹅本体使用上游 LGPL-2.1，各组件保留各自声明。上游源码与确切提交见 `release.json`。
