/* One pose per species, continuously skinned fins and tail. No pose blending.
   All 50 fish share one WebGL mesh/texture/draw call; ES5 Canvas strip fallback. */
(function(){
 'use strict';
 function mount(root,canvas,floor){
  var image=new Image(),sea=new Image(),ready=false,floorReady=false,disposed=false,raf=0,last=0,time=0,frame=0,acc=0,painted=0,meterAt=0,meterFrames=0;
  var media=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)');
  canvas.width=1280;canvas.height=550;var water=HVIslandWater.mount(floor,'/frame/hv/standby/island/assets/aquarium-public.svg',470,650,790,140);
  var gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false}),ctx=null,program=null,timeLoc,indexCount=0,texture=null;
  var rows=[{y:0,h:234},{y:234,h:350},{y:584,h:184}],buffers=[],sources=[];
  function smooth(a,b,v){var n=Math.max(0,Math.min(1,(v-a)/(b-a)));return n*n*(3-2*n);}
  function deform(row,x,y,phase){
   var nx=x,ny=y,wave;
   if(row===1){
    /* Dorsal and anal fins flex from their roots, leaving the round face still. */
    var top=1-smooth(12,97,y),bottom=smooth(263,345,y),tail=smooth(362,407,x);
    nx+=Math.sin(time*2.6+phase)*top*15-Math.sin(time*2.6+phase+.5)*bottom*13;
    ny+=Math.sin(time*2.6+phase+1.1)*tail*4;
    nx-=Math.sin(time*2.6+phase)*tail*2;
   }else{
    var rate=row===0?2.1:7,body=smooth(155,489,x),tail=smooth(401,504,x);
    wave=Math.sin(time*rate+phase-body*1.8);
    ny+=wave*body*body*(row===0?9:10);
    nx+=Math.sin(time*rate+phase-1.8)*tail*(row===0?7:10);
    /* The visible pectoral fin has its own soft stroke, attached to the belly. */
    var fin=smooth(151,211,y)*(1-smooth(250,295,x))*smooth(135,170,x);
    ny+=Math.sin(time*rate+phase+.8)*fin*(row===0?7:3);
   }
   return {x:nx,y:ny};
  }
  function shader(type,source){var s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('Fish mesh shader failed');return s;}
  function initGL(){
   var vertex=[
    'attribute vec2 a_local;attribute vec2 a_uv;attribute float a_kind;attribute float a_seed;',
    'uniform float u_time;varying vec2 v_uv;varying float v_alpha;',
    'void main(){vec2 p=a_local;float phase=a_seed<0.0?0.0:a_seed*.71;',
    'if(a_kind>0.5&&a_kind<1.5){float top=1.0-smoothstep(12.0,97.0,p.y);float bottom=smoothstep(263.0,345.0,p.y);float tail=smoothstep(362.0,407.0,p.x);',
    'p.x+=sin(u_time*2.6+phase)*top*15.0-sin(u_time*2.6+phase+.5)*bottom*13.0-sin(u_time*2.6+phase)*tail*2.0;p.y+=sin(u_time*2.6+phase+1.1)*tail*4.0;',
    '}else{float rate=a_kind<.5?2.1:7.0;float body=smoothstep(155.0,489.0,p.x);float tail=smoothstep(401.0,504.0,p.x);float fin=smoothstep(151.0,211.0,p.y)*(1.0-smoothstep(250.0,295.0,p.x))*smoothstep(135.0,170.0,p.x);',
    'p.y+=sin(u_time*rate+phase-body*1.8)*body*body*(a_kind<.5?9.0:10.0)+sin(u_time*rate+phase+.8)*fin*(a_kind<.5?7.0:3.0);p.x+=sin(u_time*rate+phase-1.8)*tail*(a_kind<.5?7.0:10.0);}',
    'vec2 center;vec2 size;float flip=1.0;float height;',
    'if(a_kind<.5){height=234.0;center=vec2(mod(1245.0-u_time*10.0,1870.0)-260.0,148.0+sin(u_time*.11)*13.0);size=vec2(470.0,215.0);v_alpha=.97;}',
    'else if(a_kind<1.5){height=350.0;center=vec2(mod(1285.0-u_time*5.6,1650.0)-150.0,330.0+sin(u_time*.15)*12.0);size=vec2(278.0,190.0);v_alpha=.84;}',
    'else{height=184.0;float a=u_time*.18+a_seed*2.399963;float layer=mod(a_seed,3.0);float depth=.62+.38*sin(a);center=vec2(846.0+cos(a)*(132.0+layer*19.0),205.0+sin(a)*(65.0+layer*12.0)+(mod(a_seed,5.0)-2.0)*6.0);size=vec2((24.0+layer*3.0)*depth*(.15+.85*abs(sin(a))),9.0*depth);flip=sin(a)<0.0?-1.0:1.0;v_alpha=.28+depth*.35;}',
    'vec2 point=center+(p/vec2(512.0,height)-.5)*size*vec2(flip,1.0);gl_Position=vec4((point/vec2(1280.0,550.0)*2.0-1.0)*vec2(1.0,-1.0),0.0,1.0);v_uv=a_uv;}'
   ].join('\n');
   program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 v_uv;varying float v_alpha;uniform sampler2D u_image;void main(){vec4 color=texture2D(u_image,v_uv);gl_FragColor=vec4(color.rgb,color.a*v_alpha);}'));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Fish mesh linking failed');gl.useProgram(program);
   var data=[],indices=[];
   function mesh(kind,seed,cols,nrows){var row=rows[kind],base=data.length/6,y,x;for(y=0;y<=nrows;y++)for(x=0;x<=cols;x++){var sx=x/cols*512,sy=y/nrows*row.h;data.push(sx,sy,sx/512,(row.y+sy)/768,kind,seed);}for(y=0;y<nrows;y++)for(x=0;x<cols;x++){var a=base+y*(cols+1)+x,b=a+1,d=a+cols+1,e=d+1;indices.push(a,b,d,b,e,d);}}
   /* Transparent shoal first; the two foreground fish are painted last. */
   for(var i=0;i<48;i++)mesh(2,i,10,4);mesh(0,-1,32,16);mesh(1,-2,28,28);
   var vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
   [['a_local',2,0],['a_uv',2,8],['a_kind',1,16],['a_seed',1,20]].forEach(function(a){var loc=gl.getAttribLocation(program,a[0]);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,a[1],gl.FLOAT,false,24,a[2]);});
   var ib=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);indexCount=indices.length;timeLoc=gl.getUniformLocation(program,'u_time');
   texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.viewport(0,0,1280,550);
  }
  function initCanvas(){ctx=canvas.getContext('2d');rows.forEach(function(row){var source=document.createElement('canvas'),buffer=document.createElement('canvas');source.width=buffer.width=512;source.height=buffer.height=row.h;source.getContext('2d').drawImage(image,0,row.y,512,row.h,0,0,512,row.h);sources.push(source);buffers.push(buffer);});}
  function model(row){
   var r=rows[row],c=buffers[row],x=c.getContext('2d'),source=sources[row],step=12;x.clearRect(0,0,512,r.h);
   if(row===1){for(var y=0;y<r.h;y+=step){var h=Math.min(step,r.h-y),p=deform(row,256,y+h/2,0);x.drawImage(source,0,y,512,h,p.x-256,y,512,h+.5);}}
   else{for(var sx=0;sx<512;sx+=step){var w=Math.min(step,512-sx),q=deform(row,sx+w/2,r.h/2,0);x.drawImage(source,sx,0,w,r.h,sx,q.y-r.h/2,w+.5,r.h);}}
   return c;
  }
  function fish(sprite,x,y,w,h,alpha,flip){ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);if(flip)ctx.scale(-1,1);ctx.drawImage(sprite,-w/2,-h/2,w,h);ctx.restore();}
  function wrap(value,period){return (value%period+period)%period;}
  function drawCanvas(){ctx.clearRect(0,0,1280,550);var tiny=model(2),i;for(i=0;i<48;i++){var a=time*.18+i*2.399963,layer=i%3,depth=.62+.38*Math.sin(a),x=846+Math.cos(a)*(132+layer*19),y=205+Math.sin(a)*(65+layer*12)+(i%5-2)*6,w=(24+layer*3)*depth*(.15+.85*Math.abs(Math.sin(a)));fish(tiny,x,y,w,9*depth,.28+depth*.35,Math.sin(a)<0);}fish(model(0),wrap(1245-time*10,1870)-260,148+Math.sin(time*.11)*13,470,215,.97,false);fish(model(1),wrap(1285-time*5.6,1650)-150,330+Math.sin(time*.15)*12,278,190,.84,false);}
  function draw(){
   if(!ready)return;if(gl){gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform1f(timeLoc,time);gl.drawElements(gl.TRIANGLES,indexCount,gl.UNSIGNED_SHORT,0);}else drawCanvas();
   water.draw(time,0);
   if(frame%5===0)canvas.setAttribute('data-aquarium-frame',time.toFixed(2));
  }
  function active(){return ready&&!disposed&&!document.hidden&&!root.classList.contains('island-paused')&&!(media&&media.matches);}
  function step(stamp){if(disposed)return;if(!document.documentElement.contains(root)){destroy();return;}if(!active()){raf=0;canvas.setAttribute('data-aquarium-state','paused');return;}raf=requestAnimationFrame(step);acc+=Math.max(0,stamp-last);last=stamp;if(acc+.5<1000/30)return;acc=Math.max(0,acc-1000/30);if(acc>1000/30)acc%=1000/30;time+=Math.min(.08,(stamp-painted)/1000);painted=stamp;frame++;draw();meterFrames++;if(stamp-meterAt>=2000){canvas.setAttribute('data-aquarium-fps',(meterFrames*1000/(stamp-meterAt)).toFixed(1));meterAt=stamp;meterFrames=0;}}
  function sync(){if(disposed)return;if(active()&&!raf){last=painted=meterAt=performance.now();acc=0;meterFrames=0;canvas.setAttribute('data-aquarium-state','running');raf=requestAnimationFrame(step);}else if(!active()){if(raf)cancelAnimationFrame(raf);raf=0;canvas.setAttribute('data-aquarium-state','paused');}}
  function destroy(){disposed=true;if(raf)cancelAnimationFrame(raf);raf=0;if(media&&media.removeListener)media.removeListener(sync);image.onload=sea.onload=null;water.destroy();if(gl){var loss=gl.getExtension('WEBGL_lose_context');if(loss)loss.loseContext();}}
  if(gl)initGL();canvas.setAttribute('data-aquarium-renderer',gl?'webgl-continuous-mesh':'canvas-continuous-strips');canvas.setAttribute('data-aquarium-animation','single-pose');
  image.onload=function(){if(disposed)return;if(gl){gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);}else initCanvas();ready=true;draw();sync();};image.src='/frame/hv/standby/island/assets/aquarium-fish-public.svg';
  if(media&&media.addListener)media.addListener(sync);return {sync:sync,destroy:destroy};
 }
 window.HVIslandAquarium={mount:mount};
})();
