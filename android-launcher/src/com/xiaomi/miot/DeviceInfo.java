package com.xiaomi.miot;

import android.os.Bundle;
import android.os.Parcel;
import android.os.Parcelable;

/** Independent receive-only decoder for the Pro8 built-in service's Parcel format. */
public final class DeviceInfo implements Parcelable {
    public final String did,name,subtitle,model;
    public final boolean online,canSwitch,on;
    public final Bundle subtitles;
    private DeviceInfo(Parcel p){
        did=p.readString();p.readString();name=p.readString();p.readString();subtitle=p.readString();
        p.readString();p.readString();online=p.readInt()!=0;
        subtitles=p.readBundle(DeviceInfo.class.getClassLoader());canSwitch=p.readInt()!=0;on=p.readInt()!=0;model=p.readString();
    }
    public int describeContents(){return 0;}
    public void writeToParcel(Parcel p,int flags){throw new UnsupportedOperationException("Receive only");}
    public static final Creator<DeviceInfo> CREATOR=new Creator<DeviceInfo>(){
        public DeviceInfo createFromParcel(Parcel p){return new DeviceInfo(p);}
        public DeviceInfo[] newArray(int n){if(n<0||n>2048)throw new IllegalArgumentException("Device count");return new DeviceInfo[n];}
    };
}
