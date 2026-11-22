package dev.pro8.homeview.direct;

import java.io.IOException;

/** A completed music-service request was rejected; this is not a Wi-Fi failure. */
final class MusicServiceException extends IOException {
    final int code;
    MusicServiceException(int code){super(message(code));this.code=code;}
    private static String message(int code){
        if(code==301||code==401)return "音乐登录已过期，请重新扫码登录";
        if(code==-460||code==460||code==-462||code==462)return "音乐服务暂未允许此操作，请稍后重试；若持续出现，请在音乐设置中重新扫码登录";
        if(code==429)return "操作过于频繁，请稍后重试";
        return "音乐服务未完成操作（"+code+"），请稍后重试";
    }
}
