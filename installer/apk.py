"""Read the installed APK's Android v2/v3 signing certificate, without extra packages.
The package manager has verified installed APK signatures. Bundle files additionally
have pinned SHA256 values and were verified with Android apksigner at release time.
"""
import hashlib, struct, zipfile
from pathlib import Path

def _lp(buf, offset=0):
    if offset+4>len(buf):raise ValueError('Truncated APK length')
    n=struct.unpack_from('<I',buf,offset)[0];start=offset+4
    if start+n>len(buf):raise ValueError('Invalid APK length')
    return buf[start:start+n],start+n

def signer_sha256(path):
    with open(path,'rb') as f:
        f.seek(0,2);length=f.tell();f.seek(max(0,length-65557));tail=f.read()
        pos=tail.rfind(b'PK\x05\x06')
        if pos<0:raise ValueError('APK ZIP footer not found')
        central=struct.unpack_from('<I',tail,pos+16)[0]
        f.seek(central-24);footer=f.read(24)
        if footer[8:]!=b'APK Sig Block 42':raise ValueError('APK v2/v3 signature required')
        n=struct.unpack('<Q',footer[:8])[0]
        if n>128*1024*1024 or n<24 or n+8>central:raise ValueError('Invalid APK signing block')
        f.seek(central-n-8);block=f.read(n+8)
    if block[:8]!=footer[:8]:raise ValueError('APK signing block sizes differ')
    offset=8
    while offset<len(block)-24:
        size=struct.unpack_from('<Q',block,offset)[0];offset+=8
        if size<4 or offset+size>len(block)-24:raise ValueError('Invalid APK signing pair')
        ident=struct.unpack_from('<I',block,offset)[0];value=block[offset+4:offset+size];offset+=size
        if ident not in (0x7109871a,0xf05368c0):continue
        signers,_=_lp(value);signer,end=_lp(signers)
        if end!=len(signers):raise ValueError('Multiple APK signers are not supported')
        signed,_=_lp(signer);_,pos=_lp(signed);certificates,_=_lp(signed,pos);certificate,_=_lp(certificates)
        return hashlib.sha256(certificate).hexdigest()
    raise ValueError('APK signer not found')

def file_sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def apk_info(path):
    """Read only the binary AndroidManifest and native library ABI names."""
    with zipfile.ZipFile(path) as z:
        entry=z.getinfo('AndroidManifest.xml')
        if entry.file_size>1024*1024:raise ValueError('APK manifest too large')
        buf=z.read(entry)
        abis=sorted({n.split('/')[1] for n in z.namelist() if n.startswith('lib/') and n.endswith('.so') and len(n.split('/'))==3})
    if len(buf)<8 or struct.unpack_from('<H',buf)[0]!=3:raise ValueError('Binary AndroidManifest required')
    strings=[];result={'abis':abis};offset=struct.unpack_from('<H',buf,2)[0]
    def u16(p):return struct.unpack_from('<H',buf,p)[0]
    def u32(p):return struct.unpack_from('<I',buf,p)[0]
    def get(i):
        if i>=len(strings):raise ValueError('Invalid XML string')
        return strings[i]
    while offset+8<=len(buf):
        kind=u16(offset);head=u16(offset+2);size=u32(offset+4)
        if size<head or head<8 or offset+size>len(buf):raise ValueError('Invalid XML chunk')
        if kind==1:
            if head<28:raise ValueError('Invalid string pool')
            count=u32(offset+8);flags=u32(offset+16);start=offset+u32(offset+20)
            if count>10000 or head+count*4>size:raise ValueError('Invalid XML string count')
            for i in range(count):
                p=start+u32(offset+head+4*i)
                if p>=offset+size:raise ValueError('Invalid XML string position')
                if flags&256:
                    p+=2 if buf[p]&128 else 1
                    n=buf[p];p+=1
                    if n&128:n=((n&127)<<8)|buf[p];p+=1
                    if p+n>offset+size:raise ValueError('Invalid UTF8 string')
                    strings.append(buf[p:p+n].decode('utf-8'))
                else:
                    n=u16(p);p+=2
                    if n&32768:n=((n&32767)<<16)|u16(p);p+=2
                    if p+n*2>offset+size:raise ValueError('Invalid UTF16 string')
                    strings.append(buf[p:p+n*2].decode('utf-16le'))
        elif kind==0x102:
            if head!=16 or size<36:raise ValueError('Invalid XML element')
            tag=get(u32(offset+20));a=offset+16+u16(offset+24);stride=u16(offset+26);count=u16(offset+28)
            if stride<20 or a+stride*count>offset+size:raise ValueError('Invalid XML attributes')
            for i in range(count):
                p=a+i*stride;ns=u32(p);key=get(u32(p+4));raw=u32(p+8);type_=buf[p+15];value=u32(p+16)
                namespace='' if ns==0xffffffff else get(ns)
                v=get(raw) if raw!=0xffffffff else (get(value) if type_==3 else value)
                if tag=='manifest' and key=='package' and namespace=='':result['package']=v
                if namespace=='http://schemas.android.com/apk/res/android':
                    if tag=='manifest' and key=='versionCode':result['version_code']=int(v)
                    if tag=='uses-sdk' and key=='minSdkVersion':result['min_sdk']=int(v)
        offset+=size
    if not isinstance(result.get('package'),str) or not isinstance(result.get('version_code'),int):raise ValueError('APK identity missing')
    result.setdefault('min_sdk',1)
    return result
