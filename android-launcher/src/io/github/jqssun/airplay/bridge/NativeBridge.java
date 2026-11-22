package io.github.jqssun.airplay.bridge;
import java.util.Map;
/** GPL-3.0 JNI adapter for jqssun/android-airplay-server v0.0.36. */
public final class NativeBridge {
    static {System.loadLibrary("airplay_native");}
    public static native long nativeInit(Object callback,byte[] address,String name,String keyFile,boolean nohold,boolean requirePin);
    public static native int nativeStart(long h,int port);
    public static native void nativeStop(long h);
    public static native void nativeDestroy(long h);
    public static native void nativeSetDefaultStreamValues(int rate,int burst);
    public static native void nativeSetH265Enabled(long h,boolean enabled);
    public static native void nativeSetCodecs(long h,boolean alac,boolean aac);
    public static native void nativeSetHlsEnabled(long h,boolean enabled);
    public static native void nativeSetFeature(long h,int bit,boolean enabled);
    public static native void nativeSetDisplaySize(long h,int w,int height,int fps);
    public static native Map<String,String> nativeGetRaopTxtRecords(long h);
    public static native Map<String,String> nativeGetAirplayTxtRecords(long h);
    public static native String nativeGetRaopServiceName(long h);
    public static native String nativeGetServerName(long h);
    public static native boolean nativeServerAudioConfigure(long h,int cushionMs,int percentile,int buffer,boolean swAlac,boolean swAac,boolean realtime,boolean latency,boolean benchmark);
    public static native boolean nativeServerAudioStart(long h);
    public static native void nativeServerAudioStop(long h);
    public static native void nativeServerAudioFormat(long h,int ct,int spf);
    public static native void nativeServerAudioSetClientGain(long h,float gain);
}
