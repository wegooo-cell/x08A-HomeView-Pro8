"""Explicit two-package Pro8 optimization with a local recovery record."""
import json,re,uuid
from pathlib import Path
TARGETS={'com.xiaomi.mico.appstore':'系统应用商店','com.xiaomi.mico.romupdate':'系统更新组件'}
OPS=('RUN_IN_BACKGROUND','RUN_ANY_IN_BACKGROUND')
MODES={'allow','ignore','deny','default','foreground'}
def enabled_state(device,pkg):
 text=device.shell('dumpsys','package',pkg)
 match=re.search(r'User 0:[^\n]*\benabled=(\d+)',text)
 if not match or int(match.group(1)) not in range(5):raise ValueError('无法确认应用原启用状态')
 return int(match.group(1))
def op_state(device,pkg,op):
 text=device.shell('cmd','appops','get',pkg,op)
 match=re.search(re.escape(op)+r':\s*(allow|ignore|deny|default|foreground)\b',text)
 if match:return match.group(1)
 if 'No operations' in text:return 'default'
 raise ValueError('此固件暂不支持 '+op)
def checked(device,*args):
 reply=device.shell(*args)
 if re.search(r'Exception|Error:|not allowed|SecurityException',reply,re.I):raise ValueError('系统拒绝此优化操作')
 return reply
def apply(device,config,home_package,log=print):
 from .core import cache_dir
 if not config['optimize_apps'] and not config['limit_background']:return {'enabled':False,'items':[],'errors':[]}
 protected={home_package,'dev.pro8.homeview.direct','com.xiaomi.micolauncher','com.xiaomi.smarthome','com.android.systemui','com.android.settings','org.fcitx.fcitx5.android','dev.pro8.blbl','dev.pro8.bili','dev.pro8.vinyl'}
 try:
  for line in device.shell('ime','list','-a','-s').splitlines():protected.add(line.split('/')[0].strip())
 except Exception:pass
 record={'schema':1,'serial':device.serial,'items':[]};errors=[]
 folder=cache_dir()/'optimization-backups';folder.mkdir(parents=True,exist_ok=True);backup=folder/('pro8-'+uuid.uuid4().hex+'.json')
 def save():
  temp=backup.with_suffix('.tmp');temp.write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8');temp.replace(backup)
 for pkg,label in TARGETS.items():
  if pkg in protected or not device.package_path(pkg):continue
  try:
   item={'package':pkg,'enabled_before':enabled_state(device,pkg),'ops_before':{},'disable':bool(config['optimize_apps'])}
   if config['limit_background']:
    for op in OPS:item['ops_before'][op]=op_state(device,pkg,op)
   record['items'].append(item);save()
   if config['limit_background']:
    for op in OPS:
     checked(device,'cmd','appops','set',pkg,op,'ignore')
     if op_state(device,pkg,op)!='ignore':raise ValueError('后台限制未生效')
    log(label+'：已限制后台运行')
   if config['optimize_apps']:
    checked(device,'pm','disable-user','--user','0',pkg)
    if enabled_state(device,pkg)!=3:raise ValueError('应用停用未生效')
    log(label+'：已停用，保留数据和恢复记录')
   checked(device,'am','force-stop',pkg)
  except Exception as e:
   errors.append({'package':pkg,'message':str(e)});log(label+'：'+str(e)+'；其他部署步骤继续')
 if record['items']:log('系统优化恢复记录：'+str(backup))
 return {'enabled':True,'items':record['items'],'errors':errors,'restore_file':str(backup) if record['items'] else None}
def restore(device,path,log=print):
 data=json.loads(Path(path).read_text(encoding='utf-8'))
 if data.get('schema')!=1 or data.get('serial')!=device.serial:raise ValueError('恢复记录与设备不匹配')
 commands={0:'default-state',1:'enable',2:'disable',3:'disable-user',4:'disable-until-used'}
 for row in data.get('items',[]):
  if row.get('package') not in TARGETS or type(row.get('enabled_before')) is not int or row['enabled_before'] not in commands or any(k not in OPS or v not in MODES for k,v in row.get('ops_before',{}).items()):raise ValueError('恢复记录包含不支持的项目')
 for row in data.get('items',[]):
  pkg=row['package']
  if not device.package_path(pkg):continue
  if row.get('disable'):checked(device,'pm',commands[row['enabled_before']],'--user','0',pkg)
  for op,mode in row.get('ops_before',{}).items():checked(device,'cmd','appops','set',pkg,op,mode)
  log(TARGETS[pkg]+'：已恢复原状态')
 return {'ok':True}
