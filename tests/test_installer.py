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
   result=core.deploy({'set_home':False},adb='adb',manifest={'homeview':{'package':'example.app','version_code':169}},log=lambda _:None)
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
