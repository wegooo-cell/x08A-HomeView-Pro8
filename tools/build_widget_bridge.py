#!/usr/bin/env python3
"""Build the fixed read-only widget bridge with its explicit external signing key."""
import argparse,os,subprocess,tempfile,zipfile,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
 p=argparse.ArgumentParser();p.add_argument('--keystore',required=True,type=Path);p.add_argument('--alias',default='homeview');a=p.parse_args();sdk=Path(os.environ['ANDROID_HOME']);jdk=Path(os.environ['JAVA_HOME']);bt=sdk/'build-tools/35.0.0';jar=sdk/'platforms/android-28/android.jar';project=ROOT/'widget-bridge';out=ROOT/'dist';out.mkdir(exist_ok=True)
 env=dict(os.environ,PATH=str(jdk/'bin')+os.pathsep+os.environ['PATH'])
 def run(*args):subprocess.run(list(map(str,args)),env=env,check=True,stdout=subprocess.DEVNULL)
 with tempfile.TemporaryDirectory(prefix='homeview-compat-') as temp:
  w=Path(temp);(w/'classes').mkdir();(w/'dex').mkdir();run(bt/'aapt2','link','--manifest',project/'AndroidManifest.xml','-I',jar,'-o',w/'unsigned.apk');run(jdk/'bin/javac','--release','8','-cp',jar,'-d',w/'classes',*sorted((project/'src').rglob('*.java')));run(bt/'d8','--min-api','26','--lib',jar,'--output',w/'dex',*sorted((w/'classes').rglob('*.class')))
  with zipfile.ZipFile(w/'unsigned.apk','a',zipfile.ZIP_DEFLATED) as z:z.write(w/'dex/classes.dex','classes.dex')
  run(bt/'zipalign','-f','4',w/'unsigned.apk',w/'aligned.apk');run(bt/'apksigner','sign','--ks',a.keystore,'--ks-key-alias',a.alias,'--ks-pass','env:HOMEVIEW_KEY_PASSWORD','--key-pass','env:HOMEVIEW_KEY_PASSWORD','--out',out/'homeview-widget-bridge.apk',w/'aligned.apk');run(bt/'apksigner','verify',out/'homeview-widget-bridge.apk')
 print('Video metadata bridge built')
if __name__=='__main__':main()
