# 让 AI 或命令行部署

AI 需要能够访问本地终端、USB 设备和网络。普通在线聊天窗口不能直接操作你的 USB 设备；此时使用桌面安装器。

## 同一套部署引擎

使用 Python 3.12，无额外 Python 运行依赖。先阅读 `AGENTS.md`；`installer/core.py` 同时被 GUI 与 CLI 调用。

```sh
python deploy.py --list-devices
python deploy.py --config config.example.json
```

第二条命令只显示待应用配置，不安装。根据用户选择另存 `config.json`，不要改写公开示例，也不要提交该本地配置。

```json
{
  "schema": 1,
  "weather": {
    "name": "北京",
    "latitude": 39.9075,
    "longitude": 116.39723,
    "timezone": "Asia/Shanghai",
    "country": "中国",
    "admin1": "北京"
  },
  "keyboard": "preserve",
  "family": {
    "provider": "ha",
    "ha_url": "http://homeassistant.local:8123",
    "name": "我的家"
  },
  "idle": {"mode": "photos", "minutes": 3},
  "set_home": true
}
```

天气可设为 `null`；家庭 `provider` 可为 `preserve`、`mijia`、`ha`；输入法可为 `preserve`、`fcitx`；`idle` 可为 `null`，或只提供要修改的 `mode` / `minutes`。待机 mode 为 `photos`（待机表盘）、`dim`、`off`。未指定的细项沿用设备原设置，不清理其他 localStorage 内容。

确认设备和配置后执行：

```sh
python deploy.py --config config.json --serial YOUR_DEVICE_SERIAL --apply
```

单台已授权设备可以省略 `--serial`。多台必须明确指定。`--apply` 才真正安装。

## 图片导入

`--import` 可以重复；`--wallpaper` 会同时导入并设为桌面。路径应是用户明确选定的文件，不要扫描用户电脑寻找素材。

```sh
python deploy.py --config config.json --import "/path/photo.jpg" --wallpaper "/path/wallpaper.png"
python deploy.py --config config.json --import "/path/photo.jpg" --wallpaper "/path/wallpaper.png" --apply
```

图片上限与 GUI 相同。仅通过 USB 写入相册目录；不上传 GitHub，不修改电脑原图。

## 不应自动执行的操作

不读取账号文件、不索取音乐/哔哩哔哩/米家/HA/iCloud 密码或令牌，不卸载、不清数据、不降级、不禁用输入法，不修改 root、Device Owner、无线调试或全局安全设置。签名冲突时先说明原因，保留现有数据。

安装器自己的包名、版本、SHA256 和证书来自 `release.json`。从第三方复制 APK 后不得随意修改清单绕过校验。
