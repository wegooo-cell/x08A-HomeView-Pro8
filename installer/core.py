"""Cross-platform ADB deployment. Never reads accounts or disables system keyboards."""
import hashlib,json,os,platform,re,shlex,shutil,ssl,subprocess,tempfile,time,urllib.parse,urllib.request,uuid,zipfile
from pathlib import Path
from .config import normalize,ConfigError
from .apk import apk_info,signer_sha256,file_sha256
from .media import read_image,MAX_TOTAL
ROOT=Path(__file__).resolve().parents[1]
IME='org.fcitx.fcitx5.android/.input.FcitxInputMethodService'
class DeployError(RuntimeError):pass
def context():
 c=ssl.create_default_context()
 if Path('/etc/ssl/cert.pem').is_file():c.load_verify_locations('/etc/ssl/cert.pem')
 return c
def cache_dir():
 if os.name=='nt':base=Path(os.environ.get('LOCALAPPDATA',str(Path.home()/'AppData/Local')))
 elif platform.system()=='Darwin':base=Path.home()/'Library/Application Support'
 else:base=Path(os.environ.get('XDG_CACHE_HOME',str(Path.home()/'.cache')))
 p=base/'HomeView';p.mkdir(parents=True,exist_ok=True);return p
def request_json(url,limit=1500000,timeout=18):
 if not url.startswith('https://'):raise DeployError('只接受 HTTPS 下载地址')
 req=urllib.request.Request(url,headers={'User-Agent':'HomeView-Installer/1','Accept':'application/json'})
 with urllib.request.urlopen(req,timeout=timeout,context=context()) as r:
  raw=r.read(limit+1)
 if len(raw)>limit:raise DeployError('服务器响应过大')
 return json.loads(raw)
def download(url,target,expected=None,progress=None):
 if not url.startswith('https://'):raise DeployError('只接受 HTTPS 下载地址')
 temp=target.with_suffix(target.suffix+'.part');target.parent.mkdir(parents=True,exist_ok=True)
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'HomeView-Installer/1'})
  with urllib.request.urlopen(req,timeout=60,context=context()) as r,open(temp,'wb') as f:
   size=int(r.headers.get('Content-Length','0'));count=0
   if size>256*1024*1024:raise DeployError('安装文件过大')
   while True:
    chunk=r.read(256*1024)
    if not chunk:break
    count+=len(chunk)
    if count>256*1024*1024:raise DeployError('安装文件过大')
    f.write(chunk)
  if expected and file_sha256(temp)!=expected:raise DeployError('下载文件校验失败，请重试')
  temp.replace(target)
 finally:
  if temp.exists():temp.unlink()
def find_adb(allow_download=False):
 exe='adb.exe' if os.name=='nt' else 'adb';cache=cache_dir();choices=[os.environ.get('ADB'),shutil.which('adb'),str(cache/'platform-tools'/exe)]
 for p in choices:
  if p and Path(p).is_file():return str(Path(p).resolve())
 if not allow_download:raise DeployError('尚未找到 ADB，请点击“准备连接”自动下载官方工具')
 system={'Darwin':'darwin','Windows':'windows','Linux':'linux'}.get(platform.system())
 if not system:raise DeployError('当前电脑系统暂不支持')
 archive=cache/'platform-tools.zip';download('https://dl.google.com/android/repository/platform-tools-latest-'+system+'.zip',archive)
 with zipfile.ZipFile(archive) as z:
  for member in z.infolist():
   name=member.filename
   if not name.startswith('platform-tools/') or '\\' in name or '..' in Path(name).parts or (member.external_attr>>16)&0o170000==0o120000:raise DeployError('ADB 压缩包路径无效')
   resolved=(cache/name).resolve()
   if not resolved.is_relative_to(cache.resolve()):raise DeployError('ADB 压缩包路径无效')
  z.extractall(cache)
 path=cache/'platform-tools'/exe
 if os.name!='nt':path.chmod(0o755)
 return str(path)
def run(args,timeout=40,check=True):
 p=subprocess.run([str(x) for x in args],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,encoding='utf-8',errors='replace',timeout=timeout,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
 if check and p.returncode:raise DeployError(p.stdout.strip() or 'ADB 执行失败')
 return p.stdout.strip()
class Device:
 def __init__(self,adb,serial):self.adb,self.serial=adb,serial
 def call(self,*args,**kw):return run([self.adb,'-s',self.serial,*args],**kw)
 def shell(self,*args,**kw):return self.call('shell',shlex.join([str(x) for x in args]),**kw)
 def check(self):
  model=self.shell('getprop','ro.product.model');sdk=self.shell('getprop','ro.build.version.sdk');abi=self.shell('getprop','ro.product.cpu.abilist');size=self.shell('wm','size')
  if model not in ('X08A','Pro8') or sdk!='28' or 'armeabi-v7a' not in abi or '1280x800' not in size.replace(' ',''):raise DeployError('仅支持 Pro8 / X08A、Android 9、ARMv7、1280×800')
  return {'model':model,'android':9,'screen':'1280×800'}
 def package_path(self,pkg):
  paths=[x[8:] for x in self.shell('pm','path',pkg,check=False).splitlines() if x.startswith('package:')]
  return paths[0] if len(paths)==1 else None
 def version(self,pkg):
  m=re.search(r'versionCode=(\d+)',self.shell('dumpsys','package',pkg));return int(m.group(1)) if m else 0
def devices(adb):
 run([adb,'start-server'])
 out=[]
 for line in run([adb,'devices','-l']).splitlines():
  fields=line.split()
  if len(fields)>=2 and fields[1] in ('device','offline','unauthorized','recovery','sideload','bootloader'):
   out.append({'serial':fields[0],'state':fields[1],'label':next((x[6:].replace('_',' ') for x in fields[2:] if x.startswith('model:')),fields[0])})
 return out
def release_manifest(path=None):
 p=Path(path) if path else ROOT/'release.json';data=json.loads(p.read_text(encoding='utf-8'))
 if data.get('schema')!=1 or not isinstance(data.get('homeview'),dict):raise DeployError('发布清单无效')
 return data
def validate_apk(path,item):
 if not re.fullmatch('[a-f0-9]{64}',item.get('sha256','')) or file_sha256(path)!=item['sha256']:raise DeployError('APK SHA256 不匹配')
 if signer_sha256(path)!=item['certificate_sha256']:raise DeployError('APK 签名不匹配')
 info=apk_info(path)
 if info.get('package')!=item['package'] or int(info.get('version_code',0))!=int(item['version_code']):raise DeployError('APK 包名或版本与清单不符')
 if int(info.get('min_sdk',99))>28:raise DeployError('安装包不支持 Android 9')
 return info
def ensure_apk(item):
 p=cache_dir()/(item['sha256']+'.apk')
 if not p.exists() or file_sha256(p)!=item['sha256']:download(item['url'],p,item['sha256'])
 validate_apk(p,item);return p
def verify_installed(device,item):
 old=device.package_path(item['package'])
 if not old:return 'install'
 current=device.version(item['package'])
 if current>item['version_code']:raise DeployError('设备版本较新，已停止以避免降级')
 with tempfile.TemporaryDirectory(prefix='homeview-signature-') as folder:
  target=Path(folder)/'base.apk';device.call('pull',old,str(target),timeout=120)
  if signer_sha256(target)!=item['certificate_sha256']:raise DeployError('设备已有另一签名的 HomeView。已停止，不卸载或清空任何数据')
  if current==item['version_code']:
   if file_sha256(target)!=item['sha256']:raise DeployError('相同版本的安装文件不同，已停止')
   return 'keep'
 return 'update'
def choose_keyboard(device,choice):
 if choice=='fcitx':
  if not device.package_path('org.fcitx.fcitx5.android'):raise DeployError('小企鹅尚未安装')
  device.shell('ime','enable',IME);device.shell('ime','set',IME)
  if device.shell('settings','get','secure','default_input_method')!=IME:raise DeployError('小企鹅尚未选为默认，请在设备端输入法设置中选择')
 elif choice!='preserve':raise DeployError('输入法选项不正确')
def seed_keyboard_theme(device,log=print):
 source=ROOT/'keyboard/HomeView iOS Light.json';remote='/storage/emulated/0/Android/data/org.fcitx.fcitx5.android/files/theme/'+source.name
 if not source.is_file():raise DeployError('缺少小企鹅 Pro8 定制主题，请重新下载完整安装器')
 if device.shell('ls','-d',remote,check=False).strip()==remote:
  log('小企鹅已有同名主题，保留现有配置');return
 device.shell('mkdir','-p',remote.rsplit('/',1)[0]);device.call('push',str(source),remote)
 log('Pro8 浅色主题已传入；请在小企鹅设置中选择 HomeView iOS Light，横屏参数见键盘指南')
def seed_wallpaper(device,apk_path):
 folder='/storage/emulated/0/Pictures/HomeView'
 existing=device.shell('find',folder,'-maxdepth','1','-type','f',check=False)
 if any(re.search(r'\.(jpe?g|png|webp)$',x,re.I) for x in existing.splitlines()):return
 with zipfile.ZipFile(apk_path) as z:content=z.read('assets/frame/hv/desktop/assets/wallpaper-blue.png')
 with tempfile.TemporaryDirectory(prefix='homeview-wallpaper-') as temp:
  file=Path(temp)/'HomeView-default.png';file.write_bytes(content);device.shell('mkdir','-p',folder);device.call('push',str(file),folder+'/HomeView-default.png')
def apply_configuration(device,item,config,log,timeout=180,media=None,wallpaper=None):
 name='setup-'+uuid.uuid4().hex+'.json';base='/storage/emulated/0/Android/data/'+item['package']+'/files/setup';result=base+'/'+name.replace('.json','.result.json')
 config=dict(config);staged=[]
 try:
  device.shell('mkdir','-p',base)
  if media:
   entries=[];public='/storage/emulated/0/Pictures/HomeView';device.shell('mkdir','-p',public)
   for index,(path,info) in enumerate(media):
    filename='HomeView-'+uuid.uuid4().hex+'.'+info['extension'];staged.append(base+'/'+filename)
    log('传入图片 '+str(index+1)+' / '+str(len(media)))
    device.call('push',str(path),public+'/'+filename,timeout=180);device.call('push',str(path),base+'/'+filename,timeout=180)
    entries.append({'file':filename,'source':filename})
    if wallpaper is not None and path==wallpaper:config['wallpaper']=filename
   config['media']=entries
  config={k:v for k,v in normalize(config).items() if k not in ('optimize_apps','limit_background','power_key')}
  with tempfile.TemporaryDirectory(prefix='homeview-setup-') as folder:
   path=Path(folder)/name;path.write_text(json.dumps(config,ensure_ascii=False),encoding='utf-8');device.call('push',str(path),base+'/'+name)
  device.shell('am','start','-n',item['package']+'/dev.pro8.homeview.direct.SetupActivity','--es','setup_name',name)
  log('正在应用电脑端选择的配置')
  deadline=time.monotonic()+timeout
  while time.monotonic()<deadline:
   raw=device.shell('cat',result,check=False)
   try:reply=json.loads(raw)
   except (ValueError,TypeError):time.sleep(1);continue
   if reply.get('status')=='ok':return
   raise DeployError(reply.get('message','配置没有完成，请重试'))
  raise DeployError('等待设备应用配置超时。应用已安装，可重新应用配置')
 finally:device.shell('rm','-f',base+'/'+name,result,*staged,check=False)
def deploy(config,serial=None,manifest=None,log=print,adb=None,media_paths=None,wallpaper_path=None):
 prepared=[];total=0
 for path in media_paths or []:
  file,info=read_image(path)
  if any(file==p for p,_ in prepared):continue
  prepared.append((file,info));total+=info['bytes']
 if len(prepared)>30 or total>MAX_TOTAL:raise DeployError('每次最多导入 30 张图片，总计不超过 200 MB')
 wallpaper=Path(wallpaper_path).expanduser().resolve(strict=True) if wallpaper_path else None
 if wallpaper is not None and wallpaper not in [p for p,_ in prepared]:raise DeployError('所选壁纸不在导入列表中')
 if config.get('media') or config.get('wallpaper'):raise DeployError('图片请通过安装器选择，命令行使用 --import 和 --wallpaper')
 config=normalize(config);release=manifest or release_manifest();binary=adb or find_adb(True);online=[x for x in devices(binary) if x['state']=='device']
 if serial is None:
  if len(online)!=1:raise DeployError('请选择一台已允许 USB 调试的 Pro8')
  serial=online[0]['serial']
 if serial not in [x['serial'] for x in online]:raise DeployError('设备未连接或尚未允许 USB 调试')
 d=Device(binary,serial);log('检查设备');device_info=d.check();item=release['homeview'];log('检查安装签名和版本');action=verify_installed(d,item);packages=[]
 if action!='keep':log('下载并校验 HomeView');packages.append((item,ensure_apk(item)))
 if config['keyboard']=='fcitx' and not d.package_path('org.fcitx.fcitx5.android'):
  fcitx=release.get('companions',{}).get('fcitx')
  if not fcitx:raise DeployError('本发布暂未提供小企鹅，请先保留系统输入法')
  log('下载并校验小企鹅官方安装包');packages.append((fcitx,ensure_apk(fcitx)))
 compat=release.get('companions',{}).get('homeview_compat')
 if compat and not d.package_path(compat['package']):
  log('准备旧客户端相册与返回桌面的兼容入口');packages.append((compat,ensure_apk(compat)))
 bridge=release.get('companions',{}).get('homeview_widget_bridge')
 if bridge and d.package_path('dev.pro8.bili') and not d.package_path(bridge['package']):
  log('准备视频标题与封面的只读兼容组件，保留视频账号');packages.append((bridge,ensure_apk(bridge)))
 # Verify every artifact before beginning installation.
 for metadata,path in packages:validate_apk(path,metadata)
 for metadata,path in packages:
  log('安装 '+metadata.get('name',metadata['package']));reply=d.call('install','-r',str(path),timeout=300)
  if 'Success' not in reply:raise DeployError(reply)
 log('准备应用电脑端配置');apply_configuration(d,item,config,log,media=prepared,wallpaper=wallpaper)
 if action=='install':
  home_apk=next((p for m,p in packages if m['package']==item['package']),None)
  if home_apk:seed_wallpaper(d,home_apk)
 if config['keyboard']=='fcitx':seed_keyboard_theme(d,log)
 choose_keyboard(d,config['keyboard'])
 if config['set_home']:
  d.shell('cmd','package','set-home-activity','--user','0',item['package']+'/dev.pro8.homeview.direct.HomeActivity')
 from .optimization import apply as apply_optimization
 optimization=apply_optimization(d,config,item['package'],log)
 from .power_key import apply as apply_power_key
 power_key=apply_power_key(d,config,item['package'],log)
 log('部署完成。请在设备端登录音乐和家庭账号')
 return {'ok':True,'version':item['version_code'],'action':action,'device':device_info,'keyboard':config['keyboard'],'accounts_copied':False,'optimization':optimization,'power_key':power_key}
def search_cities(query):
 q=query.strip()
 if len(q)<2 or len(q)>80 or any(ord(x)<32 for x in q):raise ConfigError('请输入2到80个字的城市名')
 from .geocoding import search
 try:return search(q,request_json)
 except ValueError as e:raise ConfigError(str(e)) from e
