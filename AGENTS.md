# x08A HomeView Pro8

本仓库提供 HomeView 源码、Mac / Windows 图形安装器和同一套命令行部署引擎。

- 部署前确认小爱触屏音箱Pro8 已刷入测试版系统并获取 ADB 权限。前置教程链接见 README.md；HomeView 部署从已有 ADB 权限开始，不执行刷机或权限获取步骤。
- 用户要求部署时，先阅读 README.md 和 config.example.json；只连接用户选定且允许 USB 调试的 Pro8。多台设备要求指定序列号。
- 可运行 `python3 deploy.py --gui` 打开电脑端配置向导；AI 部署使用配置文件，先省略 `--apply` 检查，再执行 `python3 deploy.py --config config.json --apply`。
- 默认保留系统输入法；只有用户明确选择小企鹅才启用并选择它，不禁用任何输入法。
- 仅接受天气城市、输入法、家庭来源与名称、HA 地址、默认桌面、待机方式与等待时间，电源键切换与熄屏选项，以及用户选定的壁纸和照片；电脑端另有默认开启的两组件停用与后台优化，范围见 docs/OPTIMIZATION.md。不要把音乐、哔哩哔哩、HA 或 iCloud 凭据填入配置文件。
- 导入图片使用 `--import /path/photo.png`，可重复；`--wallpaper /path/photo.png` 同时导入并设为桌面。仅传入用户选定文件，不扫描电脑其他目录。
- 覆盖安装保留本机账号、照片与配置。不卸载、不清数据、不降级；签名冲突或同版本文件不同立即停止。
- 目标为 X08A / Pro8、Android 9 / ARMv7 / 1280×800。JavaScript 保持 ES5。使用标准 ADB，不新增 root、Device Owner、无线调试或全局安全设置写权限。
- 安装器只通过受系统权限保护的配置入口写入上述非敏感设置；不读取应用私有账号目录。
- 用户登录在设备上完成；公开构建和源代码中不包含维护者的账号、历史、缓存、设备备份或签名私钥。
- 公开包仅包含 WALLPAPER.json 指定的一张默认壁纸；同图的模糊纹理用于界面，不作为第二张可选壁纸。已有用户相册不清理、不覆盖、不在升级时重建。
- 修改后执行 `python3 -m unittest discover -s tests`；涉及 Android 时按 docs/BUILDING.md 构建。区分自动化检查、模拟设备和真实硬件结果。

- 系统优化只允许 installer/optimization.py 的两个固定目标；先存恢复记录，再执行并验证。保护桌面、米家和全部输入法，不推广为全局后台或卸载清单。
- 保留 docs/previews 现有示意图。独立外观资源仅用于维护者授权的发行构建，不提交外部资源归档、私有字体/图像源、个人截图或配置。
- 表盘与家庭控制改动保持已保存用户选择；两处控制位按实际设备类型渲染，不假定必须灯与空调各一个。

- 电源键只通过已有 ADB shell 的 SET_KEYBOARD_LAYOUT 权限选用 HomeView PMIC 布局覆盖；不得写系统按键文件。修改前保存恢复记录，验证覆盖加载。锁屏授权必须由用户在设备系统窗口确认，不自动点击、不强制激活。

授权按钮被 Pro8 透明手势浮层遮挡时，安装器仅在授权期间临时隐藏 `com.android.systemui` 的 `SYSTEM_ALERT_WINDOW` 浮层；先记录原模式，结束立即恢复，并在设备端设置 150 秒恢复保护，电脑退出或 USB 断开也能恢复。不改变 SystemUI 的启用状态，不代替用户确认锁屏授权。
