"""Pro8 PMIC overlay using the USB shell's existing keyboard-layout permission."""
import json,re,time,uuid
from pathlib import Path

PACKAGE='io.github.wegooo_cell.homeview'
ENTRY='dev.pro8.homeview.direct.PowerKeyShell'
LAYOUT=PACKAGE+'/dev.pro8.homeview.direct.PowerKeyboardLayouts/pro8_power'

def shell_entry(device,apk,operation,*args):
 raw=device.shell('env','CLASSPATH='+apk,'app_process','/system/bin',ENTRY,operation,*args,check=False)
 for line in reversed(raw.splitlines()):
  try:reply=json.loads(line)
  except ValueError:continue
  if isinstance(reply,dict) and type(reply.get('ok')) is bool:
   if not reply['ok']:raise ValueError(reply.get('error','系统拒绝按键配置'))
   return reply
 raise ValueError('无法确认按键配置结果；请检查设备系统与 USB 调试权限')

def overlay_active(raw):
 # Do not mistake another input device's overlay for the PMIC overlay.
 hub=raw.split('Input Reader State:')[0]
 blocks=re.split(r'\n    -?\d+: ',hub)
 return any(b.splitlines()[0].strip()=='mtk-pmic-keys' and re.search(r'HaveKeyboardLayoutOverlay:\s*true\b',b) for b in blocks if b.splitlines())

def authorize(device,log,timeout=120):
 name='power-'+uuid.uuid4().hex+'.json';remote='/storage/emulated/0/Android/data/'+PACKAGE+'/files/setup/'+name
 device.shell('am','start','-n',PACKAGE+'/dev.pro8.homeview.direct.PowerKeySetupActivity','--es','result_name',name)
 log('请查看 Pro8：在系统窗口确认 HomeView 的锁屏权限，双击熄屏才会生效')
 deadline=time.monotonic()+timeout
 try:
  while time.monotonic()<deadline:
   try:reply=json.loads(device.shell('cat',remote,check=False))
   except ValueError:time.sleep(1);continue
   if reply.get('status')!='pending_authorization':return reply
   time.sleep(1)
  return {'status':'pending_authorization','authorized':False}
 finally:device.shell('rm','-f',remote,check=False)

def apply(device,config,home_package,log=print):
 if not config['power_key']:return {'enabled':False,'status':'preserved','errors':[]}
 result={'enabled':True,'mapped':False,'authorized':False,'status':'unavailable','errors':[]}
 before=None;apk=None;attempted=False
 try:
  if home_package!=PACKAGE:raise ValueError('按键配置只支持官方 HomeView 包名')
  apk=device.package_path(PACKAGE)
  if not apk:raise ValueError('HomeView 尚未安装')
  before=shell_entry(device,apk,'inspect')
  if before.get('device')!='mtk-pmic-keys' or not re.fullmatch('[a-f0-9]{40}',before.get('descriptor','')):raise ValueError('未确认 Pro8 背部按键，保留原映射')
  if before.get('current')!=LAYOUT:
   from .core import cache_dir
   folder=cache_dir()/'power-key-backups';folder.mkdir(parents=True,exist_ok=True)
   path=folder/('pro8-'+uuid.uuid4().hex+'.json')
   record={'schema':1,'serial':device.serial,'descriptor':before['descriptor'],'before':before.get('current'),'enabled_before':before.get('enabled_before',[])}
   path.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
   result['restore_file']=str(path);log('按键原配置恢复记录：'+str(path))
  attempted=True;configured=shell_entry(device,apk,'apply')
  if configured.get('current')!=LAYOUT:raise ValueError('按键布局未保存')
  for _ in range(8):
   if overlay_active(device.shell('dumpsys','input')):break
   time.sleep(.5)
  else:raise ValueError('系统未加载按键覆盖；已保留恢复记录，请勿视为配置成功')
  result['mapped']=True;log('背部电源键已配置：单击切换 HomeView / 原生桌面')
  from .permission_overlay import PermissionOverlay
  with PermissionOverlay(device,log):auth=authorize(device,log)
  result.update(authorized=bool(auth.get('authorized')),status=auth.get('status','unavailable'))
  if result['authorized']:log('双击熄屏已启用，锁屏权限已确认')
  else:log('单击切换已启用；双击熄屏待设备授权，可重新运行安装器完成授权')
 except Exception as e:
  result['errors'].append(str(e));log('按键配置未完成：'+str(e)+'；其他部署结果保留')
  if attempted and not result['mapped'] and before and before.get('current')!=LAYOUT:
   try:
    shell_entry(device,apk,'restore',before.get('current') or 'none','keep' if LAYOUT in before.get('enabled_before',[]) else 'remove')
    result['rolled_back']=True;log('已撤回本次按键覆盖，恢复原布局选择')
   except Exception:result['errors'].append('自动恢复尚未确认，请使用已保存的恢复记录');log(result['errors'][-1])
 return result

def restore(device,path,log=print):
 record=json.loads(Path(path).read_text(encoding='utf-8'))
 if record.get('schema')!=1 or record.get('serial')!=device.serial:raise ValueError('恢复记录与设备不匹配')
 before=record.get('before')
 enabled=record.get('enabled_before',[])
 if not isinstance(enabled,list) or any(not isinstance(x,str) for x in enabled):raise ValueError('原布局记录不正确')
 if before is not None and (not isinstance(before,str) or not re.fullmatch(r'[A-Za-z0-9_.$/\-]{1,500}',before) or before==LAYOUT):raise ValueError('原布局记录不正确')
 apk=device.package_path(PACKAGE)
 if not apk:raise ValueError('请在卸载 HomeView 前恢复按键覆盖')
 state=shell_entry(device,apk,'inspect')
 if state.get('descriptor')!=record.get('descriptor'):raise ValueError('恢复记录的按键设备不匹配')
 reply=shell_entry(device,apk,'restore',before if before is not None else 'none','keep' if LAYOUT in enabled else 'remove')
 if reply.get('current')!=before:raise ValueError('原布局未恢复')
 log('已移除 HomeView 的按键覆盖，恢复原布局选择')
 return {'ok':True}
