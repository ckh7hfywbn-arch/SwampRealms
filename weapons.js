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
 // ---- remodel helpers: avatar-style shading (light top, dark bottom), thick dark outlines, white rim highlights ----
 const hx=h=>/^#[0-9a-f]{6}$/i.test(h||"")?[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)):/^#[0-9a-f]{3}$/i.test(h||"")?[1,2,3].map(i=>parseInt(h[i]+h[i],16)):null;
 const mix=(h,t,k)=>{const a=hx(h),b=hx(t);return a&&b?"#"+a.map((v,i)=>Math.round(v+(b[i]-v)*k).toString(16).padStart(2,"0")).join(""):h};
 const lt=(h,k)=>mix(h,"#ffffff",k),dk=(h,k)=>mix(h,"#000000",k);
 function lg(c,x0,y0,x1,y1,st){const g=c.createLinearGradient(x0,y0,x1,y1);for(const s of st)g.addColorStop(s[0],s[1]);return g}
 function rg(c,x,y,r0,r1,st,cx,cy){const g=c.createRadialGradient(cx==null?x:cx,cy==null?y:cy,r0,x,y,r1);for(const s of st)g.addColorStop(s[0],s[1]);return g}
 const metalV=(c,col,y0,y1)=>lg(c,0,y0,0,y1,[[0,lt(col,.6)],[.45,col],[1,dk(col,.42)]]);
 // a soft light streak that slides along a shape now and then (time based, so it needs no game state)
 function glint(c,clip,x0,x1,y0,y1){
  const t=(Date.now()/1000*.5)%2;if(t>1)return;const x=x0+(x1-x0)*t,al=Math.sin(t*Math.PI);
  c.save();clip();c.clip();c.fillStyle="rgba(255,255,255,"+(.55*al).toFixed(3)+")";c.beginPath();c.moveTo(x,y0);c.lineTo(x+3.4,y0);c.lineTo(x-.6,y1);c.lineTo(x-4,y1);c.closePath();c.fill();c.restore();
 }
 const WPN={
  // ===== Spiked Thornblade: a leaf-green thorned blade with a vine-wrapped grip and a leaf guard =====
  spikedblade(c,a,p,s){
   c.save();c.lineJoin="round";c.lineCap="round";
   if(s&&s.aura)glow(c,22,0,34,.55,rgb(s.aura));
   const O=p.gripS,B=p.bS;
   // wrapped grip
   c.fillStyle=lg(c,0,-2.8,0,2.8,[[0,lt(p.grip,.4)],[.5,p.grip],[1,dk(p.grip,.45)]]);c.strokeStyle=O;c.lineWidth=1.6;rr(c,-9,-2.8,11,5.6,2.2);c.fill();c.stroke();
   c.strokeStyle=dk(p.grip,.55);c.lineWidth=.9;for(let i=0;i<4;i++){const x=-7.6+i*2.6;c.beginPath();c.moveTo(x,-2.5);c.lineTo(x+1.7,2.5);c.stroke()}
   c.strokeStyle="rgba(255,255,255,.4)";c.lineWidth=.7;c.beginPath();c.moveTo(-8,-1.8);c.lineTo(.6,-1.8);c.stroke();
   // pommel orb
   c.fillStyle=rg(c,-10,0,.3,4,[[0,lt(p.metal,.75)],[.55,p.metal],[1,dk(p.metal,.5)]],-11.2,-1.3);c.strokeStyle=O;c.lineWidth=1.5;c.beginPath();c.arc(-10,0,3.5,0,7);c.fill();c.stroke();
   // thorns first, so their roots tuck under the blade edge
   const by=x=>(x<30?4.2-(x-5.8)*.029:3.5-(x-30)*.12)-.5;
   // clean, evenly spaced thorns: same spot on both edges, shrinking toward the tip, each a sharp swept-back claw with a lit side and a shaded side
   const thorn=(x,len,sg)=>{const w=3.1,y0=by(x+w/2)*sg,tx=x+w+1.3,ty=sg*(by(x+w/2)+len);
    const path=()=>{c.beginPath();c.moveTo(x,y0);c.quadraticCurveTo(x+.1,y0+sg*len*.6,tx,ty);c.quadraticCurveTo(x+w-.2,y0+sg*len*.4,x+w,y0);c.closePath()};
    path();c.fillStyle=lg(c,0,y0,0,ty,[[0,dk(p.th,.25)],[.6,p.th],[1,lt(p.th,.45)]]);c.fill();
    c.save();path();c.clip();c.fillStyle="rgba(0,0,0,.26)";c.beginPath();c.moveTo(x+w*.5,y0);c.lineTo(tx,ty);c.lineTo(x+w+.6,y0);c.closePath();c.fill();
    c.strokeStyle="rgba(255,255,255,.6)";c.lineWidth=.6;c.beginPath();c.moveTo(x+.7,y0+sg*len*.18);c.quadraticCurveTo(x+1.2,y0+sg*len*.55,tx-.8,ty-sg*len*.12);c.stroke();c.restore();
    c.lineJoin="miter";c.miterLimit=5;path();c.strokeStyle=p.thS;c.lineWidth=1;c.stroke();c.lineJoin="round"};
   const TL=[7,6.4,5.6,4.6];for(let i=0;i<4;i++){const x=10.2+i*5.9;thorn(x,TL[i],-1);thorn(x,TL[i],1)}
   // crossguard (leaf wings)
   c.fillStyle=metalV(c,p.metal,-9,9);c.strokeStyle=O;c.lineWidth=1.6;
   c.beginPath();c.moveTo(1.2,-3);c.quadraticCurveTo(-.2,-7,1.4,-9.2);c.quadraticCurveTo(5,-9.2,5.9,-5.6);c.lineTo(5.9,5.6);c.quadraticCurveTo(5,9.2,1.4,9.2);c.quadraticCurveTo(-.2,7,1.2,3);c.closePath();c.fill();c.stroke();
   c.strokeStyle="rgba(255,255,255,.55)";c.lineWidth=.7;c.beginPath();c.moveTo(2.2,-7.6);c.quadraticCurveTo(4.4,-7.6,4.6,-4.6);c.stroke();
   // blade
   const bp=()=>{c.beginPath();c.moveTo(5.9,-4.2);c.lineTo(30,-3.5);c.quadraticCurveTo(37,-2.2,40.5,0);c.quadraticCurveTo(37,2.2,30,3.5);c.lineTo(5.9,4.2);c.closePath()};
   bp();c.fillStyle=lg(c,0,-4.2,0,4.2,[[0,p.b1],[.5,mix(p.b1,p.b2,.55)],[1,p.b2]]);c.fill();
   c.save();bp();c.clip();
   c.fillStyle="rgba(0,0,0,.2)";c.fillRect(5,.25,37,5);
   c.strokeStyle="rgba(0,0,0,.28)";c.lineWidth=.8;c.beginPath();c.moveTo(8,.55);c.lineTo(36,.55);c.stroke();
   c.strokeStyle=p.shine;c.lineWidth=1;c.beginPath();c.moveTo(8,-.5);c.lineTo(35,-.5);c.stroke();
   c.strokeStyle="rgba(255,255,255,.7)";c.lineWidth=.8;c.beginPath();c.moveTo(6.5,-3.5);c.lineTo(30,-2.9);c.quadraticCurveTo(36,-1.8,39.2,-.2);c.stroke();
   c.restore();
   if(s&&s.etch){c.strokeStyle=s.etch;c.lineWidth=.9;for(let i=0;i<5;i++){const x=14+i*4.2;c.beginPath();c.moveTo(x,1.4);c.lineTo(x+1.6,2.7);c.stroke()}}
   glint(c,bp,6,40,-4.2,4.2);
   bp();c.strokeStyle=B;c.lineWidth=1.6;c.stroke();
   // centre jewel
   if(s&&s.gem)gem(c,3.4,0,2.7,s.gem);else gem(c,3.4,0,2.3,lt(p.th,.3),p.thS);
   sparkles(c,s,6,40,8);
   c.restore();
  },
  // ===== Bog Blaster: a brass-and-wood goo cannon with a glass tank, ribbed barrel and glowing muzzle =====
  bogblaster(c,a,p,s){
   c.save();c.lineJoin="round";c.lineCap="round";
   if(s&&s.aura)glow(c,16,0,34,.5,rgb(s.aura));
   const O=p.stockS;
   // wooden grip
   c.save();c.rotate(.25);c.fillStyle=lg(c,-4,0,2.4,0,[[0,lt(p.stock,.35)],[.6,p.stock],[1,dk(p.stock,.45)]]);c.strokeStyle=O;c.lineWidth=1.6;rr(c,-4,3,6.4,10.6,2.4);c.fill();c.stroke();
   c.strokeStyle=dk(p.stock,.55);c.lineWidth=.8;for(let i=0;i<3;i++){c.beginPath();c.moveTo(-3.5,6.4+i*2.6);c.lineTo(2,6.4+i*2.6);c.stroke()}c.restore();
   // trigger guard
   c.strokeStyle=O;c.lineWidth=1.4;c.beginPath();c.moveTo(4.5,5.6);c.quadraticCurveTo(8.6,11.4,12,5.6);c.stroke();
   // body
   c.fillStyle=lg(c,0,-6,0,6,[[0,lt(p.b0,.45)],[.4,p.b0],[1,dk(p.b1,.15)]]);c.strokeStyle=O;c.lineWidth=1.6;rr(c,-7,-6,23,12,4);c.fill();c.stroke();
   c.strokeStyle=dk(p.b1,.4);c.lineWidth=.9;c.beginPath();c.moveTo(11.2,-5.4);c.lineTo(11.2,5.4);c.moveTo(-2,3.4);c.lineTo(8,3.4);c.stroke();
   c.strokeStyle="rgba(255,255,255,.45)";c.lineWidth=.8;c.beginPath();c.moveTo(-3.6,-4.4);c.lineTo(13,-4.4);c.stroke();
   c.fillStyle=lt(p.b0,.55);for(const q of[[-4.4,-2.6],[-4.4,2.4],[13.6,-2.6],[13.6,2.4]]){c.beginPath();c.arc(q[0],q[1],.8,0,7);c.fill()}
   // swamp moss
   c.fillStyle=dk(p.muz,.35);c.strokeStyle=dk(p.muz,.7);c.lineWidth=.7;c.beginPath();c.ellipse(-4.6,-6.1,3.2,1.5,-.15,0,7);c.fill();c.stroke();c.beginPath();c.ellipse(-1.8,-6.6,1.6,1,.3,0,7);c.fill();c.stroke();
   // goo tank: brass base ring, glass globe, liquid, cap
   c.fillStyle=metalV(c,p.barrel,-6,-2.4);c.strokeStyle=O;c.lineWidth=1.4;rr(c,1.2,-5.8,7.6,3.2,1.2);c.fill();c.stroke();
   c.fillStyle="rgba(8,22,12,.6)";c.strokeStyle=p.tankS;c.lineWidth=1.6;c.beginPath();c.arc(5,-9,6.2,0,7);c.fill();
   c.save();c.beginPath();c.arc(5,-9,6.2,0,7);c.clip();
   c.fillStyle=p.tank;c.beginPath();c.moveTo(-2,-11.4);c.quadraticCurveTo(2,-12.6,5,-11.4);c.quadraticCurveTo(8,-10.2,12,-11.4);c.lineTo(12,-2);c.lineTo(-2,-2);c.closePath();c.fill();
   c.fillStyle="rgba(0,0,0,.18)";c.fillRect(-2,-5.4,14,4);
   c.restore();
   c.strokeStyle=p.tankS;c.lineWidth=1.6;c.beginPath();c.arc(5,-9,6.2,0,7);c.stroke();
   c.fillStyle=p.bub;c.beginPath();c.arc(3.4,-7.4,1.2,0,7);c.arc(7,-5.6,.9,0,7);c.arc(5.4,-8.8,.7,0,7);c.fill();
   c.strokeStyle="rgba(255,255,255,.85)";c.lineWidth=1;c.beginPath();c.arc(5,-9,4.4,3.5,4.7);c.stroke();
   c.fillStyle="rgba(255,255,255,.8)";c.beginPath();c.arc(8.6,-12.2,.8,0,7);c.fill();
   c.fillStyle=metalV(c,p.barrel,-17,-14);c.strokeStyle=O;c.lineWidth=1.4;rr(c,2.6,-16.4,4.8,2.6,1);c.fill();c.stroke();
   // ribbed barrel
   c.fillStyle=lg(c,0,-3.6,0,3.6,[[0,lt(p.barrel,.5)],[.45,p.barrel],[1,dk(p.barrel,.45)]]);c.strokeStyle=O;c.lineWidth=1.6;rr(c,15,-3.6,15,7.2,2);c.fill();c.stroke();
   if(s&&s.trim){c.strokeStyle=s.trim;c.lineWidth=1.4;c.beginPath();c.moveTo(19,-3.6);c.lineTo(19,3.6);c.moveTo(25,-3.6);c.lineTo(25,3.6);c.stroke()}
   else{c.strokeStyle=dk(p.barrel,.5);c.lineWidth=.9;c.beginPath();for(const x of[19,22.5,26]){c.moveTo(x,-3.3);c.lineTo(x,3.3)}c.stroke()}
   c.strokeStyle="rgba(255,255,255,.4)";c.lineWidth=.7;c.beginPath();c.moveTo(16.5,-2.2);c.lineTo(28.4,-2.2);c.stroke();
   // flared muzzle with a glowing mouth
   c.fillStyle=lg(c,0,-5.4,0,5.4,[[0,lt(p.muz,.55)],[.5,p.muz],[1,dk(p.muz,.45)]]);c.strokeStyle=O;c.lineWidth=1.6;rr(c,29,-5.4,5.4,10.8,2);c.fill();c.stroke();
   c.fillStyle=dk(p.muz,.78);c.beginPath();c.ellipse(34,0,1.5,3.8,0,0,7);c.fill();c.fillStyle=lt(p.muz,.5);c.beginPath();c.ellipse(34.2,0,.7,2.2,0,0,7);c.fill();
   // drip
   c.fillStyle=p.drip;c.strokeStyle=p.tankS;c.lineWidth=.8;c.beginPath();c.moveTo(32,5.4);c.quadraticCurveTo(29.8,8.2,32,10);c.quadraticCurveTo(34.2,8.2,32,5.4);c.closePath();c.fill();c.stroke();
   c.fillStyle="rgba(255,255,255,.8)";c.beginPath();c.arc(31.2,8,.5,0,7);c.fill();
   // charge light / jewel
   if(s&&s.gem)gem(c,10,.5,2.6,s.gem);else{glow(c,8,.4,5,.7,rgb(p.muz));c.fillStyle=lt(p.muz,.35);c.strokeStyle=O;c.lineWidth=.8;c.beginPath();c.arc(8,.4,1.7,0,7);c.fill();c.stroke()}
   if(a>0){glow(c,38,0,14*a,a,s&&s.aura?rgb(s.aura):null)}
   sparkles(c,s,-6,34,9);
   c.restore();
  },
  // ===== Hopper Staff: a gnarled wood staff, vine wrapped, glowing rune, topped with a cheeky frog =====
  hopperstaff(c,a,p,s){
   c.save();c.lineJoin="round";c.lineCap="round";
   glow(c,42,0,16,.55,s&&s.aura?rgb(s.aura):null);
   if(s&&s.aura)glow(c,14,0,30,.4,rgb(s.aura));
   // shaft
   c.strokeStyle=p.shaftS;c.lineWidth=5.8;c.beginPath();c.moveTo(-14,0);c.lineTo(36,0);c.stroke();
   c.strokeStyle=lg(c,0,-2.6,0,2.6,[[0,lt(p.shaft,.45)],[.5,p.shaft],[1,dk(p.shaft,.4)]]);c.lineWidth=3.8;c.beginPath();c.moveTo(-14,0);c.lineTo(36,0);c.stroke();
   c.strokeStyle="rgba(255,255,255,.42)";c.lineWidth=.7;c.beginPath();c.moveTo(-12,-1.1);c.lineTo(34,-1.1);c.stroke();
   c.strokeStyle=dk(p.shaft,.5);c.lineWidth=.8;c.beginPath();for(const x of[-5,19,31]){c.moveTo(x,-1.8);c.lineTo(x+.8,1.8)}c.stroke();
   // butt cap
   c.fillStyle=metalV(c,dk(p.shaft,.1),-3,3);c.strokeStyle=p.shaftS;c.lineWidth=1.4;rr(c,-16,-3,4,6,1.6);c.fill();c.stroke();
   // gold bands (skins)
   if(s&&s.band){c.fillStyle=lg(c,0,-3.4,0,3.4,[[0,lt(s.band,.5)],[1,dk(s.band,.35)]]);c.strokeStyle=p.shaftS;c.lineWidth=.9;for(const x of[-8,14,30]){rr(c,x,-3.6,2.8,7.2,1.1);c.fill();c.stroke()}}
   // vine wrap with two leaves
   else{c.strokeStyle=p.headS;c.lineWidth=2;c.beginPath();c.moveTo(-12,1);for(let i=1;i<=6;i++)c.lineTo(-12+i*2.6,i%2?-1.9:1.9);c.stroke();c.strokeStyle=p.head;c.lineWidth=1;c.beginPath();c.moveTo(-12,1);for(let i=1;i<=6;i++)c.lineTo(-12+i*2.6,i%2?-1.9:1.9);c.stroke();
    c.fillStyle=lg(c,0,-6,0,0,[[0,lt(p.head,.4)],[1,p.head]]);c.strokeStyle=p.headS;c.lineWidth=.9;c.beginPath();c.ellipse(-3,-3.8,2.8,1.4,-.7,0,7);c.fill();c.stroke()}
   // glowing rune
   const zz=()=>{c.beginPath();c.moveTo(8,0);for(let i=0;i<6;i++)c.lineTo(10+i*3,i%2?-4.5:4.5)};
   c.strokeStyle="rgba("+rgb(p.zig)+",.35)";c.lineWidth=4.2;zz();c.stroke();c.strokeStyle=p.zig;c.lineWidth=1.8;zz();c.stroke();c.strokeStyle="rgba(255,255,255,.85)";c.lineWidth=.6;zz();c.stroke();
   // crown first, so the frog's eyes pop out in front of it
   const head=()=>{c.beginPath();c.arc(42,0,7,0,7)};
   // leaf collar
   c.fillStyle=lg(c,0,-6,0,6,[[0,lt(p.head,.3)],[1,dk(p.head,.2)]]);c.strokeStyle=p.headS;c.lineWidth=1;c.beginPath();c.ellipse(35.4,-3.2,3.4,1.5,-.8,0,7);c.fill();c.stroke();c.beginPath();c.ellipse(35.4,3.2,3.4,1.5,.8,0,7);c.fill();c.stroke();
   // frog head
   head();c.fillStyle=rg(c,42,0,1,8,[[0,lt(p.head,.5)],[.55,p.head],[1,dk(p.head,.4)]],40,-2.6);c.fill();c.strokeStyle=p.headS;c.lineWidth=1.7;c.stroke();
   c.fillStyle="rgba(255,255,255,.28)";c.beginPath();c.ellipse(39,-1.6,2.6,1.6,-.6,0,7);c.fill();
   if(s&&s.crown){c.fillStyle=lg(c,0,-14,0,-5,[[0,lt(s.crown,.5)],[1,dk(s.crown,.3)]]);c.strokeStyle=p.headS;c.lineWidth=1;c.beginPath();c.moveTo(37,-5.5);c.lineTo(36.4,-12.4);c.lineTo(39.6,-9.2);c.lineTo(42,-14);c.lineTo(44.4,-9.2);c.lineTo(47.6,-12.4);c.lineTo(47,-5.5);c.closePath();c.fill();c.stroke()}
   // belly / mouth
   c.fillStyle=lt(p.head,.6);c.globalAlpha*=.85;c.beginPath();c.ellipse(45,4.6,4.2,1.9,.12,0,7);c.fill();c.globalAlpha/=.85;
   c.strokeStyle=p.headS;c.lineWidth=1.3;c.beginPath();c.moveTo(39.6,3);c.quadraticCurveTo(45,6.6,49.2,2);c.stroke();
   c.fillStyle=p.headS;c.beginPath();c.arc(48.3,-.9,.55,0,7);c.fill();
   c.fillStyle="rgba(255,120,150,.35)";c.beginPath();c.arc(41,2,1.7,0,7);c.fill();
   // bulging eyes
   for(const e of[[42,-5.6,3.5,2.6],[46.6,-4.2,3.3,2.4]]){
    c.fillStyle=rg(c,e[0],e[1],.5,e[2]+.6,[[0,lt(p.head,.35)],[1,p.head]],e[0]-1,e[1]-1.2);c.strokeStyle=p.headS;c.lineWidth=1.3;c.beginPath();c.arc(e[0],e[1],e[2],0,7);c.fill();c.stroke();
    c.fillStyle=p.eye;c.beginPath();c.arc(e[0]+.2,e[1],e[3],0,7);c.fill();
    c.fillStyle=p.pupil;c.beginPath();c.ellipse(e[0]+.9,e[1]+.1,1,1.6,0,0,7);c.fill();
    c.fillStyle="#fff";c.beginPath();c.arc(e[0]+.2,e[1]-1,.55,0,7);c.fill()}
   if(s&&s.gem)gem(c,-1,0,2.6,s.gem);
   sparkles(c,s,-8,50,10);
   c.restore();
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
