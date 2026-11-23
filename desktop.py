#!/usr/bin/env python3
"""Packaged Mac/Windows entry point."""
import argparse,json,sys
from pathlib import Path
from installer.webapp import serve
from installer.core import release_manifest

def main():
 p=argparse.ArgumentParser();p.add_argument('--self-test-result',type=Path);p.add_argument('--diagnose-adb',type=Path);a=p.parse_args()
 if a.diagnose_adb:
  from installer.core import find_adb,devices
  try:
   adb=find_adb(True);result={'ok':True,'devices':devices(adb)}
  except Exception as e:result={'ok':False,'error':str(e)}
  a.diagnose_adb.write_text(json.dumps(result,ensure_ascii=False));return
 if a.self_test_result:
  manifest=release_manifest();root=Path(__file__).parent;assert (root/'installer/web/index.html').is_file();assert manifest['schema']==1;
  from installer.config import normalize
  from installer.power_key import LAYOUT
  from installer.permission_overlay import PermissionOverlay
  assert normalize({})['power_key'] is True;assert LAYOUT.endswith('/pro8_power');assert 'id="power-key"' in (root/'installer/web/index.html').read_text(encoding='utf-8');assert (root/'keyboard/HomeView iOS Light.json').is_file();assert (root/'frame/hv/weather/provinces.tsv').is_file();a.self_test_result.write_text(json.dumps({'ok':True,'python':sys.version.split()[0],'platform':sys.platform}));return
 serve()
if __name__=='__main__':main()
