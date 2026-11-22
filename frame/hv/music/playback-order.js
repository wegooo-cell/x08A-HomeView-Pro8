/* Queue order only. No audio, DOM or network side effects; ES5/WebView 72. */
(function(root){'use strict';
function Order(mode,random){this.mode=Order.valid(mode);this.random=random||Math.random;this.key='';this.length=0;this.bag=[];this.history=[];this.cursor=-1;}
Order.valid=function(v){return ['sequence','loop','one','shuffle'].indexOf(v)>=0?v:'sequence';};
Order.prototype.setMode=function(v){this.mode=Order.valid(v);this.bag=[];};
Order.prototype.queue=function(ids){var key=JSON.stringify(ids);if(key!==this.key){this.key=key;this.length=ids.length;this.bag=[];this.history=[];this.cursor=-1;}};
Order.prototype.select=function(i){if(i<0||i>=this.length)return;if(this.history[this.cursor]!==i){this.history=this.history.slice(0,this.cursor+1);this.history.push(i);if(this.history.length>200)this.history.shift();this.cursor=this.history.length-1;}this.bag=this.bag.filter(function(n){return n!==i;});};
Order.prototype.step=function(i,direction,ended){
 var n=this.length;if(!n)return null;i=Math.max(0,Math.min(n-1,i));
 if(ended&&this.mode==='one')return i;
 if(this.mode==='shuffle'){
  if(direction<0){if(this.cursor>0)return this.history[--this.cursor];return i;}
  if(this.cursor+1<this.history.length)return this.history[++this.cursor];
  if(!this.bag.length){for(var j=0;j<n;j++)if(j!==i)this.bag.push(j);for(j=this.bag.length-1;j>0;j--){var k=Math.floor(this.random()*(j+1)),x=this.bag[j];this.bag[j]=this.bag[k];this.bag[k]=x;}}
  var next=this.bag.length?this.bag.shift():i;this.select(next);return next;
 }
 var next=i+direction;if(this.mode==='loop'||this.mode==='one')return (next+n)%n;
 return next<0||next>=n?null:next;
};
root.HVMusicOrder=Order;if(typeof module==='object'&&module.exports)module.exports=Order;
})(typeof window==='object'?window:this);
