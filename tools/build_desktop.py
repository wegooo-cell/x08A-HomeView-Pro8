#!/usr/bin/env python3
"""Run on each target OS; creates an executable and tests its bundled resources."""
import hashlib,json,os,platform,subprocess,sys,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
 system=platform.system();arch='arm64' if platform.machine().lower() in ('arm64','aarch64') else 'x64';out=ROOT/'dist';out.mkdir(exist_ok=True)
 args=[sys.executable,'-m','PyInstaller','--noconfirm','--clean','--windowed','--name','HomeView-Installer','--specpath',str(ROOT/'build/spec'),'--distpath',str(out/'desktop'),'--workpath',str(ROOT/'build/desktop'),'--add-data',str(ROOT/'installer/web')+':installer/web','--add-data',str(ROOT/'release.json')+':.','--add-data',str(ROOT/'keyboard')+':keyboard','--add-data',str(ROOT/'frame/hv/weather/provinces.tsv')+':frame/hv/weather']
 if system=='Darwin':args+=['--onedir','--osx-bundle-identifier','io.github.wegooo-cell.homeview.installer']
 elif system=='Windows':args+=['--onefile']
 else:raise SystemExit('Build the desktop installer on Windows or macOS')
 resources=ROOT/'build/resources';resources.mkdir(parents=True,exist_ok=True)
 import builtins
 builtins.license._Printer__setup()
 (resources/'PYTHON-LICENSE.txt').write_text('\n'.join(builtins.license._Printer__lines),encoding='utf-8')
 args+=['--icon',str(ROOT/'installer/resources'/('homeview.icns' if system=='Darwin' else 'homeview.ico')),'--add-data',str(ROOT/'LICENSE')+':.','--add-data',str(resources/'PYTHON-LICENSE.txt')+':.']
 env=dict(os.environ,PYINSTALLER_CONFIG_DIR=str(ROOT/'.cache/pyinstaller'))
 subprocess.run(args+[str(ROOT/'desktop.py')],cwd=ROOT,check=True,env=env)
 if system=='Darwin':exe=out/'desktop/HomeView-Installer.app/Contents/MacOS/HomeView-Installer'
 else:exe=out/'desktop/HomeView-Installer.exe'
 result=out/'desktop-self-test.json';subprocess.run([str(exe),'--self-test-result',str(result)],timeout=90,check=True);assert json.loads(result.read_text())['ok']
 if system=='Darwin':
  target=out/('HomeView-macOS-'+arch+'.zip');subprocess.run(['ditto','-c','-k','--sequesterRsrc','--keepParent',str(out/'desktop/HomeView-Installer.app'),str(target)],check=True)
 else:
  target=out/'HomeView-Windows-x64.zip'
  with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as archive:archive.write(exe,exe.name)
 digest=hashlib.sha256(target.read_bytes()).hexdigest();target.with_suffix('.sha256').write_text(digest+'  '+target.name+'\n');print(json.dumps({'artifact':str(target),'sha256':digest,'self_test':True}))
if __name__=='__main__':main()
