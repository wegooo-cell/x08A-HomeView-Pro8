#!/usr/bin/env python3
"""AI / command-line deployment uses the same engine as the desktop wizard."""
import argparse,json,sys
from pathlib import Path
from installer.config import normalize
from installer.core import deploy,find_adb,devices,release_manifest

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--config',type=Path,default=Path('config.example.json'));p.add_argument('--serial');p.add_argument('--apply',action='store_true');p.add_argument('--list-devices',action='store_true');p.add_argument('--gui',action='store_true');p.add_argument('--import',dest='images',action='append',type=Path,default=[]);p.add_argument('--wallpaper',type=Path);p.add_argument('--restore-optimizations',type=Path);a=p.parse_args()
 if a.gui:
  from installer.webapp import serve
  serve();return
 if a.restore_optimizations:
  from installer.core import Device
  from installer.optimization import restore
  if not a.apply:print(json.dumps({'restore_file':str(a.restore_optimizations),'apply':False}));return
  adb=find_adb(True);online=[d for d in devices(adb) if d['state']=='device'];serial=a.serial or (online[0]['serial'] if len(online)==1 else None)
  if not serial:raise ValueError('请选择要恢复的设备')
  device=Device(adb,serial);device.check();print(json.dumps(restore(device,a.restore_optimizations),ensure_ascii=False));return
 if a.list_devices:print(json.dumps(devices(find_adb(True)),ensure_ascii=False,indent=2));return
 config=normalize(json.loads(a.config.read_text(encoding='utf-8')))
 if a.wallpaper and a.wallpaper not in a.images:a.images.append(a.wallpaper)
 from installer.media import read_image
 preview=[{'name':x.name,**read_image(x)[1]} for x in a.images]
 if not a.apply:print(json.dumps({'config':config,'images':preview,'wallpaper':a.wallpaper.name if a.wallpaper else None,'release':release_manifest().get('version'),'apply':False},ensure_ascii=False,indent=2));return
 print(json.dumps(deploy(config,a.serial,media_paths=a.images,wallpaper_path=a.wallpaper),ensure_ascii=False,indent=2))
if __name__=='__main__':
 try:main()
 except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
