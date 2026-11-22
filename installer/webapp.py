"""Local-only browser wizard. Requests require a per-run token and exact Origin."""
import argparse,hmac,json,secrets,threading,webbrowser,tempfile,uuid
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from . import core
from .config import PRESETS,normalize
from .media import image_info,MAX_IMAGE,MAX_TOTAL
class Wizard:
 def __init__(self,manifest=None):self.token=secrets.token_urlsafe(32);self.manifest=manifest or core.release_manifest();self.logs=[];self.running=False;self.result=None;self.error='';self.lock=threading.Lock();self.temp=tempfile.TemporaryDirectory(prefix='homeview-import-');self.uploads={}
 def upload(self,data):
  info=image_info(data)
  with self.lock:
   if self.running:raise ValueError('部署进行中，无法更改图片')
   if len(self.uploads)>=30 or sum(x[1]['bytes'] for x in self.uploads.values())+len(data)>MAX_TOTAL:raise ValueError('每次最多 30 张图片，总计不超过 200 MB')
   key=uuid.uuid4().hex;path=Path(self.temp.name)/(key+'.'+info['extension']);path.write_bytes(data);self.uploads[key]=(path,info)
  return {'id':key,**info}
 def remove(self,key):
  with self.lock:
   if self.running:raise ValueError('部署进行中，无法更改图片')
   value=self.uploads.pop(key,None)
   if value:value[0].unlink(missing_ok=True)
 def close(self):self.temp.cleanup()
 def log(self,message):
  with self.lock:self.logs.append(str(message))
 def snapshot(self):
  with self.lock:return {'running':self.running,'logs':self.logs[-100:],'result':self.result,'error':self.error}
 def start(self,config,serial,images=None,wallpaper=None):
  normalized=normalize(config)
  with self.lock:
   if self.running:raise core.DeployError('部署正在进行，请等待完成')
   keys=images or []
   if not isinstance(keys,list) or len(keys)>30 or any(not isinstance(k,str) or k not in self.uploads for k in keys):raise ValueError('请重新选择图片')
   if wallpaper is not None and wallpaper not in keys:raise ValueError('默认壁纸不在图片列表中')
   paths=[self.uploads[k][0] for k in keys];wall=self.uploads[wallpaper][0] if wallpaper else None
   self.running=True;self.logs=[];self.error='';self.result=None
  def work():
   try:self.result=core.deploy(normalized,serial,self.manifest,self.log,media_paths=paths,wallpaper_path=wall)
   except Exception as e:self.error=str(e)
   finally:self.running=False
  threading.Thread(target=work,daemon=True).start()
def handler(wizard):
 class Handler(BaseHTTPRequestHandler):
  def log_message(self,*args):pass
  def origin(self):return 'http://127.0.0.1:'+str(self.server.server_port)
  def json(self,data,status=200):
   body=json.dumps(data,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Referrer-Policy','no-referrer');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
  def valid_host(self):return self.headers.get('Host')=='127.0.0.1:'+str(self.server.server_port)
  def authorized(self):return self.valid_host() and hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+wizard.token)
  def do_GET(self):
   if not self.valid_host():return self.json({'error':'Host not allowed'},403)
   routes={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}
   if self.path in routes:
    path=Path(__file__).parent/'web'/routes[self.path];body=path.read_bytes();self.send_response(200);self.send_header('Content-Type',{'/':'text/html; charset=utf-8','/app.js':'application/javascript; charset=utf-8','/style.css':'text/css; charset=utf-8'}[self.path]);self.send_header('Referrer-Policy','no-referrer');self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Security-Policy',"default-src 'self'; connect-src 'self'; img-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
   if not self.authorized():return self.json({'error':'请从安装器打开此窗口'},403)
   if self.path=='/api/status':return self.json(wizard.snapshot())
   if self.path=='/api/info':return self.json({'version':wizard.manifest.get('version','准备发布'),'presets':PRESETS,'package':wizard.manifest.get('homeview',{}).get('package','')})
   return self.json({'error':'Not found'},404)
  def do_POST(self):
   if not self.authorized() or self.headers.get('Origin')!=self.origin():return self.json({'error':'来源无效'},403)
   try:
    length=int(self.headers.get('Content-Length','0'))
    if self.path=='/api/upload':
     if length<16 or length>MAX_IMAGE:raise ValueError('每张图片需小于 24 MB')
     return self.json(wizard.upload(self.rfile.read(length)))
    if length<0 or length>16384:raise ValueError('请求过大')
    data=json.loads(self.rfile.read(length) or b'{}')
    if not isinstance(data,dict):raise ValueError('请求格式不正确')
    if self.path=='/api/scan':return self.json({'devices':core.devices(core.find_adb(True))})
    if self.path=='/api/cities':return self.json({'cities':core.search_cities(data.get('query',''))})
    if self.path=='/api/validate':return self.json({'ok':True,'config':normalize(data.get('config',{}))})
    if self.path=='/api/remove-image':wizard.remove(data.get('id'));return self.json({'ok':True})
    if self.path=='/api/deploy':wizard.start(data.get('config',{}),data.get('serial'),data.get('images'),data.get('wallpaper'));return self.json({'ok':True})
    if self.path=='/api/close':
     if wizard.running:raise ValueError('部署进行中，请等待完成')
     self.json({'ok':True});threading.Thread(target=self.server.shutdown,daemon=True).start();return
    return self.json({'error':'Not found'},404)
   except Exception as e:self.json({'error':str(e)},400)
 return Handler
def serve(manifest=None,open_browser=True):
 wizard=Wizard(manifest);server=ThreadingHTTPServer(('127.0.0.1',0),handler(wizard));server.daemon_threads=True;url='http://127.0.0.1:'+str(server.server_port)+'/#'+wizard.token
 if open_browser:webbrowser.open(url)
 try:server.serve_forever(poll_interval=.25)
 finally:server.server_close();wizard.close()
