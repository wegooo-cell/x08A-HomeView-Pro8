"""Disambiguate Chinese city names before using the selected location's coordinates."""
import re,unicodedata,urllib.parse
from functools import lru_cache
from pathlib import Path

@lru_cache(maxsize=1)
def provinces():
 path=Path(__file__).resolve().parents[1]/'frame/hv/weather/provinces.tsv'
 return [line.split('\t') for line in path.read_text(encoding='utf-8').splitlines() if line and not line.startswith('#')]

def plans(query):
 q=unicodedata.normalize('NFKC',query).strip();region=None
 for row in provinces():
  if row[4]=='1' and q==row[1]+'市':return [(q,'CN'),(q[:-1],'CN')]
  for alias in [row[0],*row[1].split('|')]:
   if q==alias:
    if row[4]=='1' and (alias!=row[0] or row[0].endswith('市')):return [(row[0] if row[0].endswith('市') else alias+'市','CN'),(alias[:-1] if alias.endswith('市') else alias,'CN')]
    raise ValueError('请填写具体城市，例如：'+row[0]+row[3])
   rest=q[len(alias):].lstrip(' ·,，')
   if q.startswith(alias) and len(rest)>=2:region=row;q=rest;break
  if region:break
 if not q:raise ValueError('请输入具体城市')
 suffix=', '+region[2] if region else '';country='CN' if region else ''
 # Two-character GeoNames searches are exact; the preferred city name can include 市.
 names=[q]
 if re.fullmatch(r'[\u3400-\u9fff]{2,12}市',q):names.append(q[:-1])
 if re.fullmatch(r'[\u3400-\u9fff]{2,12}',q) and not re.search(r'(?:市|县|区|镇|乡|旗|盟|州|街道)$',q):names.insert(0,q+'市')
 return [(n+suffix,country) for n in names]

def accept_name(query,name):
 # A 市 query must not accept longer names such as 上海市场社区.
 target=query.split(',')[0]
 return not re.fullmatch(r'[\u3400-\u9fff]{2,12}市',target) or name in (target,target[:-1])

def rank(code):
 return {'PPLC':0,'PPLA':1,'PPLA2':2,'PPLA3':3,'PPL':4,'PPLX':5,'PPLA4':6}.get(code,99)

def canonical_admin(value,country):
 if country=='CN':
  for full,aliases,qualifier,capital,city_name in provinces():
   if value in [full,*aliases.split('|')]:return full
 return value

def search(query,fetch):
 from .config import city
 found=[]
 for name,country in plans(query):
  params={'name':name,'count':20,'language':'zh','format':'json'}
  if country:params['countryCode']=country
  data=fetch('https://geocoding-api.open-meteo.com/v1/search?'+urllib.parse.urlencode(params));rows=[]
  for row in data.get('results',[]):
   code=row.get('feature_code','')
   if rank(code)==99 or not accept_name(name,row.get('name','')):continue
   value={k:row.get(k,'') for k in ('name','latitude','longitude','timezone','country','admin1','admin2')}
   value['admin1']=canonical_admin(value['admin1'],row.get('country_code'));value['feature_code']=code
   try:rows.append((rank(code),-int(row.get('population') or 0),city(value)))
   except (ValueError,TypeError):continue
  rows.sort(key=lambda x:(x[0],x[1]));found=[x[2] for x in rows]
  if found:break
 unique=[];seen=set()
 for row in found:
  key=(row['name'],row['latitude'],row['longitude'])
  if key not in seen:seen.add(key);unique.append(row)
 return unique[:10]
