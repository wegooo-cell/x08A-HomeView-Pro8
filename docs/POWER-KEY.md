# 电源键与双桌面切换

Windows / Mac 安装器默认开启「配置背部电源键」，与「将 HomeView 设为默认桌面」配合使用。只需已允许 USB 调试，不要求先手动修改 POWER→HOME 映射。

## 安装器自动完成的步骤

1. 检查 X08A / Pro8、Android 9 和唯一的 `mtk-pmic-keys` 输入设备（厂商与产品标识均为 1）。不改其他键盘或触屏。
2. 保存原物理键盘布局选择到电脑的 `HomeView/power-key-backups`，进度中显示恢复文件位置。
3. 使用 ADB shell 已有的 `SET_KEYBOARD_LAYOUT` 权限，通过 Android InputManager 为该设备选用 HomeView 的布局覆盖：仅将扫描码 116 映射为 HOME。检测系统是否实际加载覆盖；失败会显示部分完成。
4. 启用双击熄屏，并在需要时打开 Pro8 的**系统锁屏授权窗口**。用户确认后生效；拒绝或暂未确认时，单击切换仍可用，双击熄屏显示待授权。

安装器不取得 root、不设置 Device Owner，不授予 HomeView 全局安全设置权限，也不写 `/system` 或 `/data/system` 按键文件。已有固件映射保留，HomeView 只添加可移除的应用布局覆盖。普通锁屏管理权限仅声明 `force-lock`，可在系统设置中撤销。

## 使用方式

- 正在 HomeView：单击背部按键返回 Pro8 原生桌面。
- 正在原生桌面或其他应用：单击返回 HomeView。
- 亮屏时快速双击（60–420 毫秒）：在锁屏权限已确认时熄屏。
- 刚亮屏的 650 毫秒内不触发反向切换；连续切换有 350 毫秒保护。唤醒用的第一次按键不会计入双击。
- 程序内部「返回 HomeView」不会触发切回原生桌面。

覆盖按键为 HOME 后，不再承诺固件原 POWER 键的长按菜单；长按行为由固件的 HOME 策略决定。设备唤醒与实体键效果应在目标固件实测。

授权未完成时，重新运行安装器再次打开系统授权窗口；安装器会处理 Pro8 透明手势浮层遮挡。也可从 HomeView「连接设置 → 启用双击熄屏」打开，但按钮被遮挡时需连接安装器。升级时已授权的设备无需重复确认。

取消安装器的按键复选框会**保留当前按键设置**，不主动撤销过去的布局或授权。不选择默认桌面时，安装器不配置电源键。只安装 APK 不会自动选用系统按键布局，需使用安装器或 CLI 部署。

## 恢复布局

在卸载 HomeView 前，使用进度中显示的恢复文件，连接原设备执行：

```sh
python deploy.py --serial YOUR_SERIAL --restore-power-key /path/to/pro8-xxx.json
python deploy.py --serial YOUR_SERIAL --restore-power-key /path/to/pro8-xxx.json --apply
```

恢复会检查设备与布局记录；若当前布局已被其他软件改动则停止。仅移除 HomeView 的覆盖、恢复原选择，不删除照片、账号、输入法或固件已有映射。原固件本来已做 POWER→HOME 映射的，恢复后仍是固件原来的行为。

实现：`installer/power_key.py`、`PowerKeyShell.java`、`PowerKeySetupActivity.java`、`HomeKeyController.java` 与 `HomeActivity.java`。采用 Android 9 的物理键盘布局接口，其他型号或缺少对应 ADB 权限的固件会明确报告不支持。

授权按钮被 Pro8 透明手势浮层遮挡时，安装器仅在授权期间临时隐藏 `com.android.systemui` 的 `SYSTEM_ALERT_WINDOW` 浮层；先记录原模式，结束立即恢复，并在设备端设置 150 秒恢复保护，电脑退出或 USB 断开也能恢复。不改变 SystemUI 的启用状态，不代替用户确认锁屏授权。
