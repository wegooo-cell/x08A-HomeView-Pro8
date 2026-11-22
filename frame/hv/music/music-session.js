/* Private local metadata only. No cookies, media URLs, autoplay or large queues. ES5. */
(function(root){'use strict';
var KEY='homeview:music-last-session:v1',POS=KEY+':position',PLAYED=KEY+':played',LIMIT=80;
function text(v,n){return typeof v==='string'?v.slice(0,n):'';}
function id(v){return /^[0-9]{1,20}$/.test(String(v||''))?String(v):'';}
function clean(t){if(!t||!id(t.id)||t.unavailable)return null;var art=text(t.art,512);return {id:id(t.id),title:text(t.title,200),artist:text(t.artist,160),album:text(t.album,160),artistId:id(t.artistId),artistName:text(t.artistName,160),art:/^https?:\/\/[a-z0-9.-]+\.music\.126\.net\//i.test(art)?art:'',duration:isFinite(+t.duration)?Math.max(0,Math.min(86400,+t.duration)):0};}
function Session(storage){
 this.clear=function(){try{storage.removeItem(KEY);storage.removeItem(POS);}catch(ignore){}};
 this.save=function(account,track,queue,owner){try{
  track=clean(track);if(!track||!account)return false;
  var at=-1;for(var i=0;i<queue.length;i++)if(String(queue[i].id)===track.id){at=i;break;}
  var begin=Math.max(0,at-30),items=[],seen={};
  for(i=begin;i<queue.length&&items.length<LIMIT;i++){var t=clean(queue[i]);if(t&&!seen[t.id]){seen[t.id]=true;items.push(t);}}
  if(!seen[track.id])items=[track];
  var source=null;
  if(owner&&id(owner.id)&&/^[a-f0-9]{64}$/.test(owner.revision||'')&&items.length){
   var all=owner.items||[],first=-1,last=-1;
   for(i=0;i<all.length;i++){if(String(all[i].id)===items[0].id)first=i;if(String(all[i].id)===items[items.length-1].id)last=i;}
   if(first>=0&&last>=first)source={id:id(owner.id),revision:owner.revision,offset:(+owner.offset||0)+first,next_offset:(+owner.offset||0)+last+1};
  }
  storage.setItem(KEY,JSON.stringify({v:1,account:text(account,160),track:track,tracks:items,source:source}));return true;
 }catch(ignore){return false;}};
 this.read=function(account){try{
  var raw=storage.getItem(KEY);if(!raw||raw.length>196608)return null;var s=JSON.parse(raw),track=clean(s.track);
  if(s.v!==1||!track||text(account,160)!==s.account||!Array.isArray(s.tracks)||s.tracks.length>LIMIT)return null;
  var items=[],seen={};s.tracks.forEach(function(t){t=clean(t);if(t&&!seen[t.id]){seen[t.id]=true;items.push(t);}});if(!seen[track.id])items=[track];
  var q=s.source,source=q&&id(q.id)&&/^[a-f0-9]{64}$/.test(q.revision||'')&&q.offset>=0&&q.next_offset>q.offset&&q.next_offset<=10000000?{id:id(q.id),revision:q.revision,offset:Math.floor(q.offset),next_offset:Math.floor(q.next_offset)}:null;
  return {track:track,tracks:items,source:source};
 }catch(ignore){return null;}};
 this.markPlayed=function(track){try{
  track=clean(track);if(!track)return;
  var value=JSON.stringify(track);if(storage.getItem(PLAYED)!==value)storage.setItem(PLAYED,value);
 }catch(ignore){}};
 this.lastPlayed=function(){try{
  var played=clean(JSON.parse(storage.getItem(PLAYED)||'null'));if(played)return played;
  var raw=storage.getItem(KEY);if(!raw||raw.length>196608)return null;
  var old=JSON.parse(raw),track=old.v===1&&clean(old.track);
  if(track&&this.cursor(track.id)>0){this.markPlayed(track);return track;}
 }catch(ignore){}return null;};
 this.position=function(track,value){try{if(id(track)&&isFinite(value)&&value>=0&&value<=86400)storage.setItem(POS,JSON.stringify({id:String(track),time:value}));}catch(ignore){}};
 this.cursor=function(track){try{var p=JSON.parse(storage.getItem(POS)||'null');return p&&String(p.id)===String(track)&&isFinite(p.time)&&p.time>=0&&p.time<=86400?p.time:0;}catch(ignore){return 0;}};
}
root.HVMusicSession=Session;if(typeof module!=='undefined'&&module.exports)module.exports=Session;
})(typeof window!=='undefined'?window:globalThis);
