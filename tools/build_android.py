#!/usr/bin/env python3
"""Build the public APK with an explicit external signing key or --unsigned."""
import argparse,hashlib,json,os,shutil,subprocess,tempfile,urllib.request,ssl,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
 p=argparse.ArgumentParser();p.add_argument('--unsigned',action='store_true');p.add_argument('--keystore',type=Path);p.add_argument('--alias',default='homeview');a=p.parse_args()
 sdk=Path(os.environ.get('ANDROID_HOME',os.environ.get('ANDROID_SDK_ROOT','')));jdk=Path(os.environ.get('JAVA_HOME',''));bt=sdk/'build-tools/35.0.0';jar=sdk/'platforms/android-28/android.jar';java=jdk/'bin'
 if not jar.is_file() or not (java/'javac').is_file() or not (bt/'aapt2').is_file():raise SystemExit('Need Android SDK 28, Build Tools 35.0.0 and JAVA_HOME JDK17')
 if not a.unsigned and (not a.keystore or not a.keystore.is_file()):raise SystemExit('Provide --keystore outside the source tree, or --unsigned')
 project=ROOT/'android-launcher';cache=ROOT/'.cache';cache.mkdir(exist_ok=True);zxing=cache/'zxing-core-3.5.3.jar';lock=json.loads((ROOT/'dependencies.json').read_text())['zxing']
 if not zxing.exists():
  ctx=ssl.create_default_context()
  if Path('/etc/ssl/cert.pem').is_file():ctx.load_verify_locations('/etc/ssl/cert.pem')
  with urllib.request.urlopen(lock['url'],context=ctx,timeout=60) as response:zxing.write_bytes(response.read(2000000))
 if hashlib.sha256(zxing.read_bytes()).hexdigest()!=lock['sha256']:raise SystemExit('ZXing checksum mismatch')
 out=ROOT/'dist';out.mkdir(exist_ok=True)
 env=dict(os.environ,JAVA_HOME=str(jdk),PATH=str(java)+os.pathsep+os.environ['PATH'])
 def run(*args):subprocess.run([str(x) for x in args],check=True,env=env,stdout=subprocess.DEVNULL)
 with tempfile.TemporaryDirectory(prefix='homeview-public-build-') as temp:
  work=Path(temp);classes=work/'classes';classes.mkdir();dex=work/'dex';dex.mkdir();assets=work/'assets';shutil.copytree(project/'assets',assets);shutil.copytree(ROOT/'frame',assets/'frame');shutil.copytree(project/'third_party',assets/'licenses')
  run(bt/'aapt2','compile','--dir',project/'res','-o',work/'res.zip');run(bt/'aapt2','link','--auto-add-overlay','--manifest',project/'AndroidManifest.xml','-I',jar,'-R',work/'res.zip','-o',work/'unsigned.apk')
  run(java/'javac','--release','8','-cp',str(jar)+os.pathsep+str(zxing),'-d',classes,*sorted((project/'src').rglob('*.java')))
  run(bt/'d8','--min-api','26','--lib',jar,'--output',dex,*sorted(classes.rglob('*.class')),zxing)
  with zipfile.ZipFile(work/'unsigned.apk','a',compression=zipfile.ZIP_DEFLATED) as z:
   for tree,prefix in [(assets,'assets'),(project/'lib','lib')]:
    for f in sorted(tree.rglob('*')):
     if f.is_file():z.write(f,prefix+'/'+str(f.relative_to(tree)))
   z.write(dex/'classes.dex','classes.dex')
  run(bt/'zipalign','-f','4',work/'unsigned.apk',work/'aligned.apk');target=out/('homeview-pro8-unsigned.apk' if a.unsigned else 'homeview-pro8.apk')
  if a.unsigned:shutil.copy2(work/'aligned.apk',target)
  else:
   if not os.environ.get('HOMEVIEW_KEY_PASSWORD'):raise SystemExit('Set HOMEVIEW_KEY_PASSWORD; do not commit signing keys')
   run(bt/'apksigner','sign','--ks',a.keystore,'--ks-key-alias',a.alias,'--ks-pass','env:HOMEVIEW_KEY_PASSWORD','--key-pass','env:HOMEVIEW_KEY_PASSWORD','--out',target,work/'aligned.apk');run(bt/'apksigner','verify',target)
 print(json.dumps({'apk':str(target),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}))
if __name__=='__main__':main()
