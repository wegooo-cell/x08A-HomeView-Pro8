/* One NetEase player. A failed address stops and waits for an explicit retry. ES5. */
(function(root){'use strict';
function Playback(audio,options){
  var track=null,seq=0,wanted=false,busy=false,abort=null,timer=0,resumeAt=0,good=false,closed=false;
  var timeout=options.timeout||12000,setTimer=options.setTimeout||setTimeout,clearTimer=options.clearTimeout||clearTimeout;
  function emit(error){options.change({playing:wanted&&!audio.paused,loading:busy,error:error||''});}
  function clearWatch(){if(timer){clearTimer(timer);timer=0;}}
  function cancel(){++seq;clearWatch();if(abort){abort.abort();abort=null;}busy=false;}
  function current(n){return !closed&&n===seq&&wanted&&!!track;}
  function remember(){if(good&&isFinite(audio.currentTime))resumeAt=Math.max(0,audio.currentTime);}
  function fail(message){remember();cancel();wanted=false;audio.pause();audio.removeAttribute('src');audio.load();good=false;emit(message||'音乐暂时无法播放，轻点播放可重试');}
  function watch(n){if(timer||!current(n)||audio.paused&&!busy)return;var at=audio.currentTime;
    timer=setTimer(function(){timer=0;if(!current(n))return;if(audio.currentTime>at+.1){watch(n);return;}fail('播放响应超时，轻点播放可重试');},timeout);
  }
  function rejected(e,n){if(!current(n)||e&&e.name==='AbortError')return;fail(e&&e.name==='NotAllowedError'?'轻点播放继续':'音乐音频暂时无法播放，轻点播放可重试');}
  function start(n){if(!current(n))return;var promise;busy=true;emit();try{promise=audio.play();}catch(e){rejected(e,n);return;}
    Promise.resolve(promise).then(function(){if(current(n)){busy=false;emit();watch(n);}},function(e){rejected(e,n);});
  }
  function request(){var n=seq,requestedTrack=track;busy=true;emit();abort=typeof AbortController!=='undefined'?new AbortController():null;
    var signal=abort?abort.signal:undefined;timer=setTimer(function(){timer=0;if(current(n))fail('音乐播放地址请求超时，轻点播放可重试');},10000);
    Promise.resolve().then(function(){if(!current(n))return null;return options.primary(requestedTrack,signal);}).then(function(d){
      if(!current(n))return;abort=null;clearWatch();
      if(!d||!d.available||typeof d.url!=='string'||!/^https:\/\/[a-z0-9.-]+\.music\.126\.net\//i.test(d.url)){fail(d&&d.reason||'音乐暂未提供完整播放地址，轻点播放可重试');return;}
      good=false;audio.src=d.url;start(n);watch(n);
    },function(e){if(current(n)&&!(e&&e.name==='AbortError'))fail('暂时无法取得音乐播放地址，轻点播放可重试');});
  }
  function select(t){cancel();wanted=false;track=t;resumeAt=0;good=false;audio.pause();audio.removeAttribute('src');audio.load();emit();}
  function play(t){if(closed)return;if(!track||!t||String(track.id)!==String(t.id))select(t);if(!track||wanted&&busy)return;
    cancel();wanted=true;if(audio.getAttribute('src')&&!audio.error){start(seq);return;}audio.removeAttribute('src');audio.load();request();
  }
  function pause(){remember();cancel();wanted=false;audio.pause();emit();}
  function metadata(){if(!wanted||!track||resumeAt<=0)return;var duration=audio.duration;if(isFinite(duration)&&duration>0)resumeAt=Math.min(resumeAt,Math.max(0,duration-.1));try{audio.currentTime=resumeAt;}catch(ignore){}}
  function playing(){if(!wanted)return;busy=false;good=true;if(options.onPlaying)options.onPlaying(track);emit();watch(seq);}
  function error(){if(audio.getAttribute('src')&&audio.error&&audio.error.code!==1&&wanted)fail('音乐音频不可播，轻点播放可重试');}
  function waiting(){if(wanted)watch(seq);}
  function nativePause(){if(wanted&&!busy&&audio.paused)pause();}
  function ended(){remember();wanted=false;cancel();emit();}
  var events={loadedmetadata:metadata,playing:playing,error:error,waiting:waiting,stalled:waiting,pause:nativePause,ended:ended};
  Object.keys(events).forEach(function(k){audio.addEventListener(k,events[k]);});
  this.select=select;this.play=play;this.pause=pause;this.waiting=function(){return wanted&&busy;};
  this.stop=function(){pause();track=null;resumeAt=0;good=false;audio.removeAttribute('src');audio.load();};
  this.dispose=function(){this.stop();closed=true;Object.keys(events).forEach(function(k){audio.removeEventListener(k,events[k]);});};
}
root.HVNetEasePlayback=Playback;if(typeof module!=='undefined'&&module.exports)module.exports=Playback;
})(typeof window!=='undefined'?window:globalThis);
