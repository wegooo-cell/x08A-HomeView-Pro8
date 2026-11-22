#!/usr/bin/env python3
"""Fetch the pinned corresponding-source archives, or verify an offline release bundle."""
import argparse,hashlib,json,ssl,urllib.request,shutil,tarfile,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def materialize(records,archives,output):
 mapping={'airplay':'airplay','UxPlay':'airplay/app/src/main/cpp/third_party/UxPlay','ffmpeg':'airplay/app/src/main/cpp/third_party/ffmpeg','libplist':'airplay/app/src/main/cpp/third_party/libplist','openssl-cmake':'airplay/app/src/main/cpp/third_party/openssl-cmake','openssl':'openssl','oboe':'oboe','zxing':'zxing'}
 if output.exists() and any(output.iterdir()):raise SystemExit('Choose an empty output folder')
 output.mkdir(parents=True,exist_ok=True)
 for item in records:
  dest=output/mapping[item['name']]
  with tarfile.open(archives/item['archive']) as archive:
   for m in archive.getmembers():
    parts=Path(m.name).parts[1:]
    if not parts or '..' in parts or m.issym() or m.islnk():continue
    if m.isfile():
     target=dest.joinpath(*parts);target.parent.mkdir(parents=True,exist_ok=True)
     with archive.extractfile(m) as src,target.open('wb') as sink:shutil.copyfileobj(src,sink)
     target.chmod(m.mode&0o755)
 # Upstream's patch task restores touched UxPlay files through git before patching.
 ux=output/mapping['UxPlay'];subprocess.run(['git','init',str(ux)],check=True,stdout=subprocess.DEVNULL);subprocess.run(['git','-C',str(ux),'add','.'],check=True);subprocess.run(['git','-C',str(ux),'-c','user.name=Source builder','-c','user.email=source@localhost','commit','-m','Pinned UxPlay source'],check=True,stdout=subprocess.DEVNULL)
def main():
 p=argparse.ArgumentParser();p.add_argument('--archives',type=Path,default=ROOT/'.cache/sources');p.add_argument('--offline',action='store_true');p.add_argument('--materialize',type=Path);a=p.parse_args();a.archives.mkdir(parents=True,exist_ok=True);records=json.loads((ROOT/'third_party/sources.lock.json').read_text());ctx=ssl.create_default_context()
 if Path('/etc/ssl/cert.pem').is_file():ctx.load_verify_locations('/etc/ssl/cert.pem')
 for item in records:
  target=a.archives/item['archive']
  if not target.exists():
   if a.offline:raise SystemExit('Missing '+target.name)
   with urllib.request.urlopen(item['url'],context=ctx,timeout=180) as response,target.open('wb') as sink:shutil.copyfileobj(response,sink)
  if hashlib.file_digest(target.open('rb'),'sha256').hexdigest()!=item['sha256']:raise SystemExit('Checksum mismatch: '+target.name)
  print('Verified '+item['name'])
 if a.materialize:materialize(records,a.archives,a.materialize)
if __name__=='__main__':main()
