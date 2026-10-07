// Weapon art, shared by the Swamp Adventure (held in the player's hand) and the Bag (preview card) and the Skin Shop.
// WeaponArt.draw(ctx,id,a,skin) draws a weapon pointing right from the grip at (0,0); a = 0..1 swing/muzzle glow; skin = optional skin id (see SKIN_ART below).
// WeaponArt.paint(canvas,id,glowColor,skin) fits a weapon into a canvas for the Bag. WeaponArt.live(canvas,id,skin) keeps a preview shimmering.
// To add a weapon: add a draw function to WPN below + its default colours in BASE (same id as its GEAR line in store.js) and a slash colour in WPN_PAL in adventure.html.
// To add a skin: add a line to SKIN_ART below (w = the weapon id, pal = colour overrides, plus optional gem / aura / spark / crown / etch / trim / band / slash), then a price line in SKINS in store.js.
const WeaponArt=(()=>{
 function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
 // soft glow sprites, one cached per colour (the default is the warm cream the game always used)
 const GC={};
 function sprite(col){col=col||"255,236,190";if(GC[col])return GC[col];const c=document.createElement("canvas");c.width=c.height=128;const g=c.getContext("2d"),q=g.createRadialGradient(64,64,0,64,64,64);q.addColorStop(0,"rgba("+col+",.9)");q.addColorStop(.35,"rgba("+col+",.32)");q.addColorStop(1,"rgba("+col+",0)");g.fillStyle=q;g.fillRect(0,0,128,128);return GC[col]=c}
 function glow(c,x,y,r,a,col){const pa=c.globalAlpha;c.globalAlpha=pa*a;c.drawImage(sprite(col),x-r,y-r,r*2,r*2);c.globalAlpha=pa}
 function rgb(h){h=(h||"#ffecbe").replace("#","");if(h.length===3)h=h.replace(/./g,"$&$&");const n=parseInt(h,16);return((n>>16)&255)+","+((n>>8)&255)+","+(n&255)}
 // small four-point star
 function star(c,x,y,r,col){c.fillStyle=col;c.beginPath();c.moveTo(x,y-r);c.lineTo(x+r*.3,y-r*.3);c.lineTo(x+r,y);c.lineTo(x+r*.3,y+r*.3);c.lineTo(x,y+r);c.lineTo(x-r*.3,y+r*.3);c.lineTo(x-r,y);c.lineTo(x-r*.3,y-r*.3);c.closePath();c.fill()}
 // drifting sparkles along the weapon (time based, so it shimmers without any game state)
 function sparkles(c,s,x0,x1,yy){
  if(!s||!s.spark)return;const t=Date.now()/1000,pa=c.globalAlpha;
  for(let i=0;i<5;i++){const ph=(t*.55+i*.2)%1,x=x0+(x1-x0)*((i*.37+.11)%1),y=Math.sin(i*2.3+t*.8)*yy;c.globalAlpha=pa*Math.sin(ph*Math.PI);star(c,x,y,1.3+1.5*Math.sin(ph*Math.PI),s.spark)}
  c.globalAlpha=pa;
 }
 function gem(c,x,y,r,col,edge){c.fillStyle=col;c.strokeStyle=edge||"rgba(0,0,0,.55)";c.lineWidth=.8;c.beginPath();c.moveTo(x,y-r);c.lineTo(x+r,y);c.lineTo(x,y+r);c.lineTo(x-r,y);c.closePath();c.fill();c.stroke();c.fillStyle="rgba(255,255,255,.7)";c.beginPath();c.arc(x-r*.25,y-r*.3,r*.22,0,7);c.fill()}
 // ---- default colours of each weapon (what the plain weapon looks like) ----
 const BASE={
  spikedblade:{grip:"#6b4a2a",gripS:"#2a1a0c",metal:"#f2c14e",b1:"#eafff6",b2:"#7fb3a5",bS:"#0e2a24",shine:"rgba(255,255,255,.75)",th:"#3fae5a",thS:"#0e3a1c"},
  bogblaster:{stock:"#5a3a1c",stockS:"#1e1208",b0:"#7a8a4a",b1:"#3a4a22",barrel:"#34421e",muz:"#8fe88a",tank:"rgba(125,255,106,.85)",tankS:"#1f4a14",bub:"#eaffd0",drip:"#7dff6a"},
  hopperstaff:{shaftS:"#2a1a0c",shaft:"#9a6a34",zig:"#d8f7ff",head:"#43c463",headS:"#14451f",eye:"#ffffff",pupil:"#0b2a2c"}
 };
 // ---- LUXURY SKINS: art only. Prices, names and rarity live in SKINS in store.js (same ids). ----
 // w = weapon id, pal = colour overrides, gem = jewel colour, aura = glow colour behind the weapon, spark = sparkle colour,
 // etch = blade runes, trim = barrel rings, band = staff bands, crown = golden crown on the staff frog, slash = [outer, inner] swing colours
 const SKIN_ART={
  gildedthornbane:{w:"spikedblade",pal:{grip:"#2b1a10",gripS:"#0d0704",metal:"#ffd86b",b1:"#fff6c8",b2:"#e0a52c",bS:"#5a3a06",shine:"rgba(255,255,255,.9)",th:"#18c47a",thS:"#05301e"},gem:"#26ff9a",aura:"#ffcf4a",spark:"#fff3b0",etch:"#8a5a10",slash:["#ffcf4a","#fff6d0"]},
  midnightbramble:{w:"spikedblade",pal:{grip:"#1c1230",gripS:"#07040f",metal:"#7a4cff",b1:"#6a5a8c",b2:"#16102a",bS:"#05030c",shine:"rgba(190,160,255,.8)",th:"#9d4dff",thS:"#2a0a5a"},gem:"#ff4fd8",aura:"#8a4dff",spark:"#e0c4ff",etch:"#b58cff",slash:["#9d4dff","#f0e0ff"]},
  moonbriar:{w:"spikedblade",pal:{grip:"#cfd8e3",gripS:"#4b5968",metal:"#e8f1fb",b1:"#ffffff",b2:"#a9d6f0",bS:"#2b5a78",shine:"rgba(255,255,255,.95)",th:"#7ff0ff",thS:"#0f5870"},gem:"#4da3ff",aura:"#9fe8ff",spark:"#ffffff",etch:"#5ab4d8",slash:["#8feaff","#ffffff"]},
  royalmire:{w:"bogblaster",pal:{stock:"#2b1a10",stockS:"#0d0704",b0:"#ffe08a",b1:"#c78a1c",barrel:"#a8721a",muz:"#26ff9a",tank:"rgba(38,255,154,.88)",tankS:"#05301e",bub:"#e8fff2",drip:"#26ff9a"},gem:"#ff4f6a",aura:"#26ff9a",spark:"#fff3b0",trim:"#ffe08a",slash:["#26ff9a","#e8fff2"]},
  toxicnebula:{w:"bogblaster",pal:{stock:"#1c1230",stockS:"#07040f",b0:"#5a3a8c",b1:"#1a0f36",barrel:"#241448",muz:"#ff4fd8",tank:"rgba(255,79,216,.85)",tankS:"#4a0a3a",bub:"#ffe0f8",drip:"#ff4fd8"},gem:"#4ee6ff",aura:"#ff4fd8",spark:"#ffd0f4",trim:"#b58cff",slash:["#ff4fd8","#ffe0f8"]},
  amberrelic:{w:"bogblaster",pal:{stock:"#4a2a10",stockS:"#1a0d04",b0:"#d98a2c",b1:"#7a3f0c",barrel:"#8a4a10",muz:"#ffd23a",tank:"rgba(255,176,40,.88)",tankS:"#5a2a04",bub:"#fff3c8",drip:"#ffb028"},gem:"#ff7a1c",aura:"#ffb028",spark:"#fff0b0",trim:"#ffd23a",slash:["#ffb028","#fff3c8"]},
  emeraldmonarch:{w:"hopperstaff",pal:{shaftS:"#3a2400",shaft:"#ffd86b",zig:"#26ff9a",head:"#12d18a",headS:"#05402a",eye:"#fff6c8",pupil:"#05301e"},gem:"#ff4f6a",aura:"#26ff9a",spark:"#fff3b0",band:"#ffe08a",crown:"#ffd86b",slash:["#26ff9a","#e6fff6"]},
  glacialtreefrog:{w:"hopperstaff",pal:{shaftS:"#1c3a52",shaft:"#cfeaff",zig:"#ffffff",head:"#6fd8ff",headS:"#0f4a6a",eye:"#ffffff",pupil:"#0b2a4a"},gem:"#4da3ff",aura:"#9fe8ff",spark:"#ffffff",band:"#e8f6ff",slash:["#8feaff","#ffffff"]},
  twilighttoad:{w:"hopperstaff",pal:{shaftS:"#12082a",shaft:"#5a3a9c",zig:"#ff9ae8",head:"#b45cff",headS:"#3a0a6a",eye:"#fff0fb",pupil:"#2a0a4a"},gem:"#ff4fd8",aura:"#c070ff",spark:"#ffd0f4",band:"#ff9ae8",crown:"#ff9ae8",slash:["#c070ff","#ffe0f8"]}
 };
 const WPN={
  spikedblade(c,a,p,s){
   if(s&&s.aura)glow(c,22,0,34,.55,rgb(s.aura));
   c.fillStyle=p.grip;c.strokeStyle=p.gripS;c.lineWidth=1.4;rr(c,-9,-2.6,11,5.2,2);c.fill();c.stroke();
   c.fillStyle=p.metal;c.beginPath();c.arc(-9.5,0,3,0,7);c.fill();c.stroke();rr(c,1,-7.5,4.5,15,2);c.fill();c.stroke();
   const g=c.createLinearGradient(0,-4,0,4);g.addColorStop(0,p.b1);g.addColorStop(1,p.b2);c.fillStyle=g;c.strokeStyle=p.bS;
   c.beginPath();c.moveTo(5.5,-4);c.lineTo(31,-3);c.lineTo(40,0);c.lineTo(31,3);c.lineTo(5.5,4);c.closePath();c.fill();c.stroke();
   c.strokeStyle=p.shine;c.lineWidth=1;c.beginPath();c.moveTo(8,-.6);c.lineTo(34,-.6);c.stroke();
   if(s&&s.etch){c.strokeStyle=s.etch;c.lineWidth=.9;for(let i=0;i<5;i++){const x=14+i*4.2;c.beginPath();c.moveTo(x,1.1);c.lineTo(x+1.6,2.4);c.stroke()}}
   c.fillStyle=p.th;c.strokeStyle=p.thS;c.lineWidth=1;for(let i=0;i<4;i++){const x=10+i*6.5;c.beginPath();c.moveTo(x,-3.6);c.lineTo(x+2.6,-9.5);c.lineTo(x+4.6,-3.4);c.fill();c.stroke();c.beginPath();c.moveTo(x+1.5,3.6);c.lineTo(x+4,9);c.lineTo(x+6,3.4);c.fill();c.stroke()}
   if(s&&s.gem)gem(c,3.2,0,2.6,s.gem);
   sparkles(c,s,6,40,8);
  },
  bogblaster(c,a,p,s){
   if(s&&s.aura)glow(c,16,0,34,.5,rgb(s.aura));
   c.fillStyle=p.stock;c.strokeStyle=p.stockS;c.lineWidth=1.4;c.save();c.rotate(.25);rr(c,-4,3,6,10,2);c.fill();c.stroke();c.restore();
   const g=c.createLinearGradient(0,-7,0,7);g.addColorStop(0,p.b0);g.addColorStop(1,p.b1);c.fillStyle=g;rr(c,-7,-6,23,12,4);c.fill();c.stroke();
   c.fillStyle=p.barrel;rr(c,15,-3.6,15,7.2,2);c.fill();c.stroke();
   if(s&&s.trim){c.strokeStyle=s.trim;c.lineWidth=1.3;c.beginPath();c.moveTo(19,-3.6);c.lineTo(19,3.6);c.moveTo(25,-3.6);c.lineTo(25,3.6);c.stroke();c.strokeStyle=p.stockS;c.lineWidth=1.4}
   c.fillStyle=p.muz;rr(c,29,-5,5,10,2);c.fill();c.stroke();
   c.fillStyle=p.tank;c.strokeStyle=p.tankS;c.beginPath();c.arc(5,-9,6.2,0,7);c.fill();c.stroke();
   c.fillStyle=p.bub;c.beginPath();c.arc(3,-10.5,1.4,0,7);c.arc(7,-7,1,0,7);c.fill();
   c.fillStyle=p.drip;c.beginPath();c.ellipse(32,6,1.8,3.2,0,0,7);c.fill();
   if(s&&s.gem)gem(c,10,.5,2.6,s.gem);
   if(a>0){glow(c,38,0,14*a,a,s&&s.aura?rgb(s.aura):null)}
   sparkles(c,s,-6,34,9);
  },
  hopperstaff(c,a,p,s){
   glow(c,42,0,16,.55,s&&s.aura?rgb(s.aura):null);
   if(s&&s.aura)glow(c,14,0,30,.4,rgb(s.aura));
   c.strokeStyle=p.shaftS;c.lineWidth=5.2;c.lineCap="round";c.beginPath();c.moveTo(-14,0);c.lineTo(36,0);c.stroke();c.strokeStyle=p.shaft;c.lineWidth=3.2;c.beginPath();c.moveTo(-14,0);c.lineTo(36,0);c.stroke();
   if(s&&s.band){c.fillStyle=s.band;c.strokeStyle=p.shaftS;c.lineWidth=.8;for(const x of[-8,14,30]){rr(c,x,-3.4,2.6,6.8,1);c.fill();c.stroke()}}
   c.strokeStyle=p.zig;c.lineWidth=1.8;c.beginPath();c.moveTo(8,0);for(let i=0;i<6;i++)c.lineTo(10+i*3,i%2?-4.5:4.5);c.stroke();
   c.fillStyle=p.head;c.strokeStyle=p.headS;c.lineWidth=1.6;c.beginPath();c.arc(42,0,7,0,7);c.fill();c.stroke();
   c.fillStyle=p.eye;c.beginPath();c.arc(42,-5.5,2.6,0,7);c.arc(46.5,-4,2.4,0,7);c.fill();c.fillStyle=p.pupil;c.beginPath();c.arc(42.6,-5.5,1.2,0,7);c.arc(47,-4,1.1,0,7);c.fill();
   c.strokeStyle=p.headS;c.lineWidth=1.3;c.beginPath();c.moveTo(40,3);c.quadraticCurveTo(45,6,49,2);c.stroke();
   if(s&&s.crown){c.fillStyle=s.crown;c.strokeStyle=p.headS;c.lineWidth=.9;c.beginPath();c.moveTo(37,-5.5);c.lineTo(36.5,-12);c.lineTo(39.6,-9);c.lineTo(42,-13.5);c.lineTo(44.4,-9);c.lineTo(47.5,-12);c.lineTo(47,-5.5);c.closePath();c.fill();c.stroke()}
   if(s&&s.gem)gem(c,-1,0,2.6,s.gem);
   sparkles(c,s,-8,50,10);
  }
 };
 const has=id=>typeof WPN[id]==="function";
 // a skin only applies to its own weapon
 const skinFor=(id,skin)=>{const k=skin&&SKIN_ART[skin];return k&&k.w===id?k:null};
 const palFor=(id,k)=>Object.assign({},BASE[id],k?k.pal:null);
 function draw(c,id,a,skin){if(!has(id))return;const k=skinFor(id,skin);WPN[id](c,a||0,palFor(id,k),k)}
 // fits the weapon into the canvas (already sized by the caller), centred, with a soft glow behind it
 function paint(cv,id,glowColor,skin){
  if(!has(id))return false;
  const c=cv.getContext("2d"),w=cv.width,h=cv.height;c.clearRect(0,0,w,h);
  const s=Math.min(w/78,h/36);
  c.save();c.translate(w/2-16*s,h/2);c.scale(s,s);c.lineJoin="round";draw(c,id,.45,skin);c.restore();
  return true;
 }
 // keeps a preview canvas shimmering (for the skin shop). Stops by itself when the canvas leaves the page; returns a stop function.
 function live(cv,id,skin){
  let on=true;
  (function f(){if(!on||!cv.isConnected)return;if(cv.offsetParent!==null)paint(cv,id,null,skin);requestAnimationFrame(f)})();
  return()=>{on=false};
 }
 // art info about a skin: weapon id, slash colours, accent colour (or null for an unknown skin)
 const skinInfo=id=>{const k=SKIN_ART[id];return k?{id,w:k.w,slash:k.slash||null,accent:k.aura||(k.slash&&k.slash[0])||"#f2c14e"}:null};
 return{draw,paint,live,has,skinInfo,hasSkin:id=>!!SKIN_ART[id],skinIds:()=>Object.keys(SKIN_ART),ids:()=>Object.keys(WPN)};
})();
