/* Cabin: the treasure cabin before every boss arena (Swamp Adventure Levels 1-4 and the Endless Realms boss levels).
 * Load after progression.js and storyboss.js, before the game script in adventure.html.
 *
 * What it gives you:
 *   Cabin.CFG       the numbers to tune: HP (extra max Flames), DMG (damage bonus), W (cabin width), PRE / POST (space before / after it)
 *   Cabin.add(L)    turns a boss level into a "cabin + boss" level: pushes the arena right, lengthens the last ground piece and the level,
 *                   adds L.cabin = {x, w, cx, door}. Safe to call twice (it does nothing the second time) and ignores levels without an arena
 *   Cabin.REWARDS   the two choices in the chest popup
 *   Cabin.draw(X,c) draws the cabin, the chest and the barred door (called once per frame by adventure.html, behind the player)
 *
 * The chest choice itself (CHEST in adventure.html) lasts for the one level attempt: it is cleared when a level starts or the run restarts.
 * The barred right-hand door stays shut until the chest has been opened, so every player picks a reward before the boss.
 */
const Cabin=(function(){
 const CFG={HP:1,DMG:.25,W:280,PRE:20,POST:40,TIME:10};   // HP: extra max Flames. DMG: +25% damage. TIME: seconds added to the level's par time for the walk through

 const REWARDS=[
  {id:"hp", name:"Max Flames +1", text:"One more Flame, and it starts lit", icon:"flame"},
  {id:"dmg",name:"+25% Damage",   text:"Every hit lands 25% harder",        icon:"\u2694"}
 ];

 // Make a boss level a cabin level. The cabin stands just in front of where the arena used to start; the arena moves right to make room.
 function add(L){
  if(!L||!L.arena||L.cabin)return false;
  const g=L.grounds;let last=null;for(const p of g)if(!last||p.x+p.w>last.x+last.w)last=p;
  if(!last)return false;
  const A=L.arena.x,shift=CFG.PRE+CFG.W+CFG.POST;
  last.w+=shift;L.W+=shift;L.arena.x+=shift;L.arena.bx+=shift;
  if(L.spores)for(const s of L.spores)if(s[0]>=A)s[0]+=shift;   // spores that were floating in the arena stay in the arena
  L.bossTime=(L.bossTime||0)+CFG.TIME;
  const x=A+CFG.PRE;L.cabin={x:x,w:CFG.W,cx:x+CFG.W/2,door:x+CFG.W-16};
  return true;
 }

 // ---- drawing (all in world coordinates, the game has already translated by the camera) ----
 // c: {cam,t,W,GY,state,chest,touch,glow,GLOW,rr}   chest: {taken,open,openT,pick}
 function draw(X,c){
  const L=c.cabin;if(!L)return;
  const cam=c.cam,x0=L.x,w=L.w,GY=c.GY,t=c.t;
  if(x0+w<cam-40||x0>cam+c.W+40)return;
  const ch=c.chest,inside=c.state.x>x0+10&&c.state.x<x0+w-10,rt=GY-150;
  X.save();X.lineJoin="round";
  // warm light spilling out of the cabin
  c.glow(c.GLOW.amber,x0+w/2,GY-52,w*.62,inside?.5:.34);
  // floor planks
  X.fillStyle="#5b3a1d";X.fillRect(x0,GY-1,w,9);X.fillStyle="#7a5128";X.fillRect(x0,GY-1,w,3);
  X.strokeStyle="#3a2210";X.lineWidth=1;for(let px=x0+24;px<x0+w;px+=24){X.beginPath();X.moveTo(px,GY+2);X.lineTo(px,GY+8);X.stroke()}
  // back wall (log planks) and a dark interior shade
  X.fillStyle="#3a2412";X.fillRect(x0+14,rt,w-28,GY-rt);
  X.fillStyle="#4d3019";for(let px=x0+14;px<x0+w-14;px+=18){X.fillRect(px+1,rt,16,GY-rt)}
  X.strokeStyle="#2a190c";X.lineWidth=2;for(let px=x0+14;px<x0+w-14;px+=18){X.beginPath();X.moveTo(px,rt);X.lineTo(px,GY);X.stroke()}
  const sh=X.createLinearGradient(0,rt,0,GY);sh.addColorStop(0,"rgba(8,4,0,.55)");sh.addColorStop(.6,"rgba(8,4,0,.05)");sh.addColorStop(1,"rgba(255,170,70,.14)");X.fillStyle=sh;X.fillRect(x0+14,rt,w-28,GY-rt);
  // round window with a night sky and a moon
  const wx=x0+54,wy=rt+44;X.fillStyle="#122a3c";X.beginPath();X.arc(wx,wy,17,0,7);X.fill();X.fillStyle="#fff1c4";X.beginPath();X.arc(wx+5,wy-4,4,0,7);X.fill();
  X.strokeStyle="#7a5128";X.lineWidth=4;X.beginPath();X.arc(wx,wy,17,0,7);X.stroke();X.lineWidth=2.4;X.beginPath();X.moveTo(wx-17,wy);X.lineTo(wx+17,wy);X.moveTo(wx,wy-17);X.lineTo(wx,wy+17);X.stroke();
  // shelf with a jar and a lantern hanging from the roof
  X.fillStyle="#7a5128";X.fillRect(x0+w-92,rt+46,56,5);X.fillStyle="#9ad7c4";X.fillRect(x0+w-84,rt+34,10,12);X.fillStyle="#ffcf7a";X.fillRect(x0+w-66,rt+36,9,10);
  const lx=x0+w/2+40,ly=rt+22;X.strokeStyle="#2a190c";X.lineWidth=1.6;X.beginPath();X.moveTo(lx,rt);X.lineTo(lx,ly-8);X.stroke();
  c.glow(c.GLOW.amber,lx,ly+2,34,.7+.12*Math.sin(t*3));
  X.fillStyle="#ffcf7a";c.rr(lx-5,ly-6,10,14,3);X.fill();X.strokeStyle="#3a2210";X.lineWidth=1.6;X.stroke();
  // rug under the chest
  X.fillStyle="#8a2f3d";c.rr(L.cx-44,GY-4,88,6,3);X.fill();X.fillStyle="#e8c36a";X.fillRect(L.cx-40,GY-3,80,1.4);
  // the chest
  drawChest(X,c,L.cx,GY,ch,t);
  // left wall: the open front door
  X.fillStyle="#5b3a1d";X.fillRect(x0,rt-8,14,GY-rt+8);X.fillStyle="#7a5128";X.fillRect(x0,rt-8,5,GY-rt+8);
  X.fillStyle="#6b4424";X.beginPath();X.moveTo(x0+14,rt+4);X.lineTo(x0+34,rt+12);X.lineTo(x0+34,GY-2);X.lineTo(x0+14,GY);X.closePath();X.fill();X.strokeStyle="#2a190c";X.lineWidth=2;X.stroke();
  X.fillStyle="#f2c14e";X.beginPath();X.arc(x0+30,GY-42,2.4,0,7);X.fill();
  // right wall: the back door, barred until the chest is open
  const dx=L.door,sw=ch.taken?Math.min(1,ch.doorT):0;
  X.fillStyle="#5b3a1d";X.fillRect(dx,rt-8,16,GY-rt+8);X.fillStyle="#3f2813";X.fillRect(dx+11,rt-8,5,GY-rt+8);
  if(sw<1){   // the door leaf swings away as the lock opens
   const dw=(1-sw)*14;X.fillStyle="#6b4424";X.fillRect(dx-dw,rt+4,dw,GY-rt-4);
   if(dw>2){X.strokeStyle="#2a190c";X.lineWidth=2;X.strokeRect(dx-dw,rt+4,dw,GY-rt-4);
    X.fillStyle="#9aa3a8";X.fillRect(dx-dw,GY-52,dw,5);X.fillRect(dx-dw,GY-30,dw,5);
    if(dw>8){X.fillStyle="#f2c14e";c.rr(dx-dw+1,GY-44,dw-2,11,2);X.fill();X.strokeStyle="#3a2210";X.lineWidth=1.4;X.stroke()}}
  }
  // roof: overhanging beam, shingles, chimney with a curl of smoke
  const rf=inside?.4:1;
  X.globalAlpha=rf;
  X.fillStyle="#6b2f2a";X.beginPath();X.moveTo(x0-22,rt+4);X.lineTo(x0+w/2,rt-52);X.lineTo(x0+w+22,rt+4);X.lineTo(x0+w+22,rt+14);X.lineTo(x0+w/2,rt-38);X.lineTo(x0-22,rt+14);X.closePath();X.fill();
  X.strokeStyle="#3a1814";X.lineWidth=2.4;X.stroke();
  X.fillStyle="#8a3b34";X.beginPath();X.moveTo(x0-14,rt+4);X.lineTo(x0+w/2,rt-46);X.lineTo(x0+w+14,rt+4);X.closePath();X.fill();
  X.strokeStyle="#6b2f2a";X.lineWidth=1.6;for(let i=1;i<4;i++){const yy=rt+4-i*13,half=(w/2+14)*(1-i*.23);X.beginPath();X.moveTo(x0+w/2-half,yy);X.lineTo(x0+w/2+half,yy);X.stroke()}
  X.fillStyle="#4d3019";X.fillRect(x0-22,rt+4,w+44,6);
  X.fillStyle="#5a5a63";X.fillRect(x0+w-70,rt-44,16,28);X.fillStyle="#3c3c44";X.fillRect(x0+w-72,rt-48,20,6);
  X.globalAlpha=1;
  for(let i=0;i<3;i++){const u=((t*.4+i/3)%1);X.fillStyle="rgba(210,220,225,"+(.28*(1-u))+")";X.beginPath();X.arc(x0+w-62+Math.sin(t+i)*6+u*10,rt-54-u*46,4+u*8,0,7);X.fill()}
  // little name board over the door
  if(!inside){X.fillStyle="#3f2813";c.rr(x0+w/2-44,rt+12,88,18,5);X.fill();X.fillStyle="#ffe9b0";X.font="900 10px Nunito,sans-serif";X.textAlign="center";try{X.letterSpacing="2px"}catch(_){}X.fillText("CHEST CABIN",x0+w/2,rt+25);try{X.letterSpacing="0px"}catch(_){}}
  X.restore();
  // hints
  const s=c.state;
  if(!ch.taken&&s.x>x0&&s.x<x0+w){
   const near=Math.abs(s.x-L.cx)<=c.reach,txt=near?(c.touch?"Tap Attack to open":"Press J or E to open"):"Find the chest";
   hint(X,txt,L.cx,GY-72-(near?3*Math.sin(t*6):0),near?"#ffe27a":"#d9fff0");
  }
  if(!ch.taken&&s.x>L.door-90&&s.x<=L.door)hint(X,"Barred. Open the chest first",L.door-40,GY-92,"#ffb3bf");
 }
 function hint(X,txt,x,y,col){X.save();X.textAlign="center";X.font="900 12px Nunito,sans-serif";X.lineWidth=4;X.strokeStyle="#0a0604";X.strokeText(txt,x,y);X.fillStyle=col;X.fillText(txt,x,y);X.restore()}

 function drawChest(X,c,cx,GY,ch,t){
  const open=ch.open?Math.min(1,ch.openT):0,bw=48,bh=24;
  if(!ch.taken)c.glow(c.GLOW.amber,cx,GY-20,52,.5+.2*Math.sin(t*3));
  else c.glow(c.GLOW.teal,cx,GY-26,40,.3);
  X.save();X.translate(cx,GY-2);X.lineJoin="round";
  X.fillStyle="rgba(0,0,0,.35)";X.beginPath();X.ellipse(0,1,bw*.62,4,0,0,7);X.fill();
  // body
  X.fillStyle="#7a4a24";c.rr(-bw/2,-bh,bw,bh,3);X.fill();X.strokeStyle="#2f1a0a";X.lineWidth=2.4;X.stroke();
  X.fillStyle="#f2c14e";X.fillRect(-bw/2+5,-bh,5,bh);X.fillRect(bw/2-10,-bh,5,bh);
  if(open>0){X.fillStyle="#ffe9a8";X.fillRect(-bw/2+4,-bh,bw-8,5)}   // glow inside
  // lid, hinged at the back (right side of the top edge looks like the hinge when opened)
  X.save();X.translate(-bw/2,-bh);X.rotate(-open*1.9);
  X.fillStyle="#8a5629";X.beginPath();X.moveTo(0,0);X.lineTo(0,-6);X.quadraticCurveTo(bw/2,-20,bw,-6);X.lineTo(bw,0);X.closePath();X.fill();X.stroke();
  X.fillStyle="#f2c14e";X.fillRect(5,-9,5,9);X.fillRect(bw-10,-9,5,9);
  X.restore();
  // lock
  if(open<.5){X.fillStyle="#ffe9b0";c.rr(-5,-bh-2,10,10,2);X.fill();X.strokeStyle="#2f1a0a";X.lineWidth=1.6;X.stroke();X.fillStyle="#2f1a0a";X.fillRect(-1,-bh+2,2,4)}
  X.restore();
  // light shafts out of an open chest
  if(open>0&&!ch.taken){X.save();X.globalAlpha=.25*open;X.fillStyle="#ffe9a8";for(let i=-2;i<=2;i++){X.beginPath();X.moveTo(cx+i*4,GY-26);X.lineTo(cx+i*18-4,GY-90);X.lineTo(cx+i*18+4,GY-90);X.lineTo(cx+i*4+4,GY-26);X.fill()}X.restore()}
 }

 return{CFG,REWARDS,add,draw};
})();
