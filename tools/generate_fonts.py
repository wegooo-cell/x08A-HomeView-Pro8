#!/usr/bin/env python3
"""Build OFL Source Han Sans web fonts; requires fonttools[woff]."""
import argparse,hashlib,json,urllib.request,ssl
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
ROOT=Path(__file__).resolve().parents[1]
COMMIT='a4f7cf94edfb9d7ffbdfc4841de276358bd7e0f2'
SOURCES={'regular':('Regular','e2bc8a2e7f37474b774fff8db758681ece40bb6947a90d571bce9dd60671a8e4'),'semibold':('Bold','62383707c086a32f3afd5e293f34c7eff64c7fea31f579fdc6cbe34d920519a6')}
def rename(font,weight):
 family='HomeView Sans';style='Regular' if weight=='Regular' else 'Bold'
 for record in font['name'].names:
  if record.nameID in (1,2,3,4,6,16,17):
   value={1:family,2:style,3:family+' '+style+' 2.005 subset',4:family+' '+style,6:'HomeViewSans-'+style,16:family,17:style}[record.nameID]
   record.string=value.encode(record.getEncoding(),errors='replace')
 if 'CFF ' in font:
  font['CFF '].cff.fontNames=['HomeViewSans-'+style]
  top=font['CFF '].cff.topDictIndex[0];top.FamilyName=family;top.FullName=family+' '+style
 return font
def ranges(points):
 spans=[]
 for p in sorted(points):
  if spans and p==spans[-1][1]+1:spans[-1][1]=p
  else:spans.append([p,p])
 return ','.join('U+%X'%a if a==b else 'U+%X-%X'%(a,b) for a,b in spans)
def main():
 p=argparse.ArgumentParser();p.add_argument('--source-dir',type=Path);a=p.parse_args();dest=ROOT/'frame/hv/fonts';dest.mkdir(parents=True,exist_ok=True);cache=ROOT/'.cache/fonts';cache.mkdir(parents=True,exist_ok=True)
 common=set(range(0x3400))|set(range(0xff00,0xffef))
 for x in range(0xa1,0xf8):
  for y in range(0xa1,0xff):
   try:common.update(map(ord,bytes([x,y]).decode('gb2312')))
   except UnicodeDecodeError:pass
 css=[];records=[]
 for face,(weight,digest) in SOURCES.items():
  name=f'SourceHanSansCN-{weight}.otf';source=(a.source_dir or cache)/name;url=f'https://raw.githubusercontent.com/adobe-fonts/source-han-sans/{COMMIT}/SubsetOTF/CN/{name}'
  if not source.exists():
   context=ssl.create_default_context()
   if Path('/etc/ssl/cert.pem').is_file():context.load_verify_locations('/etc/ssl/cert.pem')
   with urllib.request.urlopen(url,context=context,timeout=60) as response:source.write_bytes(response.read(16000000))
  if hashlib.sha256(source.read_bytes()).hexdigest()!=digest:raise SystemExit('Font source checksum mismatch')
  points=set(TTFont(source).getBestCmap())
  for part,codes in [('common',points&common),('extended',points-common)]:
   font=rename(TTFont(source),weight);o=subset.Options();o.name_IDs=['*'];sub=subset.Subsetter(options=o);sub.populate(unicodes=codes);sub.subset(font);font.flavor='woff2';target=dest/f'homeview-{face}-{part}.woff2';font.save(target)
   for family in ['HomeView Sans','HomeView Clock']:
    for w in ([100,200,300,400,500] if face=='regular' else [600,700,800,900]):css.append(f'@font-face{{font-family:"{family}";src:url(/frame/hv/fonts/{target.name}) format("woff2");font-weight:{w};font-style:normal;font-display:swap;unicode-range:{ranges(codes)}}}')
  if face=='regular':
   font=rename(TTFont(source),weight);sub=subset.Subsetter();sub.populate(unicodes=range(0x20,0x3b));sub.subset(font);font.flavor='woff2';font.save(dest/'homeview-digits.woff2')
  records.append({'family':'Source Han Sans CN','version':'2.005','license':'OFL-1.1','source':url,'sha256':digest})
 (dest/'homeview-fonts.css').write_text('\n'.join(css)+'\n');(dest/'SOURCE.json').write_text(json.dumps(records,indent=2)+'\n');print('Source Han Sans public font subsets generated')
if __name__=='__main__':main()
