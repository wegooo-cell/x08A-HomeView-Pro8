"""Bounded image intake. Originals stay on this computer until USB transfer."""
import struct
from pathlib import Path
from .config import ConfigError
MAX_IMAGE=24*1024*1024
MAX_TOTAL=200*1024*1024
def image_info(data):
 if not 16<=len(data)<=MAX_IMAGE:raise ConfigError('每张图片需小于 24 MB')
 w=h=0;extension=''
 if len(data)>=24 and data[:8]==b'\x89PNG\r\n\x1a\n' and data[12:16]==b'IHDR':
  w,h=struct.unpack('>II',data[16:24]);extension='png'
 elif data[:2]==b'\xff\xd8':
  extension='jpg';at=2
  while at<len(data):
   if data[at]!=255:break
   while at<len(data) and data[at]==255:at+=1
   if at>=len(data):break
   marker=data[at];at+=1
   if marker in (0xd9,0xda):break
   if marker in (1,0xd8) or 0xd0<=marker<=0xd7:continue
   if at+2>len(data):break
   size=int.from_bytes(data[at:at+2],'big')
   if size<2 or at+size>len(data):break
   if marker in (0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf) and size>=7:
    h,w=struct.unpack('>HH',data[at+3:at+7]);break
   at+=size
 elif data[:4]==b'RIFF' and data[8:12]==b'WEBP':
  extension='webp';kind=data[12:16]
  if kind==b'VP8X' and len(data)>=30:w=1+int.from_bytes(data[24:27],'little');h=1+int.from_bytes(data[27:30],'little')
  elif kind==b'VP8L' and len(data)>=25 and data[20]==47:
   bits=int.from_bytes(data[21:25],'little');w=(bits&0x3fff)+1;h=((bits>>14)&0x3fff)+1
  elif kind==b'VP8 ' and len(data)>=30 and data[23:26]==b'\x9d\x01\x2a':w=int.from_bytes(data[26:28],'little')&0x3fff;h=int.from_bytes(data[28:30],'little')&0x3fff
 if not extension or not w or not h or w*h>100000000:raise ConfigError('请选择有效 PNG、JPEG 或 WebP 图片，尺寸不超过 1 亿像素')
 return {'extension':extension,'width':w,'height':h,'bytes':len(data)}
def read_image(path):
 path=Path(path).expanduser().resolve(strict=True)
 if not path.is_file() or path.stat().st_size>MAX_IMAGE:raise ConfigError('图片文件无效或超过 24 MB')
 return path,image_info(path.read_bytes())
