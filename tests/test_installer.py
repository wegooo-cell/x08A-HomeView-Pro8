import copy,http.client,json,struct,tempfile,threading,unittest
from pathlib import Path
from unittest.mock import Mock,patch
from http.server import ThreadingHTTPServer
from installer.config import normalize,ConfigError,PRESETS
from installer import core
from installer.media import image_info
from installer.webapp import Wizard,handler

def png(w=1280,h=800):return b'\x89PNG\r\n\x1a\n'+b'\x00\x00\x00\rIHDR'+struct.pack('>II',w,h)+b'\x08\x02\x00\x00\x00'+b'\x00'*12

class Configuration(unittest.TestCase):
 def test_preserve_defaults(self):
  c=normalize({});self.assertEqual(c['keyboard'],'preserve');self.assertIsNone(c['weather']);self.assertEqual(c['family'],{'provider':'preserve'});self.assertNotIn('idle',c)
 def test_round_trip(self):
  c=normalize({'weather':PRESETS[4],'keyboard':'fcitx','family':{'provider':'ha','ha_url':'https://ha.example.test:8123/','name':'我的家'},'idle':{'minutes':5,'mode':'dim'}});self.assertEqual(normalize(c),c);self.assertEqual(c['family']['ha_url'],'https://ha.example.test:8123')
 def test_credentials_rejected(self):
  for value in [{'token':'secret'},{'family':{'provider':'ha','ha_url':'http://user:pass@example.test'}},{'family':{'provider':'ha','ha_url':'http://example.test/?token=secret'}},{'family':{'provider':'mijia','password':'secret'}}]:
   with self.subTest(value=value),self.assertRaises(ConfigError):normalize(value)
 def test_invalid(self):
  for value in [{'schema':9},{'set_home':1},{'idle':{'minutes':True}},{'idle':{'mode':'shell'}},{'idle':{'slide':15}},{'weather':dict(PRESETS[0],latitude=float('nan'))},{'family':{'name':'x\ny'}},{'wallpaper':'../../account.json'},{'media':[{'file':'../x','source':'x'}]}]:
   with self.subTest(value=value),self.assertRaises(ConfigError):normalize(value)
 def test_media(self):
  name='HomeView-'+'a'*32+'.png';c=normalize({'media':[{'file':name,'source':name}],'wallpaper':name});self.assertEqual(c['wallpaper'],name)

class Images(unittest.TestCase):
 def test_header(self):self.assertEqual(image_info(png())['width'],1280)
 def test_unsupported_and_oversized(self):
  for data in [b'<svg>'+b' '*30,png(100001,100001),b'\x89PNG\r\n\x1a\nxxxxIHDR',b'MZ'+b' '*100]:
   with self.subTest(size=len(data)),self.assertRaises((ConfigError,ValueError)):image_info(data)

class Deployment(unittest.TestCase):
 def test_keyboard_preserve_has_no_calls(self):
  device=Mock();core.choose_keyboard(device,'preserve');self.assertEqual(device.mock_calls,[])
 def test_keyboard_never_disables(self):
  device=Mock();device.package_path.return_value='/base.apk';device.shell.side_effect=['','',core.IME];core.choose_keyboard(device,'fcitx');self.assertEqual(device.shell.call_args_list[0].args,('ime','enable',core.IME));self.assertEqual(device.shell.call_args_list[1].args,('ime','set',core.IME))
 def test_newer_stops_before_pull(self):
  d=Mock();d.package_path.return_value='/base.apk';d.version.return_value=200
  with self.assertRaises(core.DeployError):core.verify_installed(d,{'package':'example.app','version_code':169})
  d.call.assert_not_called()
 def test_signature_conflict_stops(self):
  d=Mock();d.package_path.return_value='/base.apk';d.version.return_value=100
  with patch('installer.core.signer_sha256',return_value='wrong'),self.assertRaises(core.DeployError):core.verify_installed(d,{'package':'example.app','version_code':169,'certificate_sha256':'expected'})
  self.assertEqual(d.call.call_args.args[0],'pull')
 def test_multiple_devices_requires_selection(self):
  with patch('installer.core.devices',return_value=[{'serial':'one','state':'device'},{'serial':'two','state':'device'}]),self.assertRaises(core.DeployError):core.deploy({},adb='adb')
 def test_shell_arguments_are_quoted(self):
  with patch('installer.core.run',return_value='') as execute:
   core.Device('adb','test').shell('echo','name; rm /x');self.assertEqual(execute.call_args.args[0][-1],"echo 'name; rm /x'")
 def test_preserve_deployment(self):
  d=Mock();d.check.return_value={'model':'Pro8'};d.package_path.return_value='/base.apk'
  with patch('installer.core.devices',return_value=[{'serial':'test','state':'device'}]),patch('installer.core.Device',return_value=d),patch('installer.core.verify_installed',return_value='keep'),patch('installer.core.apply_configuration') as apply,patch('installer.core.choose_keyboard') as keyboard:
   result=core.deploy({'set_home':False,'optimize_apps':False,'limit_background':False},adb='adb',manifest={'homeview':{'package':'example.app','version_code':169}},log=lambda _:None)
   self.assertEqual(result['action'],'keep');self.assertFalse(result['accounts_copied']);d.call.assert_not_called();d.shell.assert_not_called();keyboard.assert_called_once_with(d,'preserve');apply.assert_called_once()

class LocalWizard(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.wizard=Wizard({'schema':1,'version':'test','homeview':{'package':'example.app'}});cls.server=ThreadingHTTPServer(('127.0.0.1',0),handler(cls.wizard));cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start();cls.port=cls.server.server_port
 @classmethod
 def tearDownClass(cls):cls.server.shutdown();cls.server.server_close();cls.wizard.close();cls.thread.join()
 def request(self,method,path,data=None,auth=True,origin=True,host=None):
  connection=http.client.HTTPConnection('127.0.0.1',self.port);headers={}
  if auth:headers['Authorization']='Bearer '+self.wizard.token
  if origin:headers['Origin']='http://127.0.0.1:'+str(self.port)
  if host:headers['Host']=host
  body=data if isinstance(data,bytes) else json.dumps(data or {}).encode()
  connection.request(method,path,body if method=='POST' else None,headers);reply=connection.getresponse();status=reply.status;raw=reply.read();connection.close();return status,json.loads(raw) if path.startswith('/api/') else raw
 def test_token_required(self):self.assertEqual(self.request('GET','/api/info',auth=False)[0],403)
 def test_foreign_origin_denied(self):self.assertEqual(self.request('POST','/api/validate',{},origin=False)[0],403)
 def test_dns_rebinding_denied(self):self.assertEqual(self.request('GET','/api/info',host='attacker.example')[0],403)
 def test_validate(self):self.assertEqual(self.request('POST','/api/validate',{'config':{}})[0],200)
 def test_no_arbitrary_file_route(self):self.assertEqual(self.request('GET','/../../release.json')[0],404)
 def test_upload_remove(self):
  status,reply=self.request('POST','/api/upload',png());self.assertEqual(status,200);self.assertIn(reply['id'],self.wizard.uploads);self.assertNotIn('path',reply);self.assertEqual(self.request('POST','/api/remove-image',{'id':reply['id']})[0],200);self.assertNotIn(reply['id'],self.wizard.uploads)
 def test_unknown_media_id_rejected(self):
  with self.assertRaises(ValueError):self.wizard.start({},'test',['../../secret'])

if __name__=='__main__':unittest.main()

class DeviceDiscovery(unittest.TestCase):
 def test_startup_messages_are_not_devices(self):
  raw='* daemon started successfully\nList of devices attached\none device product:test model:X08A\ntwo unauthorized\nthree offline\n'
  with patch('installer.core.run',side_effect=['',raw]) as call:
   self.assertEqual([d['serial'] for d in core.devices('adb')],['one','two','three']);self.assertEqual(call.call_args_list[0].args[0],['adb','start-server'])
 def test_keyboard_theme_preserves_existing(self):
  d=Mock();d.shell.return_value='/storage/emulated/0/Android/data/org.fcitx.fcitx5.android/files/theme/HomeView iOS Light.json';core.seed_keyboard_theme(d,lambda _:None);d.call.assert_not_called()

class OptimizationPolicy(unittest.TestCase):
 def test_default_enabled_and_can_opt_out(self):
  c=normalize({});self.assertTrue(c['optimize_apps']);self.assertTrue(c['limit_background']);self.assertFalse(normalize({'optimize_apps':False})['optimize_apps'])
 def test_disabled_has_no_device_calls(self):
  from installer.optimization import apply
  d=Mock();result=apply(d,{'optimize_apps':False,'limit_background':False},'example.app');self.assertFalse(result['enabled']);self.assertEqual(d.mock_calls,[])
 def test_scope_backup_and_restore(self):
  from installer import optimization as opt
  class Fake:
   serial='TEST-ONLY'
   def __init__(self):self.states={p:0 for p in opt.TARGETS};self.ops={};self.calls=[]
   def package_path(self,p):return '/base.apk' if p in self.states else None
   def shell(self,*args):
    self.calls.append(args)
    if args[0]=='ime':return 'org.fcitx.fcitx5.android/.IME'
    if args[0]=='dumpsys':return 'User 0: installed=true enabled='+str(self.states[args[2]])
    if args[:3]==('cmd','appops','get'):return args[4]+': '+self.ops.get((args[3],args[4]),'default')
    if args[:3]==('cmd','appops','set'):self.ops[(args[3],args[4])]=args[5];return ''
    if args[0]=='pm':self.states[args[-1]]={'default-state':0,'enable':1,'disable':2,'disable-user':3,'disable-until-used':4}[args[1]];return ''
    return ''
  d=Fake()
  with tempfile.TemporaryDirectory() as temp,patch('installer.core.cache_dir',return_value=Path(temp)):
   report=opt.apply(d,{'optimize_apps':True,'limit_background':True},'example.app',lambda _:None);self.assertFalse(report['errors']);self.assertEqual(set(d.states.values()),{3});self.assertTrue(Path(report['restore_file']).is_file());opt.restore(d,report['restore_file'],lambda _:None);self.assertEqual(set(d.states.values()),{0});self.assertEqual(set(d.ops.values()),{'default'});self.assertTrue(all('uninstall' not in c for c in d.calls))
