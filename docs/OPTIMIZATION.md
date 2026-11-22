# 默认系统优化与恢复

v0.1.1 起，电脑端默认勾选“停用系统组件”和“限制后台”。这两个选项只作用于以下固定组件：

| 组件 | 包名 | 默认操作 |
| --- | --- | --- |
| 系统应用商店 | `com.xiaomi.mico.appstore` | 停用当前用户应用；限制两项后台 AppOps |
| 系统更新组件 | `com.xiaomi.mico.romupdate` | 停用当前用户应用；限制两项后台 AppOps |

使用标准 ADB 的 `pm disable-user --user 0`，保留安装包与数据；后台操作仅为 `RUN_IN_BACKGROUND`、`RUN_ANY_IN_BACKGROUND` 设为 `ignore`，随后停止这两个进程。不会全局限制进程数量，不处理米家、音乐、蓝牙、原生桌面、默认输入法，也不会批量卸载用户安装的应用。对应组件不存在时跳过。

执行前在电脑保存原启用状态与 AppOps 的恢复记录；每步检查系统返回与实际状态。固件不允许这些命令时，记录原因并显示“部分完成”，其余部署步骤继续，不通过 root 绕过。

## 取消与恢复

安装前取消对应复选框即可跳过。不勾选不会撤销以前执行过的优化，恢复以前状态需使用那次部署的恢复记录。

日志显示恢复文件路径，默认目录：

- Mac：`~/Library/Application Support/HomeView/optimization-backups/`
- Windows：`%LOCALAPPDATA%/HomeView/optimization-backups/`

使用源码目录中的 CLI，先预览再恢复；选择原来的同一台设备：

```sh
python deploy.py --restore-optimizations /path/pro8-record.json
python deploy.py --restore-optimizations /path/pro8-record.json --serial YOUR_PRO8_SERIAL --apply
```

恢复记录只接受上述两个固定包、固定操作和匹配的设备。它包含设备标识，应保留在本机，不上传 GitHub。若需要恢复到首次优化前，使用首次部署的恢复记录。
