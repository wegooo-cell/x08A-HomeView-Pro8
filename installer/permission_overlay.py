"""Temporarily hide Pro8 SystemUI overlays while Android asks for lock permission."""
import json,tempfile,time,uuid
from pathlib import Path
from .optimization import op_state,checked,MODES

class PermissionOverlay:
 def __init__(self,device,log=print):self.device=device;self.log=log;self.original=None;self.marker=None
 def __enter__(self):
  d=self.device
  # HomeView hides these overlays while it is foreground. They can reappear
  # as soon as Android's permission page opens, so prepare before launching it.
  mode=op_state(d,'com.android.systemui','SYSTEM_ALERT_WINDOW')
  if mode=='ignore':return self
  if mode not in MODES:raise ValueError('无法确认手势浮层原状态，保留原设置')
  from .core import cache_dir
  key=uuid.uuid4().hex;base='/data/local/tmp/homeview-lock-'+key;self.marker=base+'.active';script=base+'.sh';ready=base+'.ready'
  folder=cache_dir()/'permission-overlay-backups';folder.mkdir(parents=True,exist_ok=True)
  (folder/(key+'.json')).write_text(json.dumps({'schema':1,'serial':d.serial,'package':'com.android.systemui','op':'SYSTEM_ALERT_WINDOW','mode':mode,'automatic_restore_seconds':150}),encoding='utf-8')
  # This device-side watchdog survives installer exit / USB disconnection.
  # It changes only this one AppOp and never activates a device administrator.
  body='''#!/system/bin/sh
echo ready > "READY"
i=0
while [ "$i" -lt 150 ] && [ -f "MARKER" ]; do
 sleep 1
 i=$((i+1))
done
state=$(cmd appops get com.android.systemui SYSTEM_ALERT_WINDOW)
case "$state" in
 *"SYSTEM_ALERT_WINDOW: ignore"*) cmd appops set com.android.systemui SYSTEM_ALERT_WINDOW ORIGINAL ;;
esac
rm -f "MARKER" "READY" "SCRIPT"
'''.replace('READY',ready).replace('MARKER',self.marker).replace('SCRIPT',script).replace('ORIGINAL',mode)
  with tempfile.TemporaryDirectory(prefix='homeview-lock-') as temp:
   local=Path(temp)/'restore.sh';local.write_bytes(body.encode('utf-8'));d.call('push',str(local),script)
  d.shell('touch',self.marker)
  d.shell('sh','-c','nohup sh '+script+' >/dev/null 2>&1 </dev/null &')
  for _ in range(10):
   if d.shell('cat',ready,check=False).strip()=='ready':break
   time.sleep(.2)
  else:
   d.shell('rm','-f',self.marker,check=False);raise ValueError('无法启动设备端浮层自动恢复保护，保留原设置')
  self.original=mode
  try:
   checked(d,'cmd','appops','set','com.android.systemui','SYSTEM_ALERT_WINDOW','ignore')
   if op_state(d,'com.android.systemui','SYSTEM_ALERT_WINDOW')!='ignore':raise ValueError('系统手势浮层尚未隐藏')
   for _ in range(15):
    active=any('com.android.systemui' in line and 'visible=true' in line and 'type=0x000007d6' in line for line in d.shell('dumpsys','input').splitlines())
    if not active:break
    time.sleep(.2)
   else:raise ValueError('透明浮层仍在遮挡授权页，请稍后重试')
  except Exception:
   self.__exit__(None,None,None);raise
  self.log('授权期间临时隐藏遮挡按钮的系统手势浮层；结束或超时后自动恢复')
  return self
 def __exit__(self,*unused):
  if self.original is None:return
  try:
   d=self.device
   if op_state(d,'com.android.systemui','SYSTEM_ALERT_WINDOW')=='ignore':checked(d,'cmd','appops','set','com.android.systemui','SYSTEM_ALERT_WINDOW',self.original)
   if op_state(d,'com.android.systemui','SYSTEM_ALERT_WINDOW')==self.original:
    d.shell('rm','-f',self.marker,check=False);self.log('系统手势浮层已恢复原设置')
   else:self.log('浮层状态已改变，保留当前设置；设备端恢复保护仍在运行')
  except Exception:self.log('连接暂不可用，设备端将在 150 秒内恢复手势浮层')
