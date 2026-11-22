/* ES5 for Pro 8's Android 9 WebView. Account cookie never enters this page. */
(function(){
  var app=document.getElementById('music-app'),audio=document.getElementById('music-audio');
  if(window.parent!==window&&/[?&]hosted=1(?:&|$)/.test(location.search)){document.documentElement.classList.add('hosted-player');HV.setHostState(false,false);}
  var vinyl=new URLSearchParams(location.search).get('skin')==='vinyl'||location.pathname.indexOf('/vinyl/')>=0,vinylPlayer=false;
  document.documentElement.classList.toggle('vinyl-skin',vinyl);
  var lite=/Pro8HomeView\//.test(navigator.userAgent)||document.documentElement.classList.contains('legacy-webview');
  if(lite)document.documentElement.classList.add('pro8-lite');
  var S={status:null,lists:[],tracks:[],list:null,selected:null,playing:false,loading:false,error:'',search:'',searchType:'song',searchItems:[],searching:false,searchError:'',browseTracks:[],detail:null,detailLoading:false,lyrics:null,lyricsOpen:false,libraryOpen:false,controlsVisible:true,qr:null,section:'mine',recommended:null,daily:null,dailyDate:'',discoveryBusy:false,discoveryError:''};
  var hostVisible=window.parent===window,lastHostState='',external=null,externalKey='',localLyrics=null,lyricSeq=0,lyricTimer=0,remoteBusy=false;
  var remoteLyricCache=[],remoteLyricKey='';
  var likes=null,likesAt=0,likesPromise=null,likesSeq=0,likeJobs={},likedDirty=false;
  var listSeq=0,queueOwner=null,advanceEpoch=0,librarySync=null,libraryText='',myListsJob=null;
  var session,pendingResume=null,sessionSwitching=false,lastPositionWrite=0;
  try{session=new HVMusicSession(localStorage);}catch(ignore){session=new HVMusicSession(null);}
  function sessionAccount(){return S.status&&S.status.signed_in?(S.status.name||'网易云音乐'):'';}
  function rememberSession(){if(!external)session.save(sessionAccount(),S.selected||S.tracks[0],S.tracks,queueOwner);}
  function rememberPosition(force,allowZero){if(external||sessionSwitching||!sessionAccount())return;var t=selected(),now=Date.now();if(!t||!force&&now-lastPositionWrite<10000)return;var pos=currentPosition();if(!allowZero&&pos===0&&!pendingResume&&session.cursor(t.id)>0)return;lastPositionWrite=now;session.position(t.id,pos);}
  function applyResume(){if(!pendingResume||external||!selected()||String(selected().id)!==pendingResume.id||audio.readyState<1)return;var time=pendingResume.time,duration=audio.duration;if(isFinite(duration)&&duration>0)time=Math.min(time,Math.max(0,duration-.1));try{audio.currentTime=time;pendingResume=null;updateProgress();}catch(ignore){}}
  var savedOrder='sequence';try{savedOrder=localStorage.getItem('homeview:music-mode:v1')||savedOrder;}catch(ignore){}
  var order=new HVMusicOrder(savedOrder),orderNames={sequence:'顺序播放',loop:'列表循环',one:'单曲循环',shuffle:'随机播放'};
  var ORDER_REPEAT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 7h13l-3-3M19 17H6l3 3M19 7v5M5 17v-5"/></svg>';
  var ORDER_SHUFFLE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h3c5 0 6 12 11 12h4m-3-3 3 3-3 3M3 18h3c2 0 4-3 6-6s3-6 5-6h4m-3-3 3 3-3 3"/></svg>';
  var ORDER_SEQUENCE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16M4 11h16M4 17h11m2-3 4 3-4 3"/></svg>';
  function orderIcon(){return order.mode==='shuffle'?ORDER_SHUFFLE:order.mode==='sequence'?ORDER_SEQUENCE:ORDER_REPEAT+(order.mode==='one'?'<em>1</em>':'');}
  function syncOrder(){order.queue(S.tracks.map(function(t){return t.id;}));var t=selected(),i=S.tracks.findIndex(function(x){return t&&x.id===t.id;});if(i>=0)order.select(i);return Math.max(0,i);}
  function changeOrder(){var modes=['sequence','loop','one','shuffle'];order.setMode(modes[(modes.indexOf(order.mode)+1)%modes.length]);syncOrder();try{localStorage.setItem('homeview:music-mode:v1',order.mode);}catch(ignore){}HV.toast(orderNames[order.mode]);render();}
  function advancePlayback(direction,ended){
    if(external){remoteControl(direction>0?'next':'previous');return;}var epoch=++advanceEpoch,i=syncOrder();
    if(direction<0&&i===0&&queueOwner&&queueOwner.offset>0&&order.mode!=='shuffle'){
      var previousOwner=queueOwner,previousId=selected()&&selected().id;
      earlierPlaylist(previousOwner).then(function(){if(epoch===advanceEpoch&&queueOwner===previousOwner&&selected()&&selected().id===previousId)advancePlayback(direction,ended);},function(e){if(epoch===advanceEpoch)HV.toast(e.message||'前面的曲目加载失败，请重试');});return;
    }
    if(direction>0&&i===S.tracks.length-1&&queueOwner&&queueOwner.has_more&&order.mode!=='shuffle'&&!(ended&&order.mode==='one')){
      var owner=queueOwner,sid=selected()&&selected().id;
      morePlaylist(owner).then(function(){if(epoch===advanceEpoch&&queueOwner===owner&&selected()&&selected().id===sid)advancePlayback(direction,ended);},function(e){if(epoch===advanceEpoch)HV.toast(e.message||'后续曲目加载失败，请重试');});return;
    }
    var next=order.step(i,direction,!!ended);
    if(next===null){S.playing=false;if(!ended)HV.toast(direction>0?'已到歌单末尾':'已到歌单开头');render();return;}
    if(next===i){if(ended){try{audio.currentTime=0;}catch(ignore){}play();}return;}choose(next,true);
  }

  function setSkin(on){if(vinyl===on)return;vinyl=on;vinylPlayer=false;if(on)S.lyricsOpen=false;document.documentElement.classList.toggle('vinyl-skin',on);document.title=on?'黑胶音乐':'音乐';finishCoverFade();renderedSong='';renderedCovers='';S.controlsVisible=true;mount();render();noteActivity();}
  var lastClockArt='';
  function clockCoverArt(){
    var out=[],seen={},groups=[S.tracks,S.browseTracks,S.lists,S.recommended||[],S.daily||[]];
    for(var g=0;g<groups.length&&out.length<28;g++)for(var i=0;i<groups[g].length&&i<160&&out.length<28;i++){
      var u=groups[g][i]&&groups[g][i].art;if(typeof u==='string'&&/^https?:\/\/[a-z0-9.-]+\.music\.126\.net\//i.test(u)&&!seen[u]){seen[u]=true;out.push(u);}
    }
    var key=JSON.stringify(out);if(out.length&&key!==lastClockArt){lastClockArt=key;try{localStorage.setItem('homeview:clock-cover-art:v1',key);}catch(ignore){}}
    return out;
  }
  function publishState(){
    var collageArt=clockCoverArt();
    if(window.parent===window)return;var t=selected(),state={ready:!!((external||S.status&&S.status.signed_in)&&t),signedIn:S.status?!!S.status.signed_in:null,playing:external?!!external.streaming&&external.playing!==false:S.playing,loading:S.loading,error:S.error,track:t?{id:t.id,title:t.title,artist:t.artist,art:t.art}:null};
    var at=S.tracks.findIndex(function(x){return t&&x.id===t.id;});state.coverArt=collageArt;state.skin=vinyl?'vinyl':'classic';state.nearby=external||at<0?[]:S.tracks.slice(Math.max(0,at-2),at+3).map(function(x,j){return {track:{id:x.id,title:x.title,artist:x.artist,art:x.art},offset:Math.max(0,at-2)+j-at};});
    var key=JSON.stringify(state);if(key===lastHostState)return;lastHostState=key;
    window.parent.postMessage({type:'hv-music:state',state:state},location.origin);
  }
  var PLAY='<svg viewBox="0 0 24 24"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>';
  var PAUSE='<svg viewBox="0 0 24 24"><rect x="5.5" y="4" width="4.5" height="16" rx="1.2"/><rect x="14" y="4" width="4.5" height="16" rx="1.2"/></svg>';
  var NEXT='<svg viewBox="0 0 24 24"><path d="M3 6.2v11.6a.8.8 0 0 0 1.2.7L13 13v4.8a.8.8 0 0 0 1.2.7l8.6-5.8a.8.8 0 0 0 0-1.4L14.2 5.5A.8.8 0 0 0 13 6.2V11L4.2 5.5A.8.8 0 0 0 3 6.2z"/></svg>';
  var PREV='<svg viewBox="0 0 24 24"><path d="M21 6.2v11.6a.8.8 0 0 1-1.2.7L11 13v4.8a.8.8 0 0 1-1.2.7L1.2 12.7a.8.8 0 0 1 0-1.4l8.6-5.8A.8.8 0 0 1 11 6.2V11l8.8-5.5a.8.8 0 0 1 1.2.7z"/></svg>';
  var VOLUME='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>';
  var LIST='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h9M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>';
  // AirPlay Audio vector, Simple Icons CC0; source retained in third_party/simple-icons.
  var AIRPLAY='<svg viewBox="-1 -1 26 26" aria-hidden="true" focusable="false"><path fill="currentColor" stroke="none" d="M11.908.183a12.012 12.012 0 00-8.044 3.172c-4.882 4.475-5.166 12.08-.692 16.962.204.244.448.447.692.692a.315.315 0 00.408-.04l.53-.61a.32.32 0 000-.448C.53 15.965.243 9.253 4.23 4.982 8.217.711 14.889.427 19.16 4.414c4.271 3.986 4.555 10.655.568 14.927-.203.203-.365.407-.568.57a.32.32 0 000 .447l.53.611a.37.37 0 00.446.04c4.882-4.516 5.166-12.081.692-16.962a11.98 11.98 0 00-8.92-3.864zm.387 3.518A8.607 8.607 0 006.143 6c-3.458 3.213-3.66 8.623-.447 12.08.122.123.243.285.406.407a.319.319 0 00.447 0l.53-.61a.32.32 0 000-.446A7.263 7.263 0 014.8 12.183c0-3.946 3.212-7.16 7.158-7.16s7.16 3.253 7.16 7.199a7.207 7.207 0 01-2.238 5.209.319.319 0 000 .447l.529.61c.122.121.325.162.447.04a8.599 8.599 0 00.408-12.122 8.494 8.494 0 00-5.97-2.705zm-.266 3.316A5.198 5.198 0 008.34 8.48c-2.075 1.993-2.115 5.247-.122 7.322l.121.123a.319.319 0 00.447 0l.53-.611a.32.32 0 000-.448 3.814 3.814 0 01-1.098-2.683 3.732 3.732 0 013.742-3.742 3.732 3.732 0 013.742 3.742c0 1.017-.406 1.951-1.139 2.683a.32.32 0 000 .448l.53.61a.32.32 0 00.447 0c2.034-1.992 2.116-5.246.123-7.321a5.128 5.128 0 00-3.633-1.586zm.006 7.744a.599.599 0 00-.402.146l-.04.041-7.159 8.055a.506.506 0 00.041.69.437.437 0 00.283.124h14.36a.495.495 0 00.489-.488.463.463 0 00-.121-.326l-7.08-8.055a.5.5 0 00-.37-.187z"/></svg>';
  var LYRICS='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M4.5 4.5h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10l-5.5 3v-3a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2Z"/><path d="M8.5 9.5h2.5v2.3l-1.6 2.3m4.3-4.6h2.5v2.3l-1.6 2.3"/></svg>';
  var NOTE='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg>';
  var HEART='<svg viewBox="0 0 24 24" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 4.8a5.5 5.5 0 0 0-7.8 0l-.7.7-.7-.7a5.5 5.5 0 0 0-7.8 7.8L12 21l8.5-8.4a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
  function esc(x){return HV.esc(x==null?'':x);}
  function api(path,signal){return HVJson('/api/frame/netease/'+path,signal).then(function(d){if(d&&d.ok===false)throw new Error(d.error||'请求失败');return d;});}
  var playback=new HVNetEasePlayback(audio,{
    primary:function(track,signal){return api('play-url?id='+encodeURIComponent(track.id),signal);},
    onPlaying:function(track){if(!external)session.markPlayed(track);},
    change:function(state){S.playing=state.playing;S.loading=state.loading;S.error=state.error;render();}
  });
  function safeArt(url){url=String(url||'');if(/^\/api\/airplay\/art\?v=\d+$/.test(url))return url;if(!/^https?:\/\/[a-z0-9.-]+\.music\.126\.net\//i.test(url))return '';return url.replace(/^http:/i,'https:');}
  function artUrl(url,size,ambient){url=safeArt(url);if(url.indexOf('/api/airplay/art?')===0)return url+(ambient?'&ambient=1':'');return url?'/api/frame/netease/art?url='+encodeURIComponent(url)+'&size='+(size||96)+(ambient?'&ambient=1':''):'';}
  function art(url,size){url=artUrl(url,size);return url?'<img src="'+esc(url)+'" alt="" decoding="async">':'';}
  function bg(url){url=artUrl(url,96,true);return url?' style="background-image:url(\''+esc(url)+'\')"':'';}
  function selected(){return external?external.track:S.selected||S.tracks[0]||null;}
  function renderLike(){
    var button=app.querySelector('[data-like]'),s=selected();if(!button)return;
    var liked=!!(likes&&s&&likes[String(s.id)]),busy=!!(s&&likeJobs[String(s.id)]);
    button.classList.toggle('on',liked);button.disabled=!s||!!external||!(S.status&&S.status.signed_in)||!!s.unavailable||busy||!likes&&!!likesPromise;
    button.setAttribute('aria-pressed',String(liked));button.setAttribute('aria-busy',String(busy));
    button.title=liked?'取消喜欢':likes?'收藏到我喜欢的音乐':'读取喜欢状态';button.setAttribute('aria-label',button.title);
  }
  function loadLikes(force){
    if(!(S.status&&S.status.signed_in))return Promise.resolve();if(likesPromise)return likesPromise;
    if(!force&&likes&&Date.now()-likesAt<60000)return Promise.resolve();var seq=++likesSeq;
    likesPromise=api('likes').then(function(d){if(seq===likesSeq){var map={};(d.ids||[]).forEach(function(id){map[String(id)]=true;});likes=map;likesAt=Date.now();}},function(e){throw e;}).then(function(){likesPromise=null;renderLike();},function(e){likesPromise=null;renderLike();throw e;});renderLike();return likesPromise;
  }
  function toggleLike(){
    var s=selected();if(!s||external||s.unavailable||!(S.status&&S.status.signed_in))return;
    if(!likes){var waiting=String(s.id);loadLikes(true).then(function(){if(selected()&&String(selected().id)===waiting)toggleLike();},function(e){HV.toast(e.message||'暂时无法读取喜欢状态');});return;}
    var id=String(s.id);if(likeJobs[id])return;var desired=!likes[id];++likesSeq;
    likeJobs[id]=HV.post('/api/frame/netease/like',{id:id,like:desired}).then(function(d){
      if(d.id!==id||d.liked!==desired)throw new Error('收藏状态未确认，请重试');
      if(desired)likes[id]=true;else delete likes[id];likesAt=Date.now();likedDirty=true;
    }).then(function(){delete likeJobs[id];renderLike();},function(e){delete likeJobs[id];renderLike();HV.toast(e.message||'暂时无法修改喜欢状态');});renderLike();
  }
  var details=new HVMusicDetails(app,{track:selected,api:api,esc:esc,art:artUrl,isOpen:function(){return S.lyricsOpen;}});
  function openLibrary(){S.libraryOpen=true;render();refreshDiscoveryIfDue();loadLikes(false).catch(function(){});if(likedDirty&&S.section==='mine'&&!S.search.trim()&&!S.detail&&S.list&&S.list.is_liked){likedDirty=false;loadList(S.list.id);}}
  function fmt(n){return HV.mmss(Math.floor(n||0));}
  function coverMarkup(){
    if(vinyl&&!vinylPlayer)return '';
    var s=selected(),idx=-1,i,out='';for(i=0;i<S.tracks.length;i++)if(s&&S.tracks[i].id===s.id){idx=i;break;}
    var center=gesture?gesture.windowIndex:idx,anchor=gesture?gesture.startIndex:idx,dx=gesture?gesture.dx:0,moving=!!(gesture&&gesture.moved);
    for(i=moving?-3:0;i<=(moving?3:0);i++){var t=idx>=0?S.tracks[center+i]:i===0?s:null,offset=center+i-anchor;if(t){var p=coverPose(offset,dx,moving);out+='<div class="cm-art-card" data-song-id="'+esc(t.id)+'" data-offset="'+offset+'" style="transform:'+p.transform+';opacity:'+p.opacity+';z-index:'+p.z+'">'+(safeArt(t.art)?art(t.art,lite?(t.id!==s.id?256:512):768):NOTE)+'</div>';}}
    return out;
  }
  function mount(){
    var previousSearch=document.getElementById('cm-search'),restoreSearch=previousSearch&&document.activeElement===previousSearch,caret=previousSearch&&previousSearch.selectionStart;
    var s=selected(),url=s&&safeArt(s.art),signed=S.status&&S.status.signed_in,idx=-1,i,covers='';
    for(i=0;i<S.tracks.length;i++)if(s&&S.tracks[i].id===s.id){idx=i;break;}
    covers=coverMarkup();
    var h='<div class="cm-atmosphere"><div class="cm-backdrop on"'+(url?bg(url):'')+'></div><div class="cm-backdrop"></div><div class="cm-shade"></div></div>'+
      '<div class="hv-scene-content" data-hv-scene-content><header class="cm-top"><a href="/frame/hv/">‹ 首页</a><div class="cm-mode"><button class="'+(S.libraryOpen?'':'on')+'" data-panel-close="1">正在播放</button><button class="'+(S.libraryOpen?'on':'')+'" data-library="1">资料库</button></div><div class="cm-spacer"></div>'+
      '<span class="cm-account">'+esc('音乐')+'</span></header>'+
      '<div class="cm-body"><section class="cm-player"><div class="cm-hero"><div class="cm-art-clip"><div class="cm-art-stage" data-art-stage="1">'+covers+'</div></div>'+
      '<div class="cm-lyrics-inline"><div class="cm-lyrics-heading"><b>'+esc(s?s.title:'')+'</b><span>'+esc(s?s.artist:'')+'</span></div><div id="cm-lyrics-text">正在读取歌词…</div></div><div class="cm-meta">'+
      '<div class="cm-song">'+esc(s?s.title:'你的音乐')+'</div>'+
      '<div class="cm-artist">'+esc(s?s.artist:'在 Pro 8 上浏览歌单与音乐')+'</div><div class="cm-album">'+esc(s?s.album:'连接音乐账号后开始')+'</div></div></div>'+
      '<div class="cm-progress-wrap"><div class="cm-progress" data-seek="1"><div class="cm-progress-track"><div class="cm-progress-fill" id="cm-fill"></div></div></div>'+
      '<div class="cm-times"><span id="cm-elapsed">0:00</span><span id="cm-remain">'+fmt(s&&s.duration)+'</span></div></div>'+
      '<div class="cm-controls"><button class="cm-side-button cm-lyrics-button" data-lyrics="1" aria-label="歌曲评论" title="歌曲评论" aria-haspopup="dialog"'+(s?'':' disabled')+'>'+LYRICS+'</button><button class="cm-side-button cm-order-button" data-order="1" aria-label="'+orderNames[order.mode]+'" title="'+orderNames[order.mode]+'">'+orderIcon()+'</button><button class="cm-side-button cm-like-button" data-like="1" aria-label="收藏到我喜欢的音乐" aria-pressed="false" disabled>'+HEART+'</button><div class="cm-transport"><button data-skip="-1" aria-label="上一首"'+(s?'':' disabled')+'>'+PREV+'</button><button class="cm-play" data-toggle="1" aria-label="'+(S.playing?'暂停':'播放')+'"'+(s?'':' disabled')+'>'+(S.playing?PAUSE:PLAY)+'</button><button data-skip="1" aria-label="下一首"'+(s?'':' disabled')+'>'+NEXT+'</button></div><button class="cm-side-button cm-airplay-button" data-airplay-open="1" aria-label="AirPlay 接收" title="AirPlay">'+AIRPLAY+'</button><button class="cm-side-button cm-list-button" data-library="1" aria-label="播放列表" title="播放列表">'+LIST+'</button></div>'+
      '<div class="cm-note" role="status" aria-live="polite"'+(S.error?'':' hidden')+'>'+esc(S.error)+'</div></section>'+
      '<canvas class="cm-library-snapshot" aria-hidden="true"></canvas><div class="cm-panel-shade'+(S.libraryOpen?' on':'')+'" data-panel-close="1"></div><section class="cm-library'+(S.libraryOpen?' on':'')+'" role="dialog" aria-modal="true" aria-label="音乐资料库"><div class="cm-library-head"><h2>资料库</h2><div class="cm-sync-tools"><span class="cm-sync-status" role="status"></span><button type="button" class="cm-sync-library" data-sync-library="1">同步歌单</button></div><button data-panel-close="1" aria-label="关闭资料库">×</button></div><label class="cm-search"><input id="cm-search" type="search" aria-label="搜索音乐" placeholder="搜索歌曲、歌手、专辑、歌单" autocomplete="off" spellcheck="false" maxlength="80" value="'+esc(S.search)+'"'+(signed?'':' disabled')+'></label>'+
      '<section class="cm-search-history" aria-label="搜索历史" hidden></section>'+
      '<div class="cm-search-types" role="tablist" aria-label="搜索类型"><button role="tab" data-search-type="song">歌曲</button><button role="tab" data-search-type="artist">歌手</button><button role="tab" data-search-type="album">专辑</button><button role="tab" data-search-type="playlist">歌单</button></div><div class="cm-library-nav" role="tablist" aria-label="资料库分类"><button role="tab" data-section="mine">我的歌单</button><button role="tab" data-section="recommend">推荐歌单</button><button role="tab" data-section="daily">每日推荐</button></div><div class="cm-library-browse">'+
      '<div class="cm-volume"><span>'+VOLUME+'</span><input id="cm-volume" type="range" min="0" max="100" value="'+Math.round(audio.volume*100)+'" aria-label="音量"><output id="cm-volume-label">'+Math.round(audio.volume*100)+'%</output></div>'+
      '<div class="cm-lists"></div></div>'+
      '<div class="cm-list-title" id="cm-library-label"></div><div class="cm-tracks" id="cm-library-results" aria-live="polite"></div></section></div>';
    if(S.qr){var img=/^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/.test(S.qr.image||'')?S.qr.image:'';
      h+='<div class="cm-modal"><div class="cm-qr"><button class="cm-qr-close" data-qr-close="1">×</button><h2>扫描网易云音乐登录</h2>'+
        (img?'<img src="'+img+'" alt="网易云音乐登录二维码">':'<div class="cm-qr-wait">正在生成二维码…</div>')+
        '<p>'+esc(S.qr.message||'用手机端扫码，并在手机上确认')+'</p></div></div>';}
    h+='</div>';
    app.innerHTML=h;app.classList.toggle('show-lyrics',S.lyricsOpen);app.classList.toggle('controls-hidden',!S.controlsVisible);app.classList.toggle('library-open',S.libraryOpen);updateProgress();layoutCovers(0,false);updateLyrics();renderLibraryContent();
    if(restoreSearch&&S.libraryOpen){var input=document.getElementById('cm-search');if(input){input.focus();try{input.setSelectionRange(caret,caret);}catch(ignore){}}}
  }
  function textAt(selector,value){var el=app.querySelector(selector);if(el&&el.textContent!==value)el.textContent=value;}
  var renderedSong='',renderedLists='',renderedCovers='',ambientImage=null,backdropSeq=0,coverTransition='',coverFadeSeq=0,activeCoverFade=null;
  function finishCoverFade(){if(!activeCoverFade)return;++coverFadeSeq;var fade=activeCoverFade;activeCoverFade=null;for(var i=0;i<fade.old.length;i++)if(fade.old[i].parentNode)fade.old[i].parentNode.removeChild(fade.old[i]);for(i=0;i<fade.fresh.length;i++){fade.fresh[i].style.opacity=fade.opacities[i];fade.fresh[i].classList.remove('cm-switch-fade');}}
  function transitionBackdrop(url){
    var seq=++backdropSeq,image=new Image();image.onload=function(){if(seq!==backdropSeq)return;ambientImage=image;var layers=app.querySelectorAll('.cm-backdrop'),active=layers[0].classList.contains('on')?0:1,next=1-active;layers[next].style.backgroundImage='url("'+image.src+'")';layers[next].classList.add('on');layers[active].classList.remove('on');};image.src=url;
  }
  function fadeCovers(html){
    finishCoverFade();
    var seq=++coverFadeSeq,stage=app.querySelector('.cm-art-stage'),old=Array.prototype.slice.call(stage.children),holder=document.createElement('div');holder.innerHTML=html;
    for(var i=0;i<old.length;i++){old[i].classList.add('cm-art-ghost');old[i].style.transition='opacity .24s var(--ease)';old[i].style.zIndex=String(30+(+old[i].style.zIndex||0));}
    var fresh=Array.prototype.slice.call(holder.children),opacities=[];for(i=0;i<fresh.length;i++){opacities.push(fresh[i].style.opacity);fresh[i].classList.add('cm-switch-fade');fresh[i].style.opacity='0';stage.appendChild(fresh[i]);}
    activeCoverFade={old:old,fresh:fresh,opacities:opacities};var currentFade=activeCoverFade;
    var center=stage.querySelector('.cm-art-card.cm-switch-fade[data-offset="0"] img'),started=false;
    function start(){if(started||seq!==coverFadeSeq)return;started=true;requestAnimationFrame(function(){requestAnimationFrame(function(){if(seq!==coverFadeSeq)return;for(var j=0;j<fresh.length;j++)fresh[j].style.opacity=opacities[j];for(j=0;j<old.length;j++)old[j].style.opacity='0';setTimeout(function(){for(var k=0;k<old.length;k++)if(old[k].parentNode)old[k].parentNode.removeChild(old[k]);for(k=0;k<fresh.length;k++)fresh[k].classList.remove('cm-switch-fade');if(activeCoverFade===currentFade)activeCoverFade=null;},260);});});}
    if(center&&!center.complete){center.addEventListener('load',start,{once:true});center.addEventListener('error',start,{once:true});setTimeout(start,900);}else start();
  }
  function reconcileCovers(html,mode){
    if(mode==='fade'){fadeCovers(html);return;}
    var stage=app.querySelector('.cm-art-stage'),holder=document.createElement('div'),old=stage.querySelectorAll('.cm-art-card:not(.cm-art-ghost)'),byId={},i;
    for(i=0;i<old.length;i++)byId[old[i].getAttribute('data-song-id')]=old[i];holder.innerHTML=html;
    var desired=Array.prototype.slice.call(holder.children);for(i=0;i<desired.length;i++){var fresh=desired[i],id=fresh.getAttribute('data-song-id'),node=byId[id];
      if(node){delete byId[id];node.setAttribute('data-offset',fresh.getAttribute('data-offset'));node.style.transform=fresh.style.transform;node.style.opacity=fresh.style.opacity;node.style.zIndex=fresh.style.zIndex;var im=node.querySelector('img'),nextIm=fresh.querySelector('img');if(im&&nextIm&&im.getAttribute('src')!==nextIm.getAttribute('src'))im.src=nextIm.getAttribute('src');}
      else{var opacity=fresh.style.opacity;fresh.style.opacity='0';stage.appendChild(fresh);(function(el,value){requestAnimationFrame(function(){requestAnimationFrame(function(){if(el.parentNode)el.style.opacity=value;});});})(fresh,opacity);}
    }
    for(var key in byId)if(Object.prototype.hasOwnProperty.call(byId,key)){var removed=byId[key];removed.classList.add('cm-art-ghost');removed.style.zIndex='21';removed.style.opacity='0';(function(el){setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);},260);})(removed);}
  }
  function librarySnapshot(){
    var canvas=app.querySelector('.cm-library-snapshot'),buffer=document.createElement('canvas'),width=lite?192:384;
    buffer.width=width;buffer.height=Math.max(1,Math.round(width*innerHeight/innerWidth));var ctx=buffer.getContext('2d'),ratio=width/innerWidth;
    ctx.fillStyle='#171415';ctx.fillRect(0,0,buffer.width,buffer.height);
    if(ambientImage&&ambientImage.complete&&ambientImage.naturalWidth)ctx.drawImage(ambientImage,0,0,buffer.width,buffer.height);
    ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(0,0,buffer.width,buffer.height);
    var cards=Array.prototype.slice.call(app.querySelectorAll('.cm-art-card'));cards.sort(function(a,b){return (+a.style.zIndex)-(+b.style.zIndex);});
    for(var i=0;i<cards.length;i++){var card=cards[i],im=card.querySelector('img'),r=card.getBoundingClientRect();if(im&&im.complete&&im.naturalWidth&&+card.style.opacity>0){ctx.globalAlpha=+card.style.opacity;ctx.drawImage(im,r.left*ratio,r.top*ratio,r.width*ratio,r.height*ratio);}}
    ctx.globalAlpha=1;var selectors=S.lyricsOpen?'.cm-lyrics-heading b,.cm-lyrics-heading span,.cm-lyric-line':'.cm-song,.cm-artist';
    var text=app.querySelectorAll(selectors);ctx.textBaseline='top';for(i=0;i<text.length;i++){var node=text[i],style=getComputedStyle(node),box=node.getBoundingClientRect();ctx.font=style.fontWeight+' '+(parseFloat(style.fontSize)*ratio)+'px sans-serif';ctx.fillStyle=style.color;ctx.textAlign=S.lyricsOpen?'left':'center';ctx.fillText(node.textContent.slice(0,85),(S.lyricsOpen?box.left:box.left+box.width/2)*ratio,box.top*ratio,box.width*ratio);}
    canvas.width=buffer.width;canvas.height=buffer.height;var dest=canvas.getContext('2d');if(typeof dest.filter==='string')dest.filter='blur(2px)';dest.drawImage(buffer,0,0);
  }
  function render(){
    // The hidden player keeps only its audio and model. Do not construct the
    // whole library, decode every cover and load fonts merely to feed a widget.
    if(!HV.canWork()){publishState();HV.deferUI('music-render',render);return;}
    if(!app.querySelector('.cm-body')||S.qr||app.querySelector('.cm-modal')){mount();renderedSong='';renderedLists='';renderedCovers='';}
    var s=selected(),signed=S.status&&S.status.signed_in,stage=app.querySelector('.cm-art-stage');
    var songKey=s?s.id+'|'+s.art+'|'+s.title+'|'+s.artist:'',covers=coverMarkup();
    if(covers!==renderedCovers){reconcileCovers(covers,coverTransition);renderedCovers=covers;coverTransition='';}
    if(songKey!==renderedSong){
      renderedSong=songKey;textAt('.cm-song',s?s.title:'你的音乐');textAt('.cm-artist',s?s.artist:'在 Pro 8 上浏览歌单与音乐');
      textAt('.cm-lyrics-heading b',s?s.title:'');textAt('.cm-lyrics-heading span',s?s.artist:'');
      var image=artUrl(s&&s.art,96,true);if(image)transitionBackdrop(image);
      var lyricBox=document.getElementById('cm-lyrics-text');lyricBox.removeAttribute('data-ready');S.lyricIndex=-1;updateLyrics();
    }
    app.classList.toggle('airplay-source',!!external);textAt('.cm-account',external?'来自 AirPlay':'音乐');
    var playing=external?external.playing!==false&&external.streaming:S.playing,playButton=app.querySelector('.cm-play'),icon=playing?PAUSE:PLAY;if(playButton.innerHTML!==icon)playButton.innerHTML=icon;
    playButton.setAttribute('aria-label',playing?'暂停':'播放');
    var disabled=app.querySelectorAll('[data-toggle],[data-skip],[data-lyrics]');for(var j=0;j<disabled.length;j++)disabled[j].disabled=!s||!!(external&&!disabled[j].hasAttribute('data-lyrics')&&(!external.remote_available||remoteBusy));
    document.getElementById('cm-search').disabled=!signed;
    var syncButton=app.querySelector('[data-sync-library]');syncButton.disabled=!signed||!!librarySync;syncButton.setAttribute('aria-busy',String(!!librarySync));textAt('.cm-sync-status',libraryText);var ob=app.querySelector('[data-order]');if(ob.getAttribute('data-mode')!==order.mode){ob.innerHTML=orderIcon();ob.setAttribute('data-mode',order.mode);}ob.setAttribute('aria-label',orderNames[order.mode]);ob.title=orderNames[order.mode];ob.disabled=!!external;
    if(S.libraryOpen&&!app.classList.contains('library-open'))librarySnapshot();
    app.classList.toggle('show-lyrics',S.lyricsOpen);app.classList.toggle('controls-hidden',!S.controlsVisible);app.classList.toggle('library-open',S.libraryOpen);
    var panel=app.querySelector('.cm-library');panel.classList.toggle('on',S.libraryOpen);app.querySelector('.cm-panel-shade').classList.toggle('on',S.libraryOpen);
    app.querySelector('.cm-mode [data-library]').classList.toggle('on',S.libraryOpen);app.querySelector('.cm-mode [data-panel-close]').classList.toggle('on',!S.libraryOpen);
    var note=app.querySelector('.cm-note');note.hidden=!S.error;textAt('.cm-note',S.error);renderLike();
    if(S.libraryOpen){
      var lists=S.lists.slice(0,listLimit).map(function(p){return '<button class="cm-list'+(S.list&&S.list.id===p.id?' on':'')+'" data-list="'+esc(p.id)+'" aria-label="'+esc(p.name)+'" title="'+esc(p.name)+'">'+(safeArt(p.art)?art(p.art):NOTE)+'</button>';}).join('');
      if(lists!==renderedLists){var listBox=app.querySelector('.cm-lists'),listScroll=listBox.scrollLeft;listBox.innerHTML=lists;listBox.scrollLeft=listScroll;renderedLists=lists;}
      renderLibraryContent();
    }else{if(S.controlsVisible)updateProgress();if(S.lyricsOpen)updateLyrics();}
    details.sync();if(window.HVVinylUI)HVVinylUI.sync(app);publishState();
  }
  var searchNames={song:'歌曲',artist:'歌手',album:'专辑',playlist:'歌单'};
  var historyKey='homeview:music-search-history:v1',searchHistory=readSearchHistory();
  function historyQuery(value){return typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,80):'';}
  function readSearchHistory(){
    var out=[],seen={};try{var raw=localStorage.getItem(historyKey);if(!raw||raw.length>16384)return out;var list=JSON.parse(raw);if(!Array.isArray(list))return out;
      for(var i=0;i<list.length&&out.length<12;i++){var item=list[i],q=historyQuery(item&&item.q),type=item&&item.type,key=type+'|'+q.toLowerCase();if(!q||['song','artist','album','playlist'].indexOf(type)<0||seen[key])continue;seen[key]=true;out.push({q:q,type:type});}
    }catch(ignore){}return out;
  }
  function rememberSearch(q,type){
    q=historyQuery(q);if(!q)return;searchHistory=searchHistory.filter(function(item){return item.type!==type||item.q.toLowerCase()!==q.toLowerCase();});searchHistory.unshift({q:q,type:type});searchHistory=searchHistory.slice(0,12);
    try{localStorage.setItem(historyKey,JSON.stringify(searchHistory));}catch(ignore){}
  }
  function renderSearchHistory(){
    var box=app.querySelector('.cm-search-history');if(!box)return;
    box.hidden=!(S.status&&S.status.signed_in&&!S.search.trim()&&!S.detail&&searchHistory.length);if(box.hidden)return;
    var key=JSON.stringify(searchHistory);if(box.hvHistory===key)return;box.hvHistory=key;
    box.innerHTML='<div class="cm-history-head"><h3>最近搜索</h3><button data-history-clear="1" aria-label="清空搜索历史">清空</button></div><div class="cm-history-items">'+searchHistory.map(function(item,i){return '<button class="cm-history-chip" data-history="'+i+'" title="'+esc(item.q)+' · '+searchNames[item.type]+'"><span>'+esc(item.q)+'</span><small>'+searchNames[item.type]+'</small></button>';}).join('')+'</div>';
  }
  function useSearchHistory(index){
    var item=searchHistory[index];if(!item)return;S.search=item.q;S.searchType=item.type;var input=document.getElementById('cm-search');input.value=item.q;input.blur();requestSearch(true);
  }
  function playlistPage(id,offset,snapshot){return api('playlist?id='+encodeURIComponent(id)+'&limit=40'+(snapshot?'&offset='+offset+'&snapshot='+encodeURIComponent(snapshot):''));}
  function pagedList(){if(S.detail)return S.detail.kind==='playlist'?S.detail:null;return !S.search.trim()&&S.section==='mine'?S.list:null;}
  function morePlaylist(owner){
    if(!owner||!owner.has_more)return Promise.resolve(owner);if(owner.pageJob)return owner.pageJob;
    owner.pageError='';var offset=owner.next_offset,snapshot=owner.snapshot;
    owner.pageJob=playlistPage(owner.id,offset,snapshot).then(function(d){
      if(d.snapshot!==snapshot||d.offset!==offset||d.next_offset<=offset)throw new Error('歌单列表已刷新，请重新载入');
      var seen={},items=owner.items||[];items.forEach(function(t){seen[String(t.id)]=true;});(d.items||[]).forEach(function(t){if(!seen[String(t.id)]){seen[String(t.id)]=true;items.push(t);}});
      owner.items=items;owner.next_offset=d.next_offset;owner.has_more=!!d.has_more;owner.total=d.total;
      if(queueOwner===owner){S.tracks=items.filter(function(t){return !t.unavailable;});rememberSession();}return owner;
    }).then(function(d){owner.pageJob=null;if(pagedList()===owner){libraryLimit=Math.min(owner.items.length,libraryLimit+20);renderLibraryContent();}return d;},function(e){owner.pageJob=null;owner.pageError=e.message||'后续曲目加载失败';if(pagedList()===owner)renderLibraryContent();throw e;});
    return owner.pageJob;
  }
  function earlierPlaylist(owner){
    if(owner.previousJob)return owner.previousJob;var offset=Math.max(0,owner.offset-40),snapshot=owner.snapshot;
    owner.previousJob=playlistPage(owner.id,offset,snapshot).then(function(d){
      if(d.snapshot!==snapshot||d.offset!==offset)throw new Error('歌单列表已刷新，请重新载入');
      var items=[],seen={};(d.items||[]).concat(owner.items||[]).forEach(function(t){if(!seen[String(t.id)]){seen[String(t.id)]=true;items.push(t);}});
      owner.items=items;owner.offset=offset;if(queueOwner===owner){S.tracks=items.filter(function(t){return !t.unavailable;});rememberSession();}return owner;
    }).then(function(d){owner.previousJob=null;return d;},function(e){owner.previousJob=null;throw e;});return owner.previousJob;
  }
  function moreLibrary(){
    var owner=pagedList(),tracks=libraryTracks();
    if(libraryLimit<tracks.length){libraryLimit+=20;renderLibraryContent();return;}
    if(owner&&owner.has_more&&!owner.pageJob&&!owner.pageError){morePlaylist(owner).catch(function(){});renderLibraryContent();}
  }
  function reloadLibrary(){var owner=pagedList();if(!owner)return;if(owner===S.list)loadList(owner.id);else{var previous=owner,seq=++searchSeq;S.detailLoading=true;renderLibraryContent();playlistPage(owner.id).then(function(d){if(seq!==searchSeq||S.detail!==previous)return;S.detail=d;S.detailLoading=false;libraryLimit=20;renderLibraryContent();},function(e){if(seq!==searchSeq)return;S.detailLoading=false;S.searchError=e.message;renderLibraryContent();});}}
  function libraryTracks(){return S.detail?S.detail.items||[]:S.search.trim()&&S.searchType==='song'?S.searchItems:!S.search.trim()&&S.section==='daily'?S.daily||[]:S.browseTracks;}
  function renderLibraryContent(){
    var panel=app.querySelector('.cm-library'),box=document.getElementById('cm-library-results'),label=document.getElementById('cm-library-label');if(!box||!S.libraryOpen)return;if(!HV.canWork()){HV.deferUI('music-library',renderLibraryContent);return;}
    var searching=!!S.search.trim(),signed=S.status&&S.status.signed_in,s=selected(),html='';
    renderSearchHistory();
    panel.classList.toggle('is-searching',searching);panel.classList.toggle('show-discovery',S.section!=='mine');
    Array.prototype.forEach.call(panel.querySelectorAll('[data-section]'),function(b){var on=b.getAttribute('data-section')===S.section;b.classList.toggle('on',on);b.setAttribute('aria-selected',String(on));});
    var tabs=panel.querySelectorAll('[data-search-type]');for(var j=0;j<tabs.length;j++){var on=tabs[j].getAttribute('data-search-type')===S.searchType;tabs[j].classList.toggle('on',on);tabs[j].setAttribute('aria-selected',on?'true':'false');}
    label.classList.toggle('with-back',!!S.detail);
    label.innerHTML=S.detail?'<button data-detail-back="1" aria-label="返回搜索结果">‹ 返回</button><span>'+esc(S.detail.name)+(S.detail.kind==='artist'?' · 热门歌曲':'')+'</span>':esc(searching?searchNames[S.searchType]+'搜索结果':S.section==='recommend'?'推荐歌单':S.section==='daily'?'每日推荐':S.list?S.list.name:'我的歌单');
    if(!searching&&!S.detail&&S.section!=='mine'){label.innerHTML='<span>'+esc(S.section==='daily'?'每日推荐':'推荐歌单')+'</span>'+(S.section==='daily'&&S.daily&&S.daily.length?'<button data-play-all="1">全部播放</button>':'')+'<button data-discovery-refresh="1">刷新</button>';label.classList.add('with-actions');}else label.classList.remove('with-actions');
    var owner=pagedList();box.setAttribute('aria-busy',S.searching||S.detailLoading||S.discoveryBusy||owner&&owner.pageJob?'true':'false');
    if(!signed)html='<div class="cm-empty"><strong>连接音乐</strong>用手机端扫码并确认。<button data-qr="1">扫码登录</button></div>';
    else if(!searching&&!S.detail&&S.section!=='mine'&&S.discoveryError)html='<div class="cm-empty">'+esc(S.discoveryError)+'<button data-discovery-refresh="1">重试</button></div>';
    else if(!searching&&!S.detail&&S.section!=='mine'&&S.discoveryBusy)html='<div class="cm-empty">正在读取'+(S.section==='daily'?'每日推荐':'推荐歌单')+'…</div>';
    else if(!searching&&!S.detail&&S.section==='recommend'){
      html='<div class="cm-discovery-grid">'+(S.recommended||[]).map(function(t,i){return '<button class="cm-discovery-card" data-recommend="'+i+'">'+(safeArt(t.art)?art(t.art,160):'<span>'+NOTE+'</span>')+'<b>'+esc(t.name)+'</b><small>'+esc(t.artist||'音乐推荐')+'</small></button>';}).join('')+'</div>';
      if(!(S.recommended||[]).length)html='<div class="cm-empty">今天暂时没有推荐歌单<button data-discovery-refresh="1">刷新</button></div>';
    }
    else if(S.searchError)html='<div class="cm-empty">'+esc(S.searchError)+'<button data-search-retry="1">重新搜索</button></div>';
    else if(S.searching||S.detailLoading)html='<div class="cm-empty">'+(S.detailLoading?'正在加载歌曲…':'正在搜索'+searchNames[S.searchType]+'…')+'</div>';
    else if(searching&&!S.detail&&S.searchType!=='song'){
      html=S.searchItems.map(function(t,i){return '<button class="cm-track cm-entity '+S.searchType+'" data-open-result="'+i+'">'+(safeArt(t.art)?art(t.art):'<span class="cm-mini">'+NOTE+'</span>')+'<span class="cm-track-text"><b>'+esc(t.name)+'</b><small>'+esc(S.searchType==='artist'?'歌手'+(t.count?' · '+t.count+' 张专辑':''):S.searchType==='playlist'?(t.artist||'歌单')+(t.count?' · '+t.count+' 首':''):t.artist||'专辑')+'</small></span><span class="cm-chevron" aria-hidden="true">›</span></button>';}).join('');
      if(!html)html='<div class="cm-empty">没有找到相关'+searchNames[S.searchType]+'</div>';
    }else{
      var tracks=libraryTracks(),paged=!!(owner&&owner.snapshot),count=Math.min(tracks.length,libraryLimit),start=paged?Math.max(0,Math.min(count-1,Math.floor(box.scrollTop/68)-8)):0,end=paged?Math.min(count,start+44):count;
      box.setAttribute('data-window-start',String(start));
      html=(paged&&start?'<div aria-hidden="true" style="height:'+(start*68)+'px"></div>':'')+tracks.slice(start,end).map(function(t,j){var i=start+j;return '<button class="cm-track'+(paged?' cm-paged-track':'')+(s&&s.id===t.id?' on':'')+'" data-track="'+i+'"'+(t.unavailable?' disabled':'')+'>'+(safeArt(t.art)?art(t.art):'<span class="cm-mini">'+NOTE+'</span>')+'<span class="cm-track-text"><b>'+esc(t.title)+'</b><small>'+esc(t.artist|| (t.unavailable?'暂不可用':''))+'</small></span><span class="cm-duration">'+fmt(t.duration)+'</span></button>';}).join('')+(paged&&end<count?'<div aria-hidden="true" style="height:'+((count-end)*68)+'px"></div>':'');
      if(paged){html+='<div class="cm-page-status" role="status">'+(owner.pageError?esc(owner.pageError)+'<button data-page-reload="1">重新载入</button>':owner.pageJob?'正在加载更多…':count<tracks.length||owner.has_more?'<button data-page-more="1">继续加载</button>':'已显示全部 '+tracks.length+' 首')+'</div>';}
      if(!html)html='<div class="cm-empty">'+(searching?'没有找到相关歌曲':S.loading?'正在加载歌单…':'选择上方歌单，或搜索一首歌。')+'</div>';
    }
    var scroll=box.scrollTop;box.innerHTML=html;box.scrollTop=scroll;
  }
  var searchTimer=null,searchSeq=0,searchComposing=false,libraryLimit=20,listLimit=12;
  function requestSearch(immediate){
    clearTimeout(searchTimer);var seq=++searchSeq,q=historyQuery(S.search),type=S.searchType;libraryLimit=20;S.detail=null;S.detailLoading=false;S.searchError='';S.searching=!!q;
    if(!q){S.searchItems=[];renderLibraryContent();return;}
    renderLibraryContent();searchTimer=setTimeout(function(){api('search?q='+encodeURIComponent(q)+'&type='+type).then(function(d){if(seq!==searchSeq)return;S.searchItems=d.items||[];S.searching=false;rememberSearch(q,type);renderLibraryContent();},function(e){if(seq!==searchSeq)return;S.searching=false;S.searchError=e.message||'暂时无法搜索';renderLibraryContent();});},immediate?0:420);
  }
  function openSearchResult(i){
    var item=S.searchItems[i];if(!item)return;var seq=++searchSeq;S.detail=item;S.detailLoading=true;S.searchError='';renderLibraryContent();
    (S.searchType==='playlist'?playlistPage(item.id):api(S.searchType+'?id='+encodeURIComponent(item.id))).then(function(d){if(seq!==searchSeq)return;S.detail=d;S.detailLoading=false;libraryLimit=20;var box=document.getElementById('cm-library-results');if(box)box.scrollTop=0;renderLibraryContent();},function(e){if(seq!==searchSeq)return;S.detailLoading=false;S.searchError=e.message;renderLibraryContent();});
  }
  var discoverySeq=0,discoveryJobs={},discoveryAge={},discoveryAttempt={},artistCache=[],artistJobs={};
  var discoveryTTL=60*60*1000,discoveryRetry=60*1000;
  function discoveryDate(){var n=HV.local();return n.y+'-'+n.mo+'-'+n.d;}
  function discoveryFresh(section){
    var saved=discoveryAge[section];
    return !!(saved&&saved.day===discoveryDate()&&Date.now()-saved.at<discoveryTTL);
  }
  function discoveryDue(section){
    var last=discoveryAttempt[section];
    return !discoveryFresh(section)&&!(last&&last.day===discoveryDate()&&Date.now()-last.at<discoveryRetry);
  }
  function refreshDiscoveryIfDue(){
    if(!hostVisible||!HV.canWork()||!S.libraryOpen||S.search.trim()||S.detail||!(S.status&&S.status.signed_in))return;
    if(S.section!=='mine'&&discoveryDue(S.section))loadDiscovery(false);
  }
  function requestMyLists(){
    if(myListsJob)return myListsJob;
    myListsJob=api('playlists').then(function(d){myListsJob=null;return d.items||[];},function(e){myListsJob=null;throw e;});
    return myListsJob;
  }
  function syncLibrary(){
    if(librarySync||!(S.status&&S.status.signed_in))return librarySync;
    var previous=S.list,seq=listSeq,detail=S.detail,detailSeq=searchSeq;
    libraryText='正在同步…';
    function result(p){return p.then(function(){return true;},function(){return false;});}
    var jobs=[
      result(requestMyLists().then(function(items){S.lists=items;})),
      result(discoveryData('daily',true)),
      result(discoveryData('recommend',true)),
      result(loadLikes(true))
    ];
    if(previous)jobs.push(result(playlistPage(previous.id).then(function(d){
      if(seq!==listSeq||previous!==S.list)return;
      S.list=d;S.browseTracks=d.items||[];likedDirty=false;
    })));
    if(detail&&detail.kind==='playlist'&&detail!==previous)jobs.push(result(playlistPage(detail.id).then(function(d){
      if(detailSeq===searchSeq&&detail===S.detail)S.detail=d;
    })));
    librarySync=Promise.all(jobs).then(function(results){
      var failures=results.filter(function(ok){return !ok;}).length;
      librarySync=null;
      libraryText=failures?(failures===results.length?'同步失败，可重试':'部分未同步，可重试'):'已同步';
      if(S.section!=='mine'&&discoveryFresh(S.section))S.discoveryError='';
      render();if(hostVisible&&HV.canWork())HV.toast(libraryText);
      return failures===0;
    });
    render();return librarySync;
  }
  function discoveryData(section,force){
    if(section!=='daily'&&section!=='recommend')return Promise.reject(new Error('未找到歌单分类'));
    var day=discoveryDate(),cached=section==='daily'?S.daily:S.recommended;
    if(!force&&cached!==null&&discoveryFresh(section))return Promise.resolve({items:cached});
    var jobKey=section+'|'+day;if(discoveryJobs[jobKey])return discoveryJobs[jobKey];
    discoveryAttempt[section]={day:day,at:Date.now()};
    discoveryJobs[jobKey]=api(section==='daily'?'daily':'recommend-playlists').then(function(d){
      delete discoveryJobs[jobKey];if(day!==discoveryDate())return discoveryData(section,force);
      discoveryAge[section]={day:day,at:Date.now()};
      if(section==='daily'){S.daily=d.items||[];S.dailyDate=day;}else S.recommended=d.items||[];
      return d;
    },function(e){delete discoveryJobs[jobKey];throw e;});return discoveryJobs[jobKey];
  }
  function artistSongs(item,force){
    var name=item.artistName||String(item.artist||'').split('、')[0],id=item.artistId||'',key=id||name;
    if(!name&&!id)return Promise.reject(new Error('这张唱片没有歌手信息'));
    for(var i=0;i<artistCache.length;i++)if(!force&&artistCache[i].key===key)return Promise.resolve(artistCache[i].data);
    if(artistJobs[key])return artistJobs[key];
    var source=id?Promise.resolve({id:id}):api('search?type=artist&q='+encodeURIComponent(name.slice(0,80))).then(function(d){var same=(d.items||[]).filter(function(a){return String(a.name||'').toLowerCase()===name.toLowerCase();});if(!same.length)throw new Error('暂时没有找到这位歌手的代表作');return same[0];});
    artistJobs[key]=source.then(function(a){return api('artist?id='+encodeURIComponent(a.id));}).then(function(d){delete artistJobs[key];var data={name:d.name||name,items:(d.items||[]).slice(0,50)};artistCache=artistCache.filter(function(a){return a.key!==key;});artistCache.push({key:key,data:data});while(artistCache.length>4)artistCache.shift();return data;},function(e){delete artistJobs[key];throw e;});return artistJobs[key];
  }
  function loadDiscovery(force){
    if(S.section==='mine')return;var section=S.section,seq=++discoverySeq;
    if(!force&&discoveryFresh(section)){S.discoveryBusy=false;S.discoveryError='';renderLibraryContent();return;}
    S.discoveryBusy=true;S.discoveryError='';renderLibraryContent();discoveryData(section,force).then(function(d){
      if(seq!==discoverySeq)return;S.discoveryBusy=false;renderLibraryContent();
    },function(e){if(seq!==discoverySeq)return;S.discoveryBusy=false;S.discoveryError=e.message||'推荐暂不可用';renderLibraryContent();});
  }
  function showSection(section){if(['mine','recommend','daily'].indexOf(section)<0)return;++searchSeq;S.section=section;S.search='';S.detail=null;S.detailLoading=false;S.searching=false;S.searchError='';libraryLimit=20;var q=document.getElementById('cm-search');q.value='';q.blur();render();loadDiscovery(false);}
  function openRecommended(i){var item=(S.recommended||[])[i];if(!item)return;var seq=++searchSeq;S.detail=item;S.detailLoading=true;renderLibraryContent();playlistPage(item.id).then(function(d){if(seq!==searchSeq)return;S.detail=d;S.detailLoading=false;libraryLimit=20;var box=document.getElementById('cm-library-results');if(box)box.scrollTop=0;renderLibraryContent();},function(e){if(seq!==searchSeq)return;S.detailLoading=false;S.searchError=e.message;renderLibraryContent();});}
  function selectLibraryTrack(i){var tracks=libraryTracks();if(!tracks[i]||tracks[i].unavailable)return;queueOwner=pagedList();var id=tracks[i].id;S.tracks=tracks.filter(function(t){return !t.unavailable;});choose(S.tracks.findIndex(function(t){return t.id===id;}),true);}
  function currentPosition(){return external?Math.max(0,(external.position_ms||0)/1000):pendingResume?pendingResume.time:audio.currentTime||0;}
  function trackDuration(){var s=selected();return external?Math.max(0,(external.duration_ms||0)/1000):audio.duration||s&&s.duration||0;}
  function updateProgress(){var duration=trackDuration(),pos=currentPosition(),fill=document.getElementById('cm-fill'),el=document.getElementById('cm-elapsed'),rem=document.getElementById('cm-remain');if(fill)fill.style.width=(duration?Math.min(100,pos/duration*100):0)+'%';if(el)el.textContent=fmt(pos);if(rem)rem.textContent='-'+fmt(Math.max(0,duration-pos));}
  function coverStep(){return S.lyricsOpen?Math.min(innerHeight*.16,innerWidth*.08):Math.min(innerHeight*.27,innerWidth*.18);}
  function coverPose(offset,dx,dragging){var unit=coverStep(),relative=offset+dx/unit,depth=Math.abs(relative),angle=Math.max(-56,Math.min(56,-relative*46)),scale=Math.max(.58,1-depth*.16)*(S.controlsVisible?1:1.2),x=offset*unit+dx;
    if(lite&&S.lyricsOpen)x-=innerWidth*(S.controlsVisible ? .25 : .23);
    return {transform:'translate3d(-50%,-50%,0) translateX('+x+'px) perspective(1000px) rotateY('+angle+'deg) scale('+scale+')',z:String(20-Math.round(depth*3)),opacity:offset===0?'1':dragging?String(Math.max(.3,.9-depth*.14)):'0'};
  }
  function layoutCovers(dx,dragging){var cards=app.querySelectorAll('.cm-art-card:not(.cm-art-ghost)');for(var i=0;i<cards.length;i++){var card=cards[i],p=coverPose(+card.getAttribute('data-offset'),dx,dragging);card.style.transform=p.transform;card.style.zIndex=p.z;card.style.opacity=p.opacity;}}
  function parseLyrics(raw){var lines=String(raw||'').split(/\r?\n/),out=[];for(var i=0;i<lines.length;i++){var m=/\[(\d+):(\d+(?:\.\d+)?)\]/.exec(lines[i]),word=lines[i].replace(/\[[^\]]*\]/g,'').trim();if(m&&word)out.push({time:(+m[1])*60+(+m[2]),text:word});}return out;}
  var lyricDrag=null,lyricPreviewIndex=null,lyricFrame=0,lastLyricGesture=0,pendingLyricSeek=null,lyricWheelTimer=null,lyricWheelBase=0,lyricWheelDelta=0;
  function lyricTop(offset){return (S.controlsVisible?11:13)+offset*(S.controlsVisible?10:12);}
  function positionLyrics(){var lines=app.querySelectorAll('.cm-lyric-line');for(var i=0;i<lines.length;i++)lines[i].style.top=lyricTop(+lines[i].getAttribute('data-lyric-offset'))+'vh';}
  function updateLyrics(){if(!HV.canWork()){HV.deferUI('music-lyrics',updateLyrics);return;}
    var box=document.getElementById('cm-lyrics-text');if(!box)return;var lines=S.lyrics;
    if(!lines||!lines.length){box.textContent=S.lyrics===null?'正在读取歌词…':'暂无歌词';box.removeAttribute('data-ready');return;}
    var at=pendingLyricSeek?pendingLyricSeek.time:currentPosition(),idx=0;
    for(var i=0;i<lines.length;i++)if(lines[i].time<=at+.12)idx=i;else break;
    if(lyricPreviewIndex!==null)idx=lyricPreviewIndex;
    if(S.lyricIndex===idx&&box.getAttribute('data-ready')==='1')return;S.lyricIndex=idx;
    var nodes=box.querySelectorAll('.cm-lyric-line');if(!nodes.length)box.textContent='';
    var start=Math.max(0,idx-2),end=Math.min(lines.length-1,idx+3),count=end-start+1;
    for(i=0;i<Math.max(count,nodes.length);i++){
      var node=nodes[i];if(!node){node=document.createElement('div');box.appendChild(node);}
      if(i>=count){node.style.display='none';node.removeAttribute('data-lyric-time');node.tabIndex=-1;continue;}
      var index=start+i,line=lines[index];node.style.display='';node.className='cm-lyric-line '+(index===idx?'active':'');
      node.style.top=lyricTop(index-idx)+'vh';node.setAttribute('data-lyric-offset',index-idx);node.setAttribute('data-lyric-time',line.time);
      node.setAttribute('role','button');node.tabIndex=0;node.setAttribute('aria-label','跳转到 '+fmt(line.time)+' '+line.text);
      if(node.textContent!==line.text)node.textContent=line.text;
    }
    box.setAttribute('data-ready','1');
  }
  function clearLyricMotion(){
    if(lyricFrame){cancelAnimationFrame(lyricFrame);lyricFrame=0;}clearTimeout(lyricWheelTimer);lyricWheelTimer=null;
    lyricDrag=null;lyricPreviewIndex=null;app.classList.remove('lyric-scrubbing');
    var lines=app.querySelectorAll('.cm-lyric-line');for(var i=0;i<lines.length;i++)lines[i].style.transform='';
  }
  function applyLyricSeek(){
    if(external||!pendingLyricSeek||audio.readyState<1)return;var track=selected();
    if(!track||track.id!==pendingLyricSeek.id){pendingLyricSeek=null;return;}
    var time=pendingLyricSeek.time;if(isFinite(audio.duration))time=Math.min(time,Math.max(0,audio.duration-.05));
    try{audio.currentTime=Math.max(0,time);pendingLyricSeek=null;S.lyricIndex=-1;updateProgress();updateLyrics();}catch(ignore){}
  }
  function seekLyric(time){
    var track=selected();if(!track||!isFinite(time))return;pendingResume=null;clearLyricMotion();
    if(external){HV.toast('请在 iPhone 或 Mac 上调整播放进度');S.lyricIndex=-1;updateLyrics();noteActivity();return;}
    pendingLyricSeek={id:track.id,time:Math.max(0,time)};S.lyricIndex=-1;updateLyrics();
    if(audio.getAttribute('src'))applyLyricSeek();else play();noteActivity();
  }
  function lyricStart(x,y,target){
    if(!S.lyricsOpen||S.libraryOpen||!S.lyrics||!S.lyrics.length||!target.closest('#cm-lyrics-text'))return;
    var tapped=target.closest('[data-lyric-time]');clearLyricMotion();lyricDrag={tapTime:tapped?+tapped.getAttribute('data-lyric-time'):null,x:x,y:y,index:Math.max(0,S.lyricIndex||0),target:Math.max(0,S.lyricIndex||0),dy:0,moved:false};
  }
  function lyricMove(x,y){
    if(!lyricDrag)return false;var dx=x-lyricDrag.x,dy=y-lyricDrag.y;
    if(!lyricDrag.moved&&(Math.abs(dy)<7||Math.abs(dy)<Math.abs(dx)))return false;
    lyricDrag.moved=true;lyricDrag.dy=dy;app.classList.add('lyric-scrubbing');
    if(!lyricFrame)lyricFrame=requestAnimationFrame(function(){
      lyricFrame=0;if(!lyricDrag)return;var step=innerHeight*(S.controlsVisible ? .1 : .12),raw=lyricDrag.index-Math.round(lyricDrag.dy/step);
      var index=Math.max(0,Math.min(S.lyrics.length-1,raw)),residual=raw===index?lyricDrag.dy+(index-lyricDrag.index)*step:0;
      lyricDrag.target=index;lyricPreviewIndex=index;updateLyrics();
      var lines=app.querySelectorAll('.cm-lyric-line');for(var i=0;i<lines.length;i++)lines[i].style.transform='translate3d(0,'+residual+'px,0)';
    });return true;
  }
  function lyricEnd(cancelled){
    if(!lyricDrag)return;var drag=lyricDrag;
    if(lyricFrame){cancelAnimationFrame(lyricFrame);lyricFrame=0;var step=innerHeight*(S.controlsVisible ? .1 : .12);drag.target=Math.max(0,Math.min(S.lyrics.length-1,drag.index-Math.round(drag.dy/step)));}
    clearLyricMotion();if(drag.moved&&!cancelled){lastLyricGesture=Date.now();seekLyric(S.lyrics[drag.target].time);}else if(!cancelled&&drag.tapTime!==null){lastLyricGesture=Date.now();seekLyric(drag.tapTime);}else{S.lyricIndex=-1;updateLyrics();}
  }
  app.addEventListener('click',function(e){var line=e.target.closest('[data-lyric-time]');if(!line)return;if(Date.now()-lastLyricGesture<450)return;seekLyric(+line.getAttribute('data-lyric-time'));});
  app.addEventListener('keydown',function(e){var line=e.target.closest('[data-lyric-time]');if(line&&(e.key==='Enter'||e.key===' ')){e.preventDefault();seekLyric(+line.getAttribute('data-lyric-time'));}});
  app.addEventListener('touchstart',function(e){if(e.touches.length===1)lyricStart(e.touches[0].clientX,e.touches[0].clientY,e.target);},{passive:true});
  app.addEventListener('touchmove',function(e){if(lyricDrag&&e.touches.length===1&&lyricMove(e.touches[0].clientX,e.touches[0].clientY))e.preventDefault();},{passive:false});
  app.addEventListener('touchend',function(){lyricEnd(false);});app.addEventListener('touchcancel',function(){lyricEnd(true);});
  app.addEventListener('mousedown',function(e){if(e.button===0&&Date.now()-lastTouch>700)lyricStart(e.clientX,e.clientY,e.target);});
  document.addEventListener('mousemove',function(e){if(lyricDrag&&lyricMove(e.clientX,e.clientY))e.preventDefault();});document.addEventListener('mouseup',function(){lyricEnd(false);});
  window.addEventListener('blur',function(){lyricEnd(true);});
  app.addEventListener('wheel',function(e){
    if(!S.lyricsOpen||S.libraryOpen||!S.lyrics||!S.lyrics.length||!e.target.closest('#cm-lyrics-text')||e.ctrlKey||Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
    e.preventDefault();if(!lyricWheelTimer){lyricWheelBase=Math.max(0,S.lyricIndex||0);lyricWheelDelta=0;}
    lyricWheelDelta+=e.deltaY*(e.deltaMode===1?18:e.deltaMode===2?innerHeight:1);var step=innerHeight*(S.controlsVisible ? .1 : .12);
    lyricPreviewIndex=Math.max(0,Math.min(S.lyrics.length-1,lyricWheelBase+Math.round(lyricWheelDelta/step)));app.classList.add('lyric-scrubbing');updateLyrics();
    clearTimeout(lyricWheelTimer);lyricWheelTimer=setTimeout(function(){var index=lyricPreviewIndex;clearLyricMotion();if(index!==null){lastLyricGesture=Date.now();seekLyric(S.lyrics[index].time);}},200);
  },{passive:false});
  audio.addEventListener('loadedmetadata',applyLyricSeek);
  // AirPlay carries song metadata, not timed lyrics. Match the exact title and artist;
  // reject duration/version mismatches instead of showing another recording's lyrics.
  function normalized(value){return String(value||'').toLowerCase().replace(/[\s\-_,.，。·!！?？'"“”‘’()（）:：、/&]/g,'');}
  function matchingRemoteSong(items,track){
    var title=normalized(track.title),artists=String(track.artist||'').split(/[,、/&;]| feat\.? | featuring /i).map(normalized).filter(Boolean),duration=track.duration||0,best=null,score=-1;
    if(!title||!artists.length)return null;
    for(var i=0;i<items.length;i++){var item=items[i];if(normalized(item.title)!==title)continue;
      var names=String(item.artist||'').split(/[,、/&;]/).map(normalized),same=artists.some(function(a){return names.indexOf(a)>=0;});if(!same)continue;
      var distance=duration&&item.duration?Math.abs(duration-item.duration):0;
      if(distance>Math.max(5,duration*.035))continue;
      var rank=(normalized(item.album)===normalized(track.album)&&track.album?20:0)+(duration&&item.duration?10-Math.min(10,distance):0);
      if(rank>score){score=rank;best=item;}
    }return best;
  }
  function loadLyrics(){
    var track=selected();if(!track)return;var seq=++lyricSeq,isRemote=!!external,key=track.id;clearTimeout(lyricTimer);
    S.lyrics=null;S.lyricIndex=-1;updateLyrics();
    function current(){return seq===lyricSeq&&selected()&&selected().id===key;}
    function done(lines){if(!current())return;S.lyrics=lines;S.lyricIndex=-1;updateLyrics();}
    function fetchLyrics(id){return api('lyrics?id='+encodeURIComponent(id)).then(function(d){return parseLyrics(d.text);});}
    if(!isRemote){fetchLyrics(track.id).then(done,function(){done([]);});return;}
    if(!external.title||!external.artist){done([]);return;}
    for(var i=0;i<remoteLyricCache.length;i++)if(remoteLyricCache[i].key===key&&Date.now()-remoteLyricCache[i].at<900000){done(remoteLyricCache[i].lines);return;}
    lyricTimer=setTimeout(function(){
      if(!current())return;
      api('search?type=song&q='+encodeURIComponent((track.title+' '+track.artist).slice(0,80))).then(function(d){
        if(!current())return null;var match=matchingRemoteSong(d.items||[],track);return match?fetchLyrics(match.id):[];
      }).then(function(lines){if(!current()||lines===null)return;remoteLyricCache.unshift({key:key,lines:lines,at:Date.now()});remoteLyricCache.length=Math.min(12,remoteLyricCache.length);done(lines);},function(){done([]);});
    },400);
  }
  function remoteControl(action){
    if(!external||remoteBusy)return;if(!external.remote_available){HV.toast('请在 iPhone 或 Mac 上控制播放');return;}
    remoteBusy=true;render();HV.post('/api/airplay/control',{action:action}).then(function(state){remoteBusy=false;window.HVExternalMusic(state);render();},function(e){remoteBusy=false;render();HV.toast(e.message);});
  }
  function loadList(id,resumed){var seq=++listSeq,epoch=advanceEpoch;++searchSeq;S.loading=true;S.error='';S.search='';S.detail=null;S.section='mine';libraryLimit=20;var box=document.getElementById('cm-library-results');if(box)box.scrollTop=0;render();playlistPage(id).then(function(d){
    if(seq!==listSeq)return;S.list=d;S.browseTracks=d.items||[];d.items=S.browseTracks;
    if(resumed&&resumed.source&&epoch===advanceEpoch&&S.selected&&String(S.selected.id)===resumed.track.id&&d.revision===resumed.source.revision&&resumed.source.next_offset<=d.total){
      var source=resumed.source;queueOwner={id:d.id,name:d.name,revision:d.revision,snapshot:d.snapshot,offset:source.offset,next_offset:source.next_offset,total:d.total,has_more:source.next_offset<d.total,items:S.tracks.slice()};
    }
    if(!S.tracks.length){S.tracks=S.browseTracks.filter(function(t){return !t.unavailable;});queueOwner=d;}S.loading=false;rememberSession();render();
  },function(e){if(seq!==listSeq)return;S.loading=false;S.error=e.message;render();});}
  function choose(i,autoplay,mode){if(external){HV.post('/api/airplay/stop',{}).then(function(){window.HVExternalMusic(null);choose(i,autoplay,mode);},function(e){HV.toast(e.message);});return;}var t=S.tracks[i];if(!t||t.unavailable)return;
    rememberPosition(true);++advanceEpoch;order.queue(S.tracks.map(function(x){return x.id;}));order.select(i);clearLyricMotion();pendingLyricSeek=null;pendingResume=null;coverTransition=mode||'fade';S.selected=t;S.playing=false;S.error='';S.lyrics=null;S.libraryOpen=false;
    sessionSwitching=true;playback.select(t);sessionSwitching=false;session.position(t.id,0);rememberSession();render();if(S.lyricsOpen)loadLyrics();if(autoplay)play();}
  function play(){if(!external)playback.play(selected());}
  function toggle(){++advanceEpoch;if(external){remoteControl(external.playing===false?'play':'pause');return;}if(S.playing||playback.waiting())playback.pause();else play();}
  function skip(direction){advancePlayback(direction,false);}
  function showLyrics(){if(!selected())return;S.lyricsOpen=!S.lyricsOpen;if(!S.lyricsOpen)clearLyricMotion();S.libraryOpen=false;app.classList.toggle('show-lyrics',S.lyricsOpen);layoutCovers(0,false);if(S.lyricsOpen&&S.lyrics===null)loadLyrics();details.sync();if(vinyl)render();}
  var qrTimer=null;
  function stopQr(){clearTimeout(qrTimer);S.qr=null;render();}
  function checkQr(session){if(!S.qr||S.qr.session!==session)return;HV.post('/api/frame/netease/qr/check',{session:session}).then(function(d){
    if(!S.qr||S.qr.session!==session)return;
    if(d.code===803){stopQr();location.reload();return;}
    S.qr.message=d.message||'请用手机端扫码';render();
    if(d.code!==800)qrTimer=setTimeout(function(){checkQr(session);},2200);
  },function(e){if(S.qr){S.qr.message=e.message||'扫码状态暂时无法获取';render();qrTimer=setTimeout(function(){checkQr(session);},4000);}});}
  function startQr(){S.qr={message:'正在生成二维码…'};render();HV.post('/api/frame/netease/qr/start',{}).then(function(d){if(!S.qr)return;S.qr={session:d.session,image:d.image,message:'用手机端扫码，并在手机上确认'};render();checkQr(d.session);},function(e){if(S.qr){S.qr.message=e.message||'无法生成二维码';render();}});}
  app.addEventListener('compositionstart',function(e){if(e.target.id==='cm-search'){searchComposing=true;clearTimeout(searchTimer);++searchSeq;}});
  app.addEventListener('compositionend',function(e){if(e.target.id==='cm-search'){searchComposing=false;S.search=e.target.value;requestSearch(false);}});
  app.addEventListener('input',function(e){if(e.target.id==='cm-volume'){audio.volume=(+e.target.value)/100;var out=document.getElementById('cm-volume-label');if(out)out.textContent=e.target.value+'%';return;}if(e.target.id!=='cm-search')return;S.search=e.target.value;if(!searchComposing&&!e.isComposing)requestSearch(false);});
  app.addEventListener('keydown',function(e){if(e.target.id!=='cm-search'||e.key!=='Enter'||searchComposing||e.isComposing||e.keyCode===229)return;e.preventDefault();S.search=e.target.value;requestSearch(true);e.target.blur();});
  app.addEventListener('click',function(e){var el=e.target.closest('[data-history],[data-history-clear]');if(!el)return;if(el.hasAttribute('data-history-clear')){searchHistory=[];try{localStorage.removeItem(historyKey);}catch(ignore){}renderSearchHistory();}else useSearchHistory(+el.getAttribute('data-history'));});
  window.addEventListener('storage',function(e){if(e.key===historyKey||e.key===null){searchHistory=readSearchHistory();if(S.libraryOpen)renderSearchHistory();}});
  app.addEventListener('click',function(e){var el=e.target.closest('button,[data-seek],[data-panel-close]');if(!el)return;if(el.hasAttribute('data-qr-close')){stopQr();return;}if(el.hasAttribute('data-qr')){startQr();return;}if(el.hasAttribute('data-library')){openLibrary();return;}if(el.hasAttribute('data-sync-library')){syncLibrary();return;}if(el.hasAttribute('data-panel-close')){S.libraryOpen=false;render();return;}if(el.hasAttribute('data-order')){changeOrder();return;}if(el.hasAttribute('data-like')){toggleLike();return;}if(el.hasAttribute('data-page-more')){moreLibrary();return;}if(el.hasAttribute('data-page-reload')){reloadLibrary();return;}if(el.hasAttribute('data-section')){showSection(el.getAttribute('data-section'));return;}if(el.hasAttribute('data-discovery-refresh')){loadDiscovery(true);return;}if(el.hasAttribute('data-recommend')){openRecommended(+el.getAttribute('data-recommend'));return;}if(el.hasAttribute('data-play-all')){var all=libraryTracks();if(all.length){S.tracks=all.slice();choose(0,true);}return;}if(el.hasAttribute('data-list')){loadList(el.getAttribute('data-list'));return;}if(el.hasAttribute('data-track')){selectLibraryTrack(+el.getAttribute('data-track'));return;}if(el.hasAttribute('data-search-type')){S.searchType=el.getAttribute('data-search-type');requestSearch(true);return;}if(el.hasAttribute('data-open-result')){openSearchResult(+el.getAttribute('data-open-result'));return;}if(el.hasAttribute('data-detail-back')){++searchSeq;S.detail=null;S.detailLoading=false;S.searchError='';renderLibraryContent();return;}if(el.hasAttribute('data-search-retry')){requestSearch(true);return;}if(el.hasAttribute('data-toggle')){toggle();return;}if(el.hasAttribute('data-skip')){skip(+el.getAttribute('data-skip'));return;}if(el.hasAttribute('data-lyrics')){details.open();return;}if(el.hasAttribute('data-seek')&&trackDuration()){var box=el.getBoundingClientRect();seekLyric(Math.max(0,Math.min(trackDuration(),(e.clientX-box.left)/box.width*trackDuration())));}});
  audio.volume=.65;try{if(parent!==window&&parent.HVDesktopHost&&parent.HVDesktopHost.silent())audio.muted=true;}catch(ignore){}
  var idleTimer=null,lastActivity=0;
  function setControlsVisible(visible){
    if(vinyl&&!vinylPlayer)visible=true;
    if(S.controlsVisible===visible)return;
    S.controlsVisible=visible;app.classList.toggle('controls-hidden',!visible);
    layoutCovers(gesture?gesture.dx:0,!!(gesture&&gesture.moved));positionLyrics();
    if(visible){updateProgress();if(S.lyricsOpen)updateLyrics();}
  }
  function idleControls(){
    if(vinyl&&!vinylPlayer)return;
    if(!HV.canWork()||S.libraryOpen||S.qr||gesture||lyricDrag||lyricWheelTimer){idleTimer=setTimeout(idleControls,5000);return;}
    setControlsVisible(false);
  }
  var pointerWasHidden=false,lastArtGesture=0,lastArtFullscreen=false;
  function noteActivity(event){
    if(event&&event.type==='click')event.hvMusicControl=!!event.target.closest('button,a,input,[data-seek],.cm-library,.cm-modal,.cm-song,.cm-artist,.cm-lyric-line,.cm-lyrics-heading');
    if(event&&(event.type==='touchstart'||event.type==='mousedown'&&Date.now()-lastTouch>700))pointerWasHidden=!S.controlsVisible;
    var now=Date.now();
    if(event&&!S.controlsVisible&&!S.libraryOpen&&!S.qr){
      var point=event.touches&&event.touches.length?event.touches[0]:event;
      var onArt=event.target.closest('[data-art-stage]')&&artHit(point.clientX,point.clientY);
      // A cover gesture changes the view, not the chrome. Ignore its delayed
      // compatibility mouse/click events after the cover has moved for lyrics.
      var afterArt=lastArtFullscreen&&now-lastArtGesture<700&&(event.type==='click'||event.type==='mousemove'||event.type==='mousedown'&&now-lastTouch<700);
      if(onArt||gesture&&gesture.fullscreen||afterArt&&!event.target.closest('button,a,input,[data-seek],.cm-library,.cm-modal')){
        if(event.type==='click')event.hvMusicControl=true;return;
      }
    }
    if(S.controlsVisible&&now-lastActivity<120)return;
    lastActivity=now;setControlsVisible(true);clearTimeout(idleTimer);idleTimer=setTimeout(idleControls,5000);
  }
  app.addEventListener('click',noteActivity,true);
  app.addEventListener('mousedown',noteActivity,true);
  app.addEventListener('touchstart',noteActivity,{passive:true,capture:true});
  app.addEventListener('touchmove',noteActivity,{passive:true});
  app.addEventListener('mousemove',noteActivity);
  app.addEventListener('wheel',noteActivity,{passive:true});
  app.addEventListener('keydown',function(e){noteActivity();if(e.target.id==='cm-search'&&e.key==='Enter'&&!searchComposing){e.preventDefault();requestSearch(true);}if(e.key==='Escape'&&S.libraryOpen){S.libraryOpen=false;render();}});
  app.addEventListener('focusin',noteActivity);
  app.addEventListener('click',function(e){
    if(e.hvMusicControl||S.libraryOpen||S.qr||Date.now()-lastArtGesture<100||Date.now()-lastLyricGesture<450)return;
    if(e.target.closest('button,a,input,[data-seek],.cm-library,.cm-modal,.cm-song,.cm-artist,.cm-lyric-line,.cm-lyrics-heading'))return;
    if(e.target.closest('[data-art-stage]')&&artHit(e.clientX,e.clientY))return;
    if(!pointerWasHidden){clearTimeout(idleTimer);setControlsVisible(false);}
  });
  document.addEventListener('visibilitychange',function(){if(!document.hidden)noteActivity();else rememberPosition(true);});
  window.HVMusicRemember=function(){rememberSession();rememberPosition(true);};
  window.addEventListener('pagehide',window.HVMusicRemember);
  audio.addEventListener('loadedmetadata',applyResume);audio.addEventListener('pause',function(){rememberPosition(true);});audio.addEventListener('seeked',function(){rememberPosition(true,true);});
  noteActivity();
  var gesture=null,lastTouch=0,dragFrame=0;
  window.HVMusicTrimUI=function(){
    if(hostVisible||gesture||lyricDrag||S.qr)return false;
    finishCoverFade();clearLyricMotion();++backdropSeq;ambientImage=null;
    if(window.HVVinylUI)HVVinylUI.trim();app.innerHTML='';renderedSong='';renderedLists='';renderedCovers='';
    HV.deferUI('music-render',render);return true;
  };
  function artHit(x,y){var cards=app.querySelectorAll('.cm-art-card');for(var i=cards.length-1;i>=0;i--){if(+cards[i].style.opacity<.1)continue;var r=cards[i].getBoundingClientRect();if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)return true;}return false;}
  function dragStart(x,y,target){if(!target.closest('[data-art-stage]')||!selected()||!artHit(x,y))return;finishCoverFade();var s=selected(),idx=S.tracks.findIndex(function(t){return t.id===s.id;});gesture={x:x,dx:0,moved:false,startIndex:idx,windowIndex:idx,fullscreen:!S.controlsVisible};}
  function dragMove(x){if(!gesture)return;if(external){if(Math.abs(x-gesture.x)>5)gesture.moved=true;return;}var unit=coverStep();var wasMoved=gesture.moved;gesture.dx=Math.max((gesture.startIndex-S.tracks.length+1)*unit,Math.min(gesture.startIndex*unit,x-gesture.x));if(Math.abs(gesture.dx)>5)gesture.moved=true;if(!gesture.moved)return;app.classList.add('is-dragging');if(!dragFrame)dragFrame=requestAnimationFrame(function(){dragFrame=0;if(!gesture)return;var center=Math.max(0,Math.min(S.tracks.length-1,Math.round(gesture.startIndex-gesture.dx/coverStep())));if(center!==gesture.windowIndex||!wasMoved){gesture.windowIndex=center;reconcileCovers(coverMarkup());}layoutCovers(gesture.dx,true);});}
  function dragEnd(){if(!gesture)return;if(dragFrame){cancelAnimationFrame(dragFrame);dragFrame=0;}var dx=gesture.dx,moved=gesture.moved,i=gesture.startIndex;lastArtFullscreen=gesture.fullscreen;gesture=null;lastArtGesture=Date.now();app.classList.remove('is-dragging');if(Math.abs(dx)>coverStep()*.42&&i>=0){var steps=Math.round(-dx/coverStep())||(dx<0?1:-1),next=Math.max(0,Math.min(S.tracks.length-1,i+steps));if(next!==i){choose(next,true,'flow');return;}}reconcileCovers(coverMarkup());layoutCovers(0,false);if(!moved)showLyrics();}
  app.addEventListener('touchstart',function(e){if(e.touches.length===1)dragStart(e.touches[0].clientX,e.touches[0].clientY,e.target);},{passive:true});
  app.addEventListener('touchmove',function(e){if(gesture&&e.touches.length===1){dragMove(e.touches[0].clientX);e.preventDefault();}},{passive:false});
  app.addEventListener('touchend',function(){lastTouch=Date.now();dragEnd();});app.addEventListener('touchcancel',function(){lastTouch=Date.now();if(dragFrame){cancelAnimationFrame(dragFrame);dragFrame=0;}gesture=null;app.classList.remove('is-dragging');reconcileCovers(coverMarkup());layoutCovers(0,false);});
  app.addEventListener('mousedown',function(e){if(e.button===0&&Date.now()-lastTouch>700)dragStart(e.clientX,e.clientY,e.target);});
  document.addEventListener('mousemove',function(e){if(gesture)dragMove(e.clientX);});document.addEventListener('mouseup',dragEnd);
  window.addEventListener('resize',function(){lyricEnd(true);if(!gesture)layoutCovers(0,false);});
  app.addEventListener('scroll',function(e){var box=e.target;if(box.id==='cm-library-results'){if(box.scrollTop+box.clientHeight>box.scrollHeight-160)moreLibrary();var owner=pagedList();if(owner&&owner.snapshot){var count=Math.min(libraryTracks().length,libraryLimit),start=Math.max(0,Math.min(count-1,Math.floor(box.scrollTop/68)-8));if(start!==+box.getAttribute('data-window-start'))renderLibraryContent();}}else if(box.classList.contains('cm-lists')&&box.scrollLeft+box.clientWidth>box.scrollWidth-160&&listLimit<S.lists.length){listLimit+=12;render();}},true);
  audio.addEventListener('timeupdate',function(){rememberPosition(false);if(hostVisible&&HV.canWork()&&!S.libraryOpen){if(S.controlsVisible)updateProgress();if(S.lyricsOpen)updateLyrics();}});audio.addEventListener('ended',function(){S.playing=false;advancePlayback(1,true);});
  window.addEventListener('message',function(e){
    if(e.source!==window.parent||e.origin!==location.origin||!e.data)return;var d=e.data;
    if(d.type==='hv-music:silent'){audio.muted=!!d.muted;return;}
    if(d.type==='hv-music:skin'){setSkin(d.skin==='vinyl');return;}
    if(d.type==='hv-music:visibility'){var wasVisible=hostVisible;hostVisible=!!d.visible;HV.setHostState(hostVisible,d.moving);if(!hostVisible)rememberPosition(true);if(hostVisible&&!wasVisible)noteActivity();if(hostVisible){render();if(!wasVisible)refreshDiscoveryIfDue();}publishState();return;}
    if(d.type!=='hv-music:action')return;
    if(d.action==='toggle')toggle();else if(d.action==='previous')skip(-1);else if(d.action==='next')skip(1);
    else if(/^select:[0-9]+$/.test(d.action)&&!external){var ix=S.tracks.findIndex(function(t){return String(t.id)===d.action.slice(7);});if(ix>=0)choose(ix,true,'flow');}
    else if(d.action==='back'){if(window.HVAirPlay&&HVAirPlay.back())return;if(details.back())return;if(S.qr)stopQr();else if(S.libraryOpen){S.libraryOpen=false;render();}else if(S.lyricsOpen)showLyrics();else window.parent.postMessage({type:'hv-music:home'},location.origin);}
  });
  window.HVExternalMusic=function(state){
    var active=state&&state.enabled&&(state.streaming||state.title||state.art_version),nextKey=active?[state.title,state.artist,state.album,state.art_version,!!state.streaming,state.playing,state.remote_available].join('|'):'';
    if(active){
      if(!external){rememberSession();rememberPosition(true);localLyrics=S.lyrics;S.libraryOpen=false;S.error='';S.loading=false;playback.stop();}
      external=state;var metadataKey=[state.title||'',state.artist||'',state.album||''].join('|');
      external.track={id:'airplay:'+metadataKey,title:state.title||'AirPlay 音乐',artist:state.artist||'来自 iPhone 或 Mac',album:state.album||'',art:state.art_version?'/api/airplay/art?v='+state.art_version:'',duration:(state.duration_ms||0)/1000};
      if(remoteLyricKey!==metadataKey){remoteLyricKey=metadataKey;++lyricSeq;clearTimeout(lyricTimer);clearLyricMotion();pendingLyricSeek=null;S.lyrics=null;S.lyricIndex=-1;if(S.lyricsOpen)loadLyrics();}
    }else if(external){external=null;++lyricSeq;clearTimeout(lyricTimer);remoteLyricKey='';clearLyricMotion();S.lyrics=localLyrics;S.lyricIndex=-1;S.playing=false;if(S.lyricsOpen&&S.lyrics===null)loadLyrics();}
    if(nextKey!==externalKey){externalKey=nextKey;coverTransition='fade';render();}
    else if(external&&hostVisible&&HV.canWork()&&!S.libraryOpen){if(S.controlsVisible)updateProgress();if(S.lyricsOpen)updateLyrics();}
  };
  // Presentation callbacks expose no cookies or account credentials. Both entries
  // retain this single audio element, queue, API boundary and playback order.
  setInterval(refreshDiscoveryIfDue,60000);
  window.HVMusicPresentation={
    snapshot:function(){return {vinyl:vinyl,playerOpen:vinylPlayer,track:selected(),playing:external?!!external.streaming&&external.playing!==false:S.playing,signedIn:!!(S.status&&S.status.signed_in),tracks:S.tracks,browseTracks:S.browseTracks,lists:S.lists,recommended:S.recommended,daily:S.daily,dailyDate:S.dailyDate,syncing:!!librarySync,syncText:libraryText,lyricsOpen:S.lyricsOpen,libraryOpen:S.libraryOpen,qr:S.qr};},
    art:artUrl,playlist:playlistPage,morePlaylist:morePlaylist,artist:artistSongs,discovery:discoveryData,discoveryDue:discoveryDue,syncLibrary:syncLibrary,
    library:openLibrary,
    player:function(){if(!selected()){S.libraryOpen=true;render();return;}vinylPlayer=true;S.libraryOpen=false;render();noteActivity();if(S.lyricsOpen&&S.lyrics===null)loadLyrics();},
    shelf:function(){vinylPlayer=false;S.lyricsOpen=false;clearLyricMotion();render();noteActivity();},toggle:toggle,
    playBook:function(book,i){if(!book||!book.items||!book.items[i]||book.items[i].unavailable)return;var id=book.items[i].id;queueOwner=book.page||null;S.tracks=book.items.filter(function(t){return !t.unavailable;});i=S.tracks.findIndex(function(t){return t.id===id;});if(book.item.kind==='playlist'){S.list=book.page||{id:book.item.id,name:book.item.name,items:book.items};S.browseTracks=S.list.items;}choose(i,true);}
  };
  api('status').then(function(d){S.status=d;var resumed=d.signed_in?session.read(sessionAccount()):null;
    if(resumed){S.selected=resumed.track;S.tracks=resumed.tracks;pendingResume={id:resumed.track.id,time:session.cursor(resumed.track.id)};syncOrder();}
    else if(d.configured===false)session.clear();render();
    if(d.signed_in){loadLikes(false).catch(function(){});requestMyLists().then(function(items){S.lists=items;render();var initial=resumed&&resumed.source?resumed.source.id:S.lists.length?S.lists[0].id:null;if(initial)loadList(initial,resumed);},function(e){S.error=e.message;render();});}
  },function(e){S.status={signed_in:false};S.error=e.message;render();});
})();
