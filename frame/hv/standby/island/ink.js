/* Batch the existing firework geometry into one GPU submission. ES5 / WebView72. */
(function(){'use strict';
function create(canvas,w,h){
 var gl=canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false});if(!gl)return null;
 var data=new Float32Array(1048576),at=0,path=[],stack=[],clip=h,colors={},buffer=gl.createBuffer();
 function shader(type,s){var a=gl.createShader(type);gl.shaderSource(a,s);gl.compileShader(a);if(!gl.getShaderParameter(a,gl.COMPILE_STATUS))throw Error('Firework shader');return a;}
 var program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 p;attribute vec4 c;attribute vec2 uv;attribute vec2 kind;varying vec4 color;varying vec2 tex;varying vec3 mask;void main(){gl_Position=vec4((p/vec2(740.0,710.0)*2.0-1.0)*vec2(1.0,-1.0),0.0,1.0);color=c;tex=uv;mask=vec3(kind,p.y);}'));
 gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec4 color;varying vec2 tex;varying vec3 mask;void main(){if(mask.z>mask.y)discard;vec4 c=color;if(mask.x>.5){float d=length(tex);float a=min(1.0,max(0.0,(1.0-d)/.76));c.rgb=mix(c.rgb,vec3(1.0,.973,.906),max(0.0,1.0-d/.12));c.a*=a;}gl_FragColor=c;}'));
 gl.linkProgram(program);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data.byteLength,gl.DYNAMIC_DRAW);
 [['p',2,0],['c',4,8],['uv',2,24],['kind',2,32]].forEach(function(a){var l=gl.getAttribLocation(program,a[0]);gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,a[1],gl.FLOAT,false,40,a[2]);});
 gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.viewport(0,0,canvas.width,canvas.height);
 function color(s){return colors[s]||(colors[s]=[parseInt(s.slice(1,3),16)/255,parseInt(s.slice(3,5),16)/255,parseInt(s.slice(5,7),16)/255]);}
 function v(x,y,c,a,u,t,k){data[at++]=x;data[at++]=y;data[at++]=c[0];data[at++]=c[1];data[at++]=c[2];data[at++]=a;data[at++]=u;data[at++]=t;data[at++]=k;data[at++]=clip;}
 function segment(a,b,c,alpha,width){var dx=b[0]-a[0],dy=b[1]-a[1],len=Math.sqrt(dx*dx+dy*dy);if(!len)return;var x=-dy/len*width/2,y=dx/len*width/2;v(a[0]+x,a[1]+y,c,alpha,0,0,0);v(a[0]-x,a[1]-y,c,alpha,0,0,0);v(b[0]+x,b[1]+y,c,alpha,0,0,0);v(b[0]+x,b[1]+y,c,alpha,0,0,0);v(a[0]-x,a[1]-y,c,alpha,0,0,0);v(b[0]-x,b[1]-y,c,alpha,0,0,0);}
 var ctx={globalAlpha:1,strokeStyle:'#ffffff',lineWidth:1,
  clearRect:function(){at=0;clip=h;gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);},
  beginPath:function(){path=[];},moveTo:function(x,y){path.push([x,y]);},lineTo:function(x,y){path.push([x,y]);},
  stroke:function(){var c=color(this.strokeStyle);for(var i=1;i<path.length;i++)segment(path[i-1],path[i],c,this.globalAlpha,this.lineWidth);},
  save:function(){stack.push(clip);},restore:function(){clip=stack.pop();},rect:function(x,y,ww,hh){clip=y+hh;},clip:function(){},
  point:function(x,y,size,s,a){var c=color(s),r=size/2;v(x-r,y-r,c,a,-1,-1,1);v(x+r,y-r,c,a,1,-1,1);v(x-r,y+r,c,a,-1,1,1);v(x-r,y+r,c,a,-1,1,1);v(x+r,y-r,c,a,1,-1,1);v(x+r,y+r,c,a,1,1,1);},
  flush:function(){gl.bufferSubData(gl.ARRAY_BUFFER,0,data.subarray(0,at));gl.drawArrays(gl.TRIANGLES,0,at/10);},
  destroy:function(){var e=gl.getExtension('WEBGL_lose_context');if(e)e.loseContext();}
 };canvas.setAttribute('data-fx-renderer','webgl-batched');return ctx;
}
window.HVIslandInk={create:create};
})();
