/* Continuous skinning of one raster pose. No pose crossfade or double exposure.
   Head, arm and torso weights leave feet / seated hips fixed. WebGL / Canvas fallback, ES5. */
(function(){
 'use strict';
 var A='/frame/hv/standby/island/assets/',tips=[
  [
    {
      "x": 142.13,
      "y": 190.03
    },
    {
      "x": 164.73,
      "y": 177.12
    }
  ],
  [
    {
      "x": 154.11,
      "y": 181.28
    },
    {
      "x": 167.66,
      "y": 179.99
    }
  ],
  [
    {
      "x": 144.26,
      "y": 186.45
    },
    {
      "x": 174.6,
      "y": 194.19
    }
  ],
  [
    {
      "x": 146.2,
      "y": 173.54
    },
    {
      "x": 172.66,
      "y": 199.36
    }
  ],
  [
    {
      "x": 146.36,
      "y": 187.74
    },
    {
      "x": 165.08,
      "y": 189.67
    }
  ],
  [
    {
      "x": 145.36,
      "y": 191.32
    },
    {
      "x": 167.95,
      "y": 185.51
    }
  ],
  [
    {
      "x": 140.26,
      "y": 191.96
    },
    {
      "x": 171.24,
      "y": 184.86
    }
  ],
  [
    {
      "x": 148.01,
      "y": 189.38
    },
    {
      "x": 173.83,
      "y": 183.57
    }
  ]
];
 function mount(root,canvas,theme){
  var image=new Image(),bitmap=document.createElement('canvas'),bx=bitmap.getContext('2d'),ready=false,disposed=false,raf=0,last=0,painted=0,acc=0,time=0,frames=0,meterAt=0,meterFrames=0;
  var media=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)'),aquarium=theme==='aquarium',summer=theme==='beach';
  var px=aquarium?720:summer?650:540,py=aquarium?478:summer?465:432,pw=aquarium||summer?340:320,ph=aquarium||summer?272:256;
  canvas.width=bitmap.width=320;canvas.height=bitmap.height=256;
  var gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true}),ctx=gl?null:canvas.getContext('2d'),cols=gl?24:10,rows=gl?28:12,vertices=[],uv=[],indices=[],positions,program,vertexBuffer;
  function smooth(a,b,v){var x=Math.max(0,Math.min(1,(v-a)/(b-a)));return x*x*(3-2*x);}
  function deform(x,y){
   if(summer){
    /* Seated rig: hips, bent knees and sandals stay planted in the sand. */
    if(y>=216)return {x:x,y:y};
    var seatedWho=x<160?0:1,seatedCx=seatedWho?235:80,seatedPhase=seatedWho?2.4:0,seatedNeck=seatedWho?151:145;
    var tilt=Math.sin(time*.71+seatedPhase)*.025,head=1-smooth(seatedNeck-8,seatedNeck+22,y),sx=x-seatedCx,sy=y-seatedNeck;
    var seatedX=x+((sx*Math.cos(tilt)-sy*Math.sin(tilt))-sx)*head,seatedY=y+((sx*Math.sin(tilt)+sy*Math.cos(tilt))-sy)*head;
    var torso=smooth(133,157,y)*(1-smooth(185,216,y));
    seatedY-=Math.sin(time*1.15+seatedPhase)*.8*torso;
    seatedX+=Math.sin(time*.53+seatedPhase)*.6*(1-smooth(169,216,y));
    var wristX=seatedWho?207:112,wristY=seatedWho?181:179,wrist=Math.exp(-((x-wristX)*(x-wristX)/324+(y-wristY)*(y-wristY)/196));
    seatedX+=Math.sin(time*.91+seatedPhase)*.65*wrist;seatedY+=Math.sin(time*.91+seatedPhase+.8)*.35*wrist;
    return {x:seatedX,y:seatedY};
   }
   if(y>=237)return {x:x,y:y};
   var who=x<160?0:1,cx=who?240:80,phase=who?2.5:0,neck=aquarium?132:summer?121:113;
   var angle=Math.sin(time*.83+phase)*.027,weight=1-smooth(neck-10,neck+21,y),dx=x-cx,dy=y-neck;
   var nx=x+((dx*Math.cos(angle)-dy*Math.sin(angle))-dx)*weight,ny=y+((dx*Math.sin(angle)+dy*Math.cos(angle))-dy)*weight;
   var chest=(1-smooth(192,237,y))*smooth(80,128,y),breath=Math.sin(time*1.28+phase)*.55;
   ny-=breath*chest;nx+=Math.sin(time*.57+phase)*.5*(1-smooth(175,237,y));
   var ax=who?aquarium?273:219:106,ay=aquarium?146:summer?138:132;
   var hx=who?aquarium?282:195:126,hy=aquarium?178:summer?178:164;
   var gate=who?(aquarium?smooth(258,275,x):1-smooth(214,233,x)):smooth(98,115,x);
   var fall=Math.exp(-((x-hx)*(x-hx)/(39*39)+(y-hy)*(y-hy)/(49*49)))*gate*smooth(neck+2,neck+19,y)*(1-smooth(211,237,y));
   var arm=Math.sin(time*(aquarium?.72:1.05)+phase)*(aquarium?.11:summer?.09:.075),rx=x-ax,ry=y-ay;
   nx+=((rx*Math.cos(arm)-ry*Math.sin(arm))-rx)*fall;ny+=((rx*Math.sin(arm)+ry*Math.cos(arm))-ry)*fall;
   return {x:nx,y:ny};
  }
  for(var y=0;y<=rows;y++)for(var x=0;x<=cols;x++){vertices.push({x:x/cols*320,y:y/rows*256});uv.push(x/cols,y/rows);}
  for(var r=0;r<rows;r++)for(var c=0;c<cols;c++){var a=r*(cols+1)+c,b=a+1,d=a+cols+1,e=d+1;indices.push(a,b,d,b,e,d);}
  positions=new Float32Array(vertices.length*2);
  function shader(type,source){var s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('Character shader failed');return s;}
  if(gl){
   program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 a_pos;attribute vec2 a_uv;varying vec2 v_uv;void main(){v_uv=a_uv;gl_Position=vec4((a_pos/vec2(320.0,256.0)*2.0-1.0)*vec2(1.0,-1.0),0.0,1.0);}'));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 v_uv;uniform sampler2D u_image;void main(){gl_FragColor=texture2D(u_image,v_uv);}'));gl.linkProgram(program);gl.useProgram(program);
   vertexBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer);gl.bufferData(gl.ARRAY_BUFFER,positions,gl.DYNAMIC_DRAW);var loc=gl.getAttribLocation(program,'a_pos');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
   var u=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,u);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(uv),gl.STATIC_DRAW);loc=gl.getAttribLocation(program,'a_uv');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
   var ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.viewport(0,0,320,256);
  }
  function triangle(a,b,c,da,db,dc){
   var det=a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y);if(!det)return;
   function coef(k){var v0=da[k],v1=db[k],v2=dc[k];return [(v0*(b.y-c.y)+v1*(c.y-a.y)+v2*(a.y-b.y))/det,(v0*(c.x-b.x)+v1*(a.x-c.x)+v2*(b.x-a.x))/det,(v0*(b.x*c.y-c.x*b.y)+v1*(c.x*a.y-a.x*c.y)+v2*(a.x*b.y-b.x*a.y))/det];}
   var xx=coef('x'),yy=coef('y');ctx.save();ctx.beginPath();ctx.moveTo(da.x,da.y);ctx.lineTo(db.x,db.y);ctx.lineTo(dc.x,dc.y);ctx.closePath();ctx.clip();ctx.transform(xx[0],yy[0],xx[1],yy[1],xx[2],yy[2]);ctx.drawImage(bitmap,0,0);ctx.restore();
  }
  function draw(){
   if(!ready)return;var points=vertices.map(function(p){return deform(p.x,p.y);}),i;
   if(gl){for(i=0;i<points.length;i++){positions[i*2]=points[i].x;positions[i*2+1]=points[i].y;}gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,positions);gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);}
   else{ctx.clearRect(0,0,320,256);for(i=0;i<indices.length;i+=3){var a=indices[i],b=indices[i+1],c=indices[i+2];triangle(vertices[a],vertices[b],vertices[c],points[a],points[b],points[c]);}}
   if(frames%5===0)canvas.setAttribute('data-people-frame',time.toFixed(2));
  }
  function active(){return ready&&!disposed&&!(media&&media.matches)&&!document.hidden&&!root.classList.contains('island-paused');}
  function step(stamp){
   if(disposed)return;if(!document.documentElement.contains(root)){destroy();return;}if(!active()){raf=0;canvas.setAttribute('data-people-state','paused');return;}raf=requestAnimationFrame(step);acc+=Math.max(0,stamp-last);last=stamp;if(acc+.5<1000/30)return;acc=Math.max(0,acc-1000/30);if(acc>1000/30)acc%=1000/30;time+=Math.min(.08,(stamp-painted)/1000);painted=stamp;frames++;draw();meterFrames++;if(stamp-meterAt>=2000){canvas.setAttribute('data-people-fps',(meterFrames*1000/(stamp-meterAt)).toFixed(1));meterAt=stamp;meterFrames=0;}
  }
  function sync(){if(disposed)return;if(active()&&!raf){last=painted=meterAt=performance.now();acc=0;meterFrames=0;canvas.setAttribute('data-people-state','running');raf=requestAnimationFrame(step);}else if(!active()){if(raf)cancelAnimationFrame(raf);raf=0;canvas.setAttribute('data-people-state','paused');}}
  function hands(){return tips[0].map(function(p){var v=deform(p.x,p.y);return {x:px+v.x*pw/320,y:py+v.y*ph/256};});}
  function destroy(){disposed=true;if(raf)cancelAnimationFrame(raf);raf=0;if(media&&media.removeListener)media.removeListener(sync);image.onload=null;if(gl){var loss=gl.getExtension('WEBGL_lose_context');if(loss)loss.loseContext();}}
  image.onload=function(){if(disposed)return;bx.drawImage(image,0,0,320,256,0,0,320,256);bx.globalCompositeOperation='destination-over';bx.fillStyle=summer?'rgba(101,71,36,.15)':'rgba(2,8,22,.2)';bx.shadowColor=summer?'rgba(101,71,36,.18)':'rgba(2,8,22,.25)';bx.shadowBlur=7;[80,240].forEach(function(x){bx.beginPath();bx.ellipse(x,summer?230:248,summer?35:25,summer?6:4,0,0,Math.PI*2);bx.fill();});
   if(gl){var tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);}ready=true;draw();sync();};
  canvas.setAttribute('data-people-renderer',gl?'webgl-mesh':'canvas-mesh');canvas.setAttribute('data-people-pose',summer?'seated-back':'standing');canvas.setAttribute('data-people-state','loading');image.src=A+(aquarium?'aquarium-people-pose-v4.webp':summer?'beach-people-back-v6.png':'people-pose-v4.webp');if(media&&media.addListener)media.addListener(sync);return {sync:sync,destroy:destroy,hands:hands};
 }
 window.HVIslandPeople={mount:mount};
})();
