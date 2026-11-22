/* Island motion v4. A projected shell, persistent willow trails and separate embers.
   The source video is the timing reference; no game footage is played by this preview.
   ES5, bounded particle counts, 30fps target with measured draw cadence, all buffers are local and small. */
(function(){
 'use strict';
 var colors={purple:'#eea1fa',gold:'#ffe0a6',orange:'#ffac83',green:'#d0f489'},lights={};
 /* Cached point-spread textures are light effects, not scene illustrations. */
 function light(color){
  if(lights[color])return lights[color];
  var c=document.createElement('canvas'),x;c.width=c.height=32;x=c.getContext('2d');
  var g=x.createRadialGradient(16,16,0,16,16,16);g.addColorStop(0,'#fff8e7');g.addColorStop(.09,color);g.addColorStop(.24,color);g.addColorStop(1,'rgba(0,0,0,0)');
  x.fillStyle=g;x.fillRect(0,0,32,32);lights[color]=c;return c;
 }
 function mount(root,canvas,water,pair){
  var media=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)'),ctx;
  var W=740,H=710,particles=[],embers=[],rockets=[],flashes=[],raf=0,last=0,time=0,next=0,cycle=0,disposed=false,frames=0,lit=-1,acc=0,painted=0,meterAt=0,meterFrames=0;
  var hands=[{x:112,y:627,color:'#dffaff'},{x:153,y:617,color:colors.gold}];
  var waterFX=HVIslandWater.mount(water,'/frame/hv/standby/island/assets/fireworks-public.svg',90,480,1000,154);
  var plans=[{at:.15,type:'willow',x:358,y:155},{at:3.0,type:'inner',x:354,y:158},{at:10.8,type:'gold',x:510,y:165},{at:14.0,type:'ring',x:245,y:142},{at:18.2,type:'peony',x:420,y:153}];
  canvas.width=W/2;canvas.height=H/2;ctx=HVIslandInk.create(canvas,W,H);var batched=!!ctx;if(!ctx){ctx=canvas.getContext('2d');ctx.scale(.5,.5);}

  function rand(a,b){return a+Math.random()*(b-a);}
  function point(x,y,size,color,alpha){if(alpha<=0)return;if(batched){ctx.point(x,y,size,color,Math.min(1,alpha));return;}ctx.globalAlpha=Math.min(1,alpha);ctx.drawImage(light(color),x-size/2,y-size/2,size,size);}
  function burst(type,x,y){
   var willow=type==='willow',ring=type==='ring',count=willow?62:type==='inner'?30:ring?72:type==='gold'?48:58;
   if(particles.length>170)particles.splice(0,particles.length-170);
   flashes.push({x:x,y:y,age:0,color:type==='willow'||type==='inner'?colors.purple:colors.gold});
   for(var i=0;i<count;i++){
    var inner=ring&&i<24,n=inner?24:48,index=inner?i:i-24;
    var az=i*2.39996323+rand(-.06,.06),sy=1-2*(i+.5)/count,rad=Math.sqrt(1-sy*sy),sx=Math.cos(az)*rad,sz=Math.sin(az)*rad;
    if(ring){az=index/n*Math.PI*2;sx=Math.cos(az);sy=Math.sin(az);sz=rand(-.12,.12);}
    var speed=willow?rand(99,113):type==='inner'?rand(30,46):ring?(inner?47:94):type==='gold'?rand(49,93):rand(80,111);
    var depth=.78+sz*.22,color=willow||type==='inner'?colors.purple:ring?(inner?colors.green:colors.orange):type==='gold'?colors.gold:colors.orange;
    particles.push({x:x,y:y,vx:sx*speed,vy:sy*speed-(willow?15:0),age:0,life:willow?rand(8.1,9.9):type==='inner'?rand(2.2,3.2):rand(2.1,3.8),willow:willow,color:color,depth:depth,history:[],sample:0,emit:rand(0,.2),phase:rand(0,7),tip:willow?colors.gold:color});
   }
   canvas.setAttribute('data-burst-type',type);
  }
  function spark(x,y,vx,vy,life,color,size,hand){
   if(hand&&embers.length>=175)embers.shift();
   if(embers.length<175)embers.push({x:x,y:y,vx:vx,vy:vy,age:0,life:life,color:color,size:size,hand:!!hand});
  }
  function rocket(plan){
   if(plan.type==='inner'){burst(plan.type,plan.x,plan.y);return;}
   rockets.push({x:plan.x,start:478,y:478,target:plan.y,age:0,duration:1.1,type:plan.type,history:[]});
  }
  function trail(p,alpha){
   var h=p.history,len=h.length;if(len<2)return;
   /* Five age bands fade the rear of each trail. No ring of equal length wires. */
   for(var band=0;band<5;band++){
    var a=Math.floor((len-1)*band/5),b=Math.min(len-1,Math.floor((len-1)*(band+1)/5));if(a===b)continue;
    ctx.beginPath();ctx.moveTo(h[a].x,h[a].y);for(var j=a+Math.max(1,Math.floor((b-a)/3));j<b;j+=Math.max(1,Math.floor((b-a)/3)))ctx.lineTo(h[j].x,h[j].y);ctx.lineTo(h[b].x,h[b].y);
    var strength=(.08+.92*Math.pow((band+1)/5,.7))*alpha;
    ctx.globalAlpha=strength*.22;ctx.strokeStyle=p.color;ctx.lineWidth=p.willow?5.5:3.2;ctx.stroke();
    ctx.globalAlpha=strength;ctx.strokeStyle=p.color;ctx.lineWidth=(p.willow?2.4:1.7)*(.7+.3*p.depth);ctx.stroke();
   }
  }
  function draw(dt){
   time+=dt;frames++;ctx.clearRect(0,0,W,H);ctx.lineCap='round';ctx.lineJoin='round';
   while(time>=cycle+plans[next].at){rocket(plans[next]);next++;if(next===plans.length){next=0;cycle+=24;}}
   var i,j,p,alpha,glow=0;
   ctx.save();ctx.beginPath();ctx.rect(0,0,W,478);ctx.clip();
   for(i=flashes.length-1;i>=0;i--){p=flashes[i];p.age+=dt;if(p.age>.6){flashes.splice(i,1);continue;}alpha=Math.pow(1-p.age/.6,3);point(p.x,p.y,120,p.color,alpha*.27);point(p.x,p.y,24,p.color,alpha);glow=Math.max(glow,alpha);}
   for(i=rockets.length-1;i>=0;i--){
    var r=rockets[i];r.age+=dt;var f=Math.min(1,r.age/r.duration);r.y=r.start+(r.target-r.start)*(1-Math.pow(1-f,1.6));
    r.history.push({x:r.x,y:r.y});if(r.history.length>5)r.history.shift();
    ctx.beginPath();for(j=0;j<r.history.length;j++){if(j===0)ctx.moveTo(r.x,r.history[j].y);else ctx.lineTo(r.x,r.history[j].y);}ctx.lineWidth=1;ctx.strokeStyle=colors.gold;ctx.globalAlpha=.8;ctx.stroke();point(r.x,r.y,6,colors.gold,1);
    if(f>=1){burst(r.type,r.x,r.target);rockets.splice(i,1);}
   }
   for(i=particles.length-1;i>=0;i--){
    p=particles[i];p.age+=dt;if(p.age>p.life||p.y>560){particles.splice(i,1);continue;}
    var drag=Math.exp(-(p.willow?.36:.8)*dt);p.vx*=drag;p.vy*=drag;p.vy+=(p.willow?29:18)*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;
    p.sample+=dt;if(p.sample>=.075){p.sample=0;p.history.push({x:p.x,y:p.y});if(p.history.length>(p.willow?60:12))p.history.shift();}
    alpha=Math.min(1,p.age/.09)*Math.pow(Math.max(0,1-p.age/p.life),p.willow?.4:.75)*p.depth;
    var flutter=p.age>p.life*.65?.55+.45*Math.sin(p.age*24+p.phase):1;
    trail(p,alpha*(p.willow?.98:.78));point(p.x,p.y,p.willow?9:7,p.tip,alpha*flutter);
    p.emit+=dt;if(p.emit>(p.willow?.2:.14)){p.emit=0;spark(p.x,p.y,p.vx*.12+rand(-3,3),rand(2,12),rand(.3,.8),p.tip,rand(2,4));}
   }
   ctx.restore();
   /* Two small, independent gravity-driven sparklers, pinned to the girls' hands. */
   var movingHands=root._islandPeople&&root._islandPeople.hands();
   for(i=0;i<hands.length;i++){var hand=hands[i];if(movingHands){hand.x=movingHands[i].x-540;hand.y=movingHands[i].y;}if(frames%2===0)spark(hand.x,hand.y,rand(-47,47),rand(-48,20),rand(.35,.85),hand.color,rand(4,6),true);point(hand.x,hand.y,17,hand.color,.8+Math.sin(time*(21+i*3))*.15);}
   for(i=embers.length-1;i>=0;i--){p=embers[i];p.age+=dt;if(p.age>p.life){embers.splice(i,1);continue;}p.vy+=(p.hand?75:40)*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;alpha=Math.pow(1-p.age/p.life,.65);if(p.hand){ctx.beginPath();ctx.moveTo(p.x-p.vx*.07,p.y-p.vy*.07);ctx.lineTo(p.x,p.y);ctx.strokeStyle=p.color;ctx.lineWidth=1.15;ctx.globalAlpha=alpha*.9;ctx.stroke();}point(p.x,p.y,p.size,p.color,alpha);}
   var level=Math.round(glow*8)/8;
   if(pair&&level!==lit){pair.style.filter='brightness('+(1+level*.24).toFixed(3)+') saturate(.92)';lit=level;}
   waterFX.draw(time,glow);ctx.globalAlpha=1;if(batched)ctx.flush();
   if(frames%24===0){canvas.setAttribute('data-fx-frame',String(frames));canvas.setAttribute('data-fx-particles',String(particles.length+embers.length));}
  }
  function step(stamp){
   if(disposed)return;if(!document.documentElement.contains(root)){destroy();return;}
   if(document.hidden||root.classList.contains('island-paused')){raf=0;canvas.setAttribute('data-fx-state','paused');return;}
   raf=requestAnimationFrame(step);acc+=Math.max(0,stamp-last);last=stamp;if(acc+.5<1000/30)return;acc=Math.max(0,acc-1000/30);if(acc>1000/30)acc=acc%(1000/30);var dt=Math.min(.075,(stamp-painted)/1000||.033);painted=stamp;draw(dt);meterFrames++;if(stamp-meterAt>=2000){canvas.setAttribute('data-fx-fps',(meterFrames*1000/(stamp-meterAt)).toFixed(1));meterAt=stamp;meterFrames=0;}
  }
  function sync(){
   if(disposed)return;if(!document.documentElement.contains(root)){destroy();return;}
   var active=!(media&&media.matches)&&!document.hidden&&!root.classList.contains('island-paused');
   if(active&&!raf){last=painted=meterAt=performance.now();acc=0;meterFrames=0;canvas.setAttribute('data-fx-state','running');raf=requestAnimationFrame(step);}
   else if(!active){if(raf)cancelAnimationFrame(raf);raf=0;canvas.setAttribute('data-fx-state','paused');}
  }
  function destroy(){disposed=true;if(media&&media.removeListener)media.removeListener(sync);if(raf)cancelAnimationFrame(raf);raf=0;waterFX.destroy();if(batched)ctx.destroy();particles=[];embers=[];rockets=[];flashes=[];}
  if(media&&media.addListener)media.addListener(sync);requestAnimationFrame(sync);return {sync:sync,destroy:destroy};
 }
 window.HVIslandFireworks={mount:mount};
})();
