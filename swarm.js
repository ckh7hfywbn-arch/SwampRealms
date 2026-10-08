/* Swarm: mosquito swarms in the Endless Realms. Load before the game script in adventure.html.
 *
 * Some Endless levels (about 4 in 10, never boss levels, never the hand-made levels) have one or two swarm spots. When the player runs past one,
 * a cloud of little mosquitoes flies in from the screen edges and chases them. They do NO damage: every touch just shoves the player in a random
 * direction (a short stun, so it cannot be steered out of straight away). A Swat! button pops up; pressing it (or K) sends the whole swarm flying.
 * If the player ignores them the swarm gives up after LIFE seconds.
 *
 *   Swarm.CFG              numbers to tune (chance, count, shove strength, how long a swarm stays)
 *   Swarm.plan(L, index)   called once when an Endless level is built: sets L.swarms = [x, ...] (the spots) or leaves it empty
 *   Swarm.load(list)       called by loadLevel with L.swarms; also clears any swarm in progress
 *   Swarm.reset()          clears the swarm (respawn)
 *   Swarm.update(dt, c)    c = game context {state, fx, W, GROUND_Y, R, HW, AUDIO}
 *   Swarm.on()             true while a swarm is chasing the player (the Swat button shows)
 *   Swarm.swat(c)          the Swat button
 *   Swarm.draw(X, c)       the mosquitoes (world space, call inside the camera transform), Swarm.hud(X, c) the warning text (screen space)
 */
const Swarm=(function(){
 const CFG={chance:.4,second:.35,count:14,life:14,shove:[170,260],pop:130,gap:.55,minX:800,edge:900};
 let trig=[],fired=[],flies=[],active=false,age=0,hitCd=0,swatCd=0,msg=0;

 function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}

 function plan(L,i){
  L.swarms=[];if(!L||L.boss||L.arena)return;
  const r=rng(i*7919+4243);
  if(r()>=CFG.chance)return;
  const n=r()<CFG.second?2:1,lo=CFG.minX,hi=L.W-CFG.edge;if(hi<=lo)return;
  const span=(hi-lo)/n;
  for(let k=0;k<n;k++)L.swarms.push(Math.round(lo+k*span+span*(.15+.7*r())));
 }
 function load(list){trig=(list||[]).slice();reset()}
 function reset(){fired=trig.map(()=>false);flies=[];active=false;age=0;hitCd=0;swatCd=0;msg=0}

 function spawn(c){
  const cam=c.state.cam,gy=c.GROUND_Y;flies=[];active=true;age=0;msg=2.6;hitCd=.6;
  for(let i=0;i<CFG.count;i++){
   const side=Math.random()<.5?-1:1;
   flies.push({x:side<0?cam-20-Math.random()*60:cam+c.W+20+Math.random()*60,y:90+Math.random()*(gy-130),vx:0,vy:0,ph:Math.random()*6.283,fled:0,away:0});
  }
 }

 function update(dt,c){
  const s=c.state;
  swatCd=Math.max(0,swatCd-dt);hitCd=Math.max(0,hitCd-dt);msg=Math.max(0,msg-dt);
  for(let i=0;i<trig.length;i++)if(!fired[i]&&s.x>=trig[i]){fired[i]=true;if(!active)spawn(c);}
  if(!flies.length)return;
  if(active){age+=dt;if(age>CFG.life){active=false;for(const f of flies){f.fled=1;f.away=Math.random()<.5?-1:1}}}
  const t=s.t;
  for(const f of flies){
   if(f.fled){f.x+=f.away*160*dt;f.y-=70*dt;f.fled+=dt;continue}
   // chase a point that circles around the player, with a nervous wobble
   const tx=s.x+Math.cos(f.ph+t*5)*30,ty=s.y-10+Math.sin(f.ph*1.7+t*6)*22;
   f.vx+=(tx-f.x)*3.2*dt+(Math.random()-.5)*160*dt;f.vy+=(ty-f.y)*3.2*dt+(Math.random()-.5)*160*dt;
   const k=Math.max(0,1-2.2*dt);f.vx*=k;f.vy*=k;
   const sp=Math.hypot(f.vx,f.vy),mx=190;if(sp>mx){f.vx*=mx/sp;f.vy*=mx/sp}
   f.x+=f.vx*dt;f.y=Math.min(c.GROUND_Y-6,f.y+f.vy*dt);
  }
  // a touch shoves the player in a random direction. No damage, no invincibility flash.
  if(active&&hitCd<=0&&s.hp>0&&c.vis.dying<=0){
   for(const f of flies){
    if(f.fled)continue;
    if(Math.hypot(f.x-s.x,f.y-s.y)<c.R+7){
     const d=Math.random()<.5?-1:1,v=CFG.shove[0]+Math.random()*(CFG.shove[1]-CFG.shove[0]);
     s.vx=d*v;s.stun=Math.max(s.stun,.14);
     if(s.ground){s.vy=-CFG.pop*(.5+Math.random()*.7);s.ground=false}else s.vy+=(Math.random()-.5)*160;
     hitCd=CFG.gap;
     for(let i=0;i<5;i++)c.fx.push({k:"puff",x:s.x,y:s.y,vx:-d*(30+Math.random()*40),vy:-10-Math.random()*20,life:.3,max:.3,r:2,g:5});
     c.fx.push({k:"txt",x:s.x,y:s.y-24,vx:d*30,vy:-30,life:.5,max:.5,s:"Bzzt!"});
     break;
    }
   }
  }
  if(!active)flies=flies.filter(f=>f.fled<1.6);
 }

 // The Swat! button: the whole swarm scatters
 function swat(c){
  if(!active||swatCd>0)return 0;
  swatCd=.35;let n=0;active=false;msg=0;
  c.AUDIO.play("attack");
  for(const f of flies){f.fled=1;f.away=f.x<c.state.x?-1:1;n++;c.fx.push({k:"puff",x:f.x,y:f.y,vx:f.away*60,vy:-20,life:.35,max:.35,r:2,g:6})}
  c.fx.push({k:"ring",x:c.state.x,y:c.state.y-6,vx:0,vy:0,life:.35,max:.35,c:"#ffe27a",g:60});
  c.fx.push({k:"txt",x:c.state.x,y:c.state.y-30,vx:0,vy:-40,life:.7,max:.7,s:"Swatted!"});
  return n;
 }

 function draw(X,c){
  if(!flies.length)return;
  const t=c.state.t;
  X.save();
  for(const f of flies){
   if(f.x<c.cam-30||f.x>c.cam+c.W+30)continue;
   const a=f.fled?Math.max(0,1-(f.fled-1)/.6):1;if(a<=0)continue;
   const dir=f.fled?f.away:(f.vx>=0?1:-1),fl=Math.sin(t*90+f.ph)>0;
   X.save();X.globalAlpha=a;X.translate(f.x,f.y);X.scale(dir,1);
   X.fillStyle="rgba(210,235,255,.65)";X.beginPath();X.ellipse(-1,-3,3.2,fl?1.4:2.6,-.5,0,7);X.ellipse(1,-3,3.2,fl?2.6:1.4,.5,0,7);X.fill();
   X.fillStyle="rgba(255,240,180,.28)";X.beginPath();X.arc(0,0,6,0,7);X.fill();
   X.fillStyle="#1b1a22";X.beginPath();X.ellipse(0,0,3.4,1.6,0,0,7);X.fill();
   X.strokeStyle="#1b1a22";X.lineWidth=.8;X.beginPath();X.moveTo(3,0);X.lineTo(7,1.5);X.moveTo(-1,1);X.lineTo(-2,4);X.moveTo(1,1);X.lineTo(2,4);X.stroke();
   X.restore();
  }
  X.restore();
 }

 function hud(X,c){
  if(msg<=0)return;
  X.save();X.globalAlpha=Math.min(1,msg*2);X.textAlign="center";X.font="900 14px Nunito,sans-serif";X.lineWidth=4;X.strokeStyle="#0a1208";
  X.strokeText("Mosquito swarm! Swat them away",c.W/2,120);X.fillStyle="#ffe27a";X.fillText("Mosquito swarm! Swat them away",c.W/2,120);X.restore();
 }

 return{CFG,plan,load,reset,update,swat,draw,hud,on:()=>active};
})();
