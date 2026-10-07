// Weapon art, shared by the Swamp Adventure (held in the player's hand) and the Bag (preview card).
// WeaponArt.draw(ctx,id,a) draws a weapon pointing right from the grip at (0,0); a = 0..1 swing/muzzle glow.
// WeaponArt.paint(canvas,id) fits a weapon into a canvas for the Bag. To add a weapon: add a draw function to WPN below
// (same id as its GEAR line in store.js) and a slash colour in WPN_PAL in adventure.html.
const WeaponArt=(()=>{
 function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
 let GS=null;
 function sprite(){if(GS)return GS;const c=document.createElement("canvas");c.width=c.height=128;const g=c.getContext("2d"),q=g.createRadialGradient(64,64,0,64,64,64);q.addColorStop(0,"rgba(255,236,190,.9)");q.addColorStop(.35,"rgba(255,236,190,.32)");q.addColorStop(1,"rgba(255,236,190,0)");g.fillStyle=q;g.fillRect(0,0,128,128);return GS=c}
 function glow(c,x,y,r,a){const pa=c.globalAlpha;c.globalAlpha=pa*a;c.drawImage(sprite(),x-r,y-r,r*2,r*2);c.globalAlpha=pa}
 const WPN={
  spikedblade(c,a){
   c.fillStyle="#6b4a2a";c.strokeStyle="#2a1a0c";c.lineWidth=1.4;rr(c,-9,-2.6,11,5.2,2);c.fill();c.stroke();
   c.fillStyle="#f2c14e";c.beginPath();c.arc(-9.5,0,3,0,7);c.fill();c.stroke();rr(c,1,-7.5,4.5,15,2);c.fill();c.stroke();
   const g=c.createLinearGradient(0,-4,0,4);g.addColorStop(0,"#eafff6");g.addColorStop(1,"#7fb3a5");c.fillStyle=g;c.strokeStyle="#0e2a24";
   c.beginPath();c.moveTo(5.5,-4);c.lineTo(31,-3);c.lineTo(40,0);c.lineTo(31,3);c.lineTo(5.5,4);c.closePath();c.fill();c.stroke();
   c.strokeStyle="rgba(255,255,255,.75)";c.lineWidth=1;c.beginPath();c.moveTo(8,-.6);c.lineTo(34,-.6);c.stroke();
   c.fillStyle="#3fae5a";c.strokeStyle="#0e3a1c";c.lineWidth=1;for(let i=0;i<4;i++){const x=10+i*6.5;c.beginPath();c.moveTo(x,-3.6);c.lineTo(x+2.6,-9.5);c.lineTo(x+4.6,-3.4);c.fill();c.stroke();c.beginPath();c.moveTo(x+1.5,3.6);c.lineTo(x+4,9);c.lineTo(x+6,3.4);c.fill();c.stroke()}
  },
  bogblaster(c,a){
   c.fillStyle="#5a3a1c";c.strokeStyle="#1e1208";c.lineWidth=1.4;c.save();c.rotate(.25);rr(c,-4,3,6,10,2);c.fill();c.stroke();c.restore();
   const g=c.createLinearGradient(0,-7,0,7);g.addColorStop(0,"#7a8a4a");g.addColorStop(1,"#3a4a22");c.fillStyle=g;rr(c,-7,-6,23,12,4);c.fill();c.stroke();
   c.fillStyle="#34421e";rr(c,15,-3.6,15,7.2,2);c.fill();c.stroke();c.fillStyle="#8fe88a";rr(c,29,-5,5,10,2);c.fill();c.stroke();
   c.fillStyle="rgba(125,255,106,.85)";c.strokeStyle="#1f4a14";c.beginPath();c.arc(5,-9,6.2,0,7);c.fill();c.stroke();
   c.fillStyle="#eaffd0";c.beginPath();c.arc(3,-10.5,1.4,0,7);c.arc(7,-7,1,0,7);c.fill();
   c.fillStyle="#7dff6a";c.beginPath();c.ellipse(32,6,1.8,3.2,0,0,7);c.fill();
   if(a>0){glow(c,38,0,14*a,a)}
  },
  hopperstaff(c,a){
   glow(c,42,0,16,.55);
   c.strokeStyle="#2a1a0c";c.lineWidth=5.2;c.lineCap="round";c.beginPath();c.moveTo(-14,0);c.lineTo(36,0);c.stroke();c.strokeStyle="#9a6a34";c.lineWidth=3.2;c.beginPath();c.moveTo(-14,0);c.lineTo(36,0);c.stroke();
   c.strokeStyle="#d8f7ff";c.lineWidth=1.8;c.beginPath();c.moveTo(8,0);for(let i=0;i<6;i++)c.lineTo(10+i*3,i%2?-4.5:4.5);c.stroke();
   c.fillStyle="#43c463";c.strokeStyle="#14451f";c.lineWidth=1.6;c.beginPath();c.arc(42,0,7,0,7);c.fill();c.stroke();
   c.fillStyle="#fff";c.beginPath();c.arc(42,-5.5,2.6,0,7);c.arc(46.5,-4,2.4,0,7);c.fill();c.fillStyle="#0b2a2c";c.beginPath();c.arc(42.6,-5.5,1.2,0,7);c.arc(47,-4,1.1,0,7);c.fill();
   c.strokeStyle="#14451f";c.lineWidth=1.3;c.beginPath();c.moveTo(40,3);c.quadraticCurveTo(45,6,49,2);c.stroke();
  }
 };
 const has=id=>typeof WPN[id]==="function";
 function draw(c,id,a){if(has(id))WPN[id](c,a||0)}
 // fits the weapon into the canvas (already sized by the caller), centred, with a soft glow behind it
 function paint(cv,id,glowColor){
  if(!has(id))return false;
  const c=cv.getContext("2d"),w=cv.width,h=cv.height;c.clearRect(0,0,w,h);
  const s=Math.min(w/78,h/36);
  c.save();c.translate(w/2-16*s,h/2);c.scale(s,s);c.lineJoin="round";draw(c,id,.45);c.restore();
  return true;
 }
 return{draw,paint,has,ids:()=>Object.keys(WPN)};
})();
