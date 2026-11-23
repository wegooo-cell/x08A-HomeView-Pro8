import json,tempfile,unittest
from pathlib import Path
from unittest.mock import Mock,patch
from installer import power_key as p
from installer.config import normalize,ConfigError

class PowerKey(unittest.TestCase):
 def test_default_and_home_dependency(self):
  self.assertTrue(normalize({})['power_key'])
  self.assertFalse(normalize({'set_home':False})['power_key'])
  for config in ({'power_key':1},{'power_key':True,'set_home':False}):
   with self.assertRaises(ConfigError):normalize(config)
 def test_opt_out_never_calls_device(self):
  d=Mock();self.assertFalse(p.apply(d,{'power_key':False},p.PACKAGE)['enabled']);self.assertEqual(d.mock_calls,[])
 def test_overlay_must_belong_to_pmic(self):
  raw='Event Hub State:\n    1: keyboard\n      HaveKeyboardLayoutOverlay: true\n    3: mtk-pmic-keys\n      HaveKeyboardLayoutOverlay: false\nInput Reader State:\n'
  self.assertFalse(p.overlay_active(raw));self.assertTrue(p.overlay_active(raw.replace('Overlay: false','Overlay: true')))
 def test_backup_precedes_mutation_and_missing_authorization_is_reported(self):
  d=Mock(serial='test');d.package_path.return_value='/base.apk';d.shell.return_value='Event Hub State:\n    3: mtk-pmic-keys\n      HaveKeyboardLayoutOverlay: true\nInput Reader State:'
  original={'device':'mtk-pmic-keys','descriptor':'a'*40,'current':None,'enabled_before':[]}
  with tempfile.TemporaryDirectory() as tmp,patch('installer.core.cache_dir',return_value=Path(tmp)),patch.object(p,'authorize',return_value={'status':'declined','authorized':False}),patch.object(p,'shell_entry') as entry:
   def call(device,apk,op):
    if op=='inspect':return original
    saved=list(Path(tmp).rglob('*.json'));self.assertEqual(len(saved),1);self.assertIsNone(json.loads(saved[0].read_text())['before']);return {'current':p.LAYOUT}
   entry.side_effect=call;report=p.apply(d,{'power_key':True},p.PACKAGE,lambda _:None)
   self.assertTrue(report['mapped']);self.assertFalse(report['authorized']);self.assertEqual(report['status'],'declined');self.assertFalse(report['errors'])
 def test_permission_denial_does_not_report_success(self):
  d=Mock();d.package_path.return_value='/base.apk'
  with patch.object(p,'shell_entry',side_effect=ValueError('permission denied')),patch.object(p,'authorize') as auth:
   report=p.apply(d,{'power_key':True},p.PACKAGE,lambda _:None)
  self.assertFalse(report['mapped']);self.assertTrue(report['errors']);auth.assert_not_called()
 def test_restore_refuses_other_device_before_shell_calls(self):
  d=Mock(serial='other')
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)/'record.json';path.write_text(json.dumps({'schema':1,'serial':'test'}))
   with self.assertRaises(ValueError):p.restore(d,path)
  self.assertEqual(d.mock_calls,[])
 def test_shell_error_cannot_be_mistaken_for_success(self):
  d=Mock();d.shell.return_value='warning\n{"ok":false,"error":"denied"}'
  with self.assertRaisesRegex(ValueError,'denied'):p.shell_entry(d,'/base.apk','apply')


class OverlayGuard(unittest.TestCase):
 def test_no_visible_overlay_has_no_mutation(self):
  from installer.permission_overlay import PermissionOverlay
  d=Mock();d.shell.return_value='no visible windows'
  with PermissionOverlay(d,lambda _:None):pass
  self.assertEqual(d.shell.call_count,1);d.call.assert_not_called()
 def test_watchdog_and_finally_restore_original_mode(self):
  from installer.permission_overlay import PermissionOverlay
  class Fake:
   serial='test'
   def __init__(self):self.mode='default';self.calls=[];self.script=''
   def call(self,*args):
    raw=Path(args[1]).read_bytes();assert b'\r' not in raw;self.script=raw.decode('utf-8');self.calls.append(args);return ''
   def shell(self,*args,**kw):
    self.calls.append(args)
    if args[:3]==('dumpsys','window','windows'):return 'Window #1 package=com.android.systemui appop=SYSTEM_ALERT_WINDOW isOnScreen=true'
    if args[:3]==('cmd','appops','get'):return 'SYSTEM_ALERT_WINDOW: '+self.mode
    if args[:3]==('cmd','appops','set'):self.mode=args[-1];return ''
    if args[0]=='cat':return 'ready'
    return ''
  d=Fake()
  with tempfile.TemporaryDirectory() as tmp,patch('installer.core.cache_dir',return_value=Path(tmp)):
   with self.assertRaisesRegex(ValueError,'test'):
    with PermissionOverlay(d,lambda _:None):
     self.assertEqual(d.mode,'ignore');self.assertIn('150',d.script);self.assertIn('SYSTEM_ALERT_WINDOW default',d.script);raise ValueError('test')
  self.assertEqual(d.mode,'default');self.assertFalse(any('set-active-admin' in a for call in d.calls for a in call))
