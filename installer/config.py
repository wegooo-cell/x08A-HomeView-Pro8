"""Non-secret deployment settings shared by the GUI and AI/CLI entry."""
import math,re
from urllib.parse import urlsplit,urlunsplit
SCHEMA=1
PRESETS=[{'name':n,'latitude':a,'longitude':b,'timezone':'Asia/Shanghai','country':'中国','admin1':n} for n,a,b in [('北京',39.9075,116.39723),('上海',31.22222,121.45806),('广州',23.1291,113.2644),('深圳',22.5431,114.0579),('杭州',30.2741,120.1551),('成都',30.5728,104.0668),('武汉',30.5928,114.3055),('西安',34.3416,108.9398)]]
class ConfigError(ValueError):pass
def text(value,limit):
 if not isinstance(value,str) or len(value)>limit or any(ord(c)<32 for c in value):raise ConfigError('配置文字格式不正确')
 return value.strip()
def ha_url(raw):
 raw=text(raw,1024);u=urlsplit(raw)
 try:port=u.port
 except ValueError:raise ConfigError('HA 端口不正确')
 if u.scheme not in ('http','https') or not u.hostname or u.username is not None or u.password is not None or u.query or u.fragment or u.path not in ('','/') or port is not None and not 1<=port<=65535:raise ConfigError('请填写完整 HA 地址，如 http://192.168.1.10:8123，不填写账号、密码或令牌')
 return urlunsplit((u.scheme,u.netloc,'','',''))
def city(value):
 if not isinstance(value,dict) or set(value)-{'name','latitude','longitude','timezone','country','admin1'}:raise ConfigError('请从搜索结果中选择城市')
 out={k:text(value.get(k,''),80) for k in ['name','timezone','country','admin1']}
 if not out['name'] or not re.fullmatch(r'[A-Za-z0-9_+./-]{1,80}',out['timezone']):raise ConfigError('城市或时区不正确')
 for key,bound in [('latitude',90),('longitude',180)]:
  v=value.get(key)
  if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or abs(v)>bound:raise ConfigError('城市坐标不正确')
  out[key]=v
 return out
def normalize(value):
 if not isinstance(value,dict) or set(value)-{'schema','weather','keyboard','family','set_home','idle','media','wallpaper'}:raise ConfigError('配置包含不支持的项目；请勿放入任何账号凭据')
 if value.get('schema',SCHEMA)!=SCHEMA:raise ConfigError('配置版本不支持')
 keyboard=value.get('keyboard','preserve');family=value.get('family',{'provider':'preserve'})
 if keyboard not in ('preserve','fcitx'):raise ConfigError('请选择保留系统输入法或小企鹅')
 if not isinstance(family,dict) or set(family)-{'provider','ha_url','name'} or family.get('provider','preserve') not in ('preserve','mijia','ha'):raise ConfigError('家庭来源不正确')
 provider=family.get('provider','preserve');f={'provider':provider}
 if provider=='ha':f['ha_url']=ha_url(family.get('ha_url',''))
 elif family.get('ha_url'):raise ConfigError('填写 HA 地址时请选择 Home Assistant')
 if family.get('name') is not None:
  f['name']=text(family['name'],24)
  if not f['name']:raise ConfigError('家庭名称请输入 1–24 个字')
 set_home=value.get('set_home',True)
 if not isinstance(set_home,bool):raise ConfigError('默认桌面选项不正确')
 out={'schema':SCHEMA,'weather':None if value.get('weather') is None else city(value['weather']),'keyboard':keyboard,'family':f,'set_home':set_home}
 if value.get('idle') is not None:
  idle=value['idle']
  if not isinstance(idle,dict) or not idle or set(idle)-{'mode','minutes'}:raise ConfigError('待机设置不正确')
  if 'mode' in idle and idle['mode'] not in ('photos','dim','off'):raise ConfigError('待机方式不正确')
  if 'minutes' in idle and (type(idle['minutes']) is not int or idle['minutes'] not in (1,3,5,10)):raise ConfigError('待机等待时间不正确')
  out['idle']=dict(idle)
 media=value.get('media',[])
 if not isinstance(media,list) or len(media)>30:raise ConfigError('每次最多导入 30 张图片')
 names=set()
 for entry in media:
  if not isinstance(entry,dict) or set(entry)!={'file','source'}:raise ConfigError('图片记录不正确')
  for name in entry.values():
   if not isinstance(name,str) or not re.fullmatch(r'HomeView-[a-f0-9]{32}\.(png|jpg|webp)',name):raise ConfigError('图片名称不正确')
  if entry['source'] in names:raise ConfigError('图片记录重复')
  names.add(entry['source'])
 if media:out['media']=[dict(e) for e in media]
 if value.get('wallpaper') is not None:
  if value['wallpaper'] not in names:raise ConfigError('默认壁纸必须是本次导入的图片')
  out['wallpaper']=value['wallpaper']
 return out
