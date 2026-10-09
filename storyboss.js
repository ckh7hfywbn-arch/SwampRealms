/* StoryBoss: the setup for an end-of-level boss in the main story (Levels 1-4). Load after progression.js, before the game script.
 *
 * What this file gives you (the boss slots, the arena builder, and the boss behaviours; "stub" is a placeholder for any slot without a real boss yet):
 *   SLOTS        one slot per story level: its boss name, health, size, arena length, loot, music, and an on/off switch
 *   addArena()   turns a normal level into a boss level: lengthens the last ground piece, drops the goal gate, builds the arena
 *   kinds        the boss behaviours. "stub" is a placeholder. Add a real boss by adding a kind here (see HOW TO ADD A BOSS)
 *   apply()      copies a slot onto the game's BS (boss settings) when a level loads
 *
 * Level 3 (index 2) already has its boss, the Rootmaw, built into adventure.html, so it has no slot here. Level 2 uses the Mirewing (kind "wing"), also built into adventure.html.
 *
 * HOW TO ADD A BOSS
 *   1. Add a kind:   kinds.myboss={reset(c){...},update(c,dt,dx,enraged){...},draw(c){...}}
 *   2. Point a slot at it:  SLOTS[0].kind="myboss", and give it a name, hp, w, h
 *   3. Optional loot: add the fragment to FRAGMENTS in store.js, then set SLOTS[n].fragment to its id.
 *   `c` is the game context (see BCTX in adventure.html): c.state (the player), c.boss (live boss data: x, y, hp, st, t, dir, hurt,
 *   dead, defeated...), c.BS (this boss's settings), c.AR (arena {x: left wall, bx: start}), c.fx (particles), c.X (the canvas),
 *   c.GROUND_Y, c.HW, c.R, c.hurtPlayer(fromX,foeName), c.startDefeat(), c.vis (screen shake/flash), c.AUDIO, c.glow, c.GLOW.
 *   The game already handles: waking the boss when the player enters the arena, the vine gate closing behind the player,
 *   the intro (boss.st is "intro" for 1.4s; your update must move it on), the player's hits and the knockback, the boss health bar,
 *   the defeat animation (boss.dead counts down from BS.defeat), the victory screen, drops, and score.
 */
const StoryBoss=(function(){
 // Master switch. false = the story levels play exactly as before (goal gate, no boss).
 const ENABLED=true;

 // One slot per story level index. on:true gives that level a boss arena (with the placeholder boss); on:false keeps it boss-free with its goal gate. Everything here is a placeholder to rename and tune.
 //   name / short   shown on the boss bar and results ("The <short> got you.")
 //   kind           which behaviour in `kinds` runs this boss
 //   hp             hits to defeat with a bare attack (weapons hit harder and shorten the fight)
 //   w / h          hit box in pixels (also the stub's size)
 //   defeat         seconds of defeat animation before the victory screen
 //   arenaLen       pixels added to the end of the level for the arena (the arena itself is ARENA_W wide)
 //   bossTime       extra seconds added to the level's par time for the score bonus, because the level is longer
 //   fragment       FRAGMENTS id this boss can drop (null = no drop)
 //   music          music track while fighting (undefined = the Rootmaw fight track, 3)
 const SLOTS={
  0:{on:true, name:"The Bog Gator",short:"Bog Gator",kind:"gator",hp:6, w:96,h:38,defeat:1.6,arenaLen:520,bossTime:60,fragment:"crawler",music:undefined},
  1:{on:true, name:"The Mirewing",short:"Mirewing",kind:"wing",hp:9, w:64,h:46,defeat:2.2,arenaLen:520,bossTime:60,fragment:"wing",music:undefined},
  3:{on:true, name:"The Stone Ape",short:"Stone Ape",kind:"ape",hp:12,w:72,h:92,defeat:2,arenaLen:520,bossTime:60,fragment:"ape",music:undefined}
 };
 const ARENA_W=440,   // from the left wall (the vines) to the end of the level
       START_FROM_END=140;   // the boss starts this far from the end of the level

 // Make a normal level a boss level. Safe to call once per level; does nothing if the level already has an arena.
 function addArena(L,slot){
  if(!L||L.arena||L.boss)return false;
  const g=L.grounds,last=g[g.length-1];
  if(!last||last.x+last.w<L.W-1)return false;   // the level must end on solid ground (every story level does)
  const len=Math.max(ARENA_W-60,slot.arenaLen|0);
  last.w+=len;L.W+=len;
  L.arena={x:L.W-ARENA_W,bx:L.W-START_FROM_END};
  L.cps.push(L.arena.x-40);   // a checkpoint just before the vines, so a lost fight restarts at the arena door
  L.goalX=99999;L.boss=true;L.bossTime=slot.bossTime||0;
  return true;
 }

 // Build the boss levels once, right after LEVELS is created. Returns how many levels got a boss.
 function attach(levels){
  if(!ENABLED)return 0;let n=0;
  for(const k in SLOTS){const s=SLOTS[k],L=levels[k];if(s.on&&L&&addArena(L,s)){L.storyBoss=s;n++}}
  return n;
 }

 // Copy a slot onto the game's boss settings (BS). Called by loadLevel after the normal scaling.
 function apply(BS,s){
  const K=kinds[s.kind];BS.kind=s.kind;BS.custom=K?(K.builtin?null:K):kinds.stub;   // builtin kinds (wing) run inside adventure.html
  BS.name=s.name;BS.short=s.short;
  BS.w=s.w;BS.h=s.h;BS.hp=s.hp;BS.defeat=s.defeat;BS.slamPlus=0;BS.loot=s.fragment||null;BS.music=s.music;
 }

 // ---- Boss behaviours ----
 const kinds={};
 // "wing": the Mirewing, the flying mire-moth already built into adventure.html (updateWing / drawWing). It hovers behind a shield that blocks
 // attacks, spits fans of orbs, then telegraphs a dive and perches on the ground; that is the only time it can be hit. Used by Level 2.
 kinds.wing={builtin:true};
 // "stub": a placeholder so every slot can be played end to end. It wakes up, then plods toward the player and hurts on contact.
 // Replace it per level with a real boss (see HOW TO ADD A BOSS above).
 kinds.stub={
  reset(c){},
  update(c,dt,dx,en){
   const b=c.boss,BS=c.BS,AR=c.AR,s=c.state;
   b.dir=dx>=0?1:-1;
   if(b.st==="intro"){b.t-=dt;if(b.t<=0){b.st="walk";b.t=0}return}
   const sp=en?52:34;
   if(b.hurt<=0)b.x=Math.max(AR.x+BS.w/2+6,Math.min(c.LEVEL_W-BS.w/2-6,b.x+b.dir*sp*dt));
   if(c.vis.dying<=0&&s.hp>0&&s.hurt<=0&&b.hurt<=0&&
      s.x+c.HW>b.x-BS.w/2+6&&s.x-c.HW<b.x+BS.w/2-6&&s.y+c.R>c.GROUND_Y-BS.h+12&&s.y-c.R<c.GROUND_Y){
    c.hurtPlayer(b.x,BS.short);if(s.hp<=0)c.startDefeat();
   }
  },
  draw(c){
   const b=c.boss,BS=c.BS,X=c.X,t=b.tt,dp=b.defeated?1-b.dead/BS.defeat:0;
   const flash=b.hurt>.09||(b.defeated&&Math.sin(t*55)>0),rise=b.st==="intro"?Math.min(1,1-b.t/1.4):1;
   X.save();X.globalAlpha=.45*(1-dp);X.fillStyle="#000";X.beginPath();X.ellipse(b.x,c.GROUND_Y,BS.w*.6,5,0,0,7);X.fill();X.restore();
   X.save();X.globalAlpha=Math.max(0,1-dp*dp);
   X.translate(b.x+(b.hurt>0?Math.sin(t*90)*2:0),c.GROUND_Y);X.scale(b.dir*(1+.4*dp),(.5+.5*rise)*(1-.85*dp));
   X.fillStyle=flash?"#ffffff":"#5a4a7a";X.strokeStyle="#1d1530";X.lineWidth=3;
   X.fillRect(-BS.w/2,-BS.h,BS.w,BS.h);X.strokeRect(-BS.w/2,-BS.h,BS.w,BS.h);
   X.fillStyle=flash?"#ffd0d8":"#ff6b82";   // two eyes so you can tell which way it faces
   X.beginPath();X.arc(BS.w*.12,-BS.h*.66,5,0,7);X.arc(BS.w*.34,-BS.h*.66,5,0,7);X.fill();
   X.fillStyle="#d9cfff";X.font="900 14px Nunito,sans-serif";X.textAlign="center";X.fillText("BOSS",0,-BS.h*.25);
   X.restore();
  }
 };

 // "gator": a basic alligator for Level 1. It crawls toward you, rears its head and opens its jaws (the warning, red eye), then lunges
 // straight ahead in one fast snap. After the lunge it is winded for a moment: that is your window to strike. Jump over it to get behind it.
 // Under half health it crawls faster, winds up quicker and lunges further. Contact hurts, so stay out of its path when the jaws open.
 kinds.gator={
  reset(c){c.boss.wt=.7},
  update(c,dt,dx,en){
   const b=c.boss,BS=c.BS,AR=c.AR,s=c.state,lo=AR.x+BS.w/2+6,hi=c.LEVEL_W-BS.w/2-6,cl=x=>Math.max(lo,Math.min(hi,x));
   const face=()=>{b.dir=dx>=0?1:-1};
   if(b.st==="intro"){face();b.t-=dt;if(b.t<=0){b.st="walk";b.t=1.1}return}
   if(b.st==="walk"){
    face();if(b.hurt<=0)b.x=cl(b.x+b.dir*(en?66:46)*dt);
    b.t-=dt;if(b.t<=0){b.st="wind";b.wt=en?.45:.7;b.t=b.wt;c.AUDIO.play("croak")}
   }else if(b.st==="wind"){   // jaws open and it tracks you until the snap
    face();b.t-=dt;if(b.t<=0){b.st="lunge";b.t=en?.46:.38}
   }else if(b.st==="lunge"){   // a straight, fast dash in the direction it was facing
    const x0=b.x;b.x=cl(b.x+b.dir*(en?400:320)*dt);b.t-=dt;
    if(Math.random()<dt*40)c.fx.push({k:"puff",x:b.x-b.dir*BS.w/2,y:c.GROUND_Y-3,vx:-b.dir*40,vy:-12,life:.35,max:.35,r:3,g:8});
    if(b.t<=0||b.x===x0){b.st="recover";b.t=en?.85:1.15;c.AUDIO.play("thump");c.vis.shake=Math.max(c.vis.shake,.2);
     c.fx.push({k:"ring",x:b.x+b.dir*BS.w/2,y:c.GROUND_Y-4,vx:0,vy:0,life:.3,max:.3,c:"#ffb04f",g:34})}
   }else if(b.st==="recover"){
    b.t-=dt;if(b.t<=0){b.st="walk";b.t=(en?.8:1.2)+Math.random()*.5}
   }
   if(c.vis.dying<=0&&s.hp>0&&s.hurt<=0&&b.hurt<=0&&b.st!=="recover"&&b.st!=="intro"&&
      s.x+c.HW>b.x-BS.w/2+6&&s.x-c.HW<b.x+BS.w/2-6&&s.y+c.R>c.GROUND_Y-BS.h+8&&s.y-c.R<c.GROUND_Y){
    c.hurtPlayer(b.x,BS.short);if(s.hp<=0)c.startDefeat();
   }
  },
  draw(c){
   const b=c.boss,BS=c.BS,X=c.X,t=b.tt,st=b.st,dp=b.defeated?1-b.dead/BS.defeat:0,en=b.hp<=BS.hp/2;
   const flash=b.hurt>.09||(b.defeated&&Math.sin(t*55)>0),rise=st==="intro"?Math.min(1,1-b.t/1.4):1;
   const pw=st==="wind"?1-b.t/b.wt:0,hot=st==="wind"||st==="lunge",lunge=st==="lunge",rec=st==="recover";
   const jaw=st==="wind"?.3+.55*pw:lunge?.5:rec?.16+.05*Math.sin(t*8):.12+.1*Math.sin(t*4);
   const crawl=st==="walk"&&b.hurt<=0?Math.sin(t*9):0;
   const W=a=>flash?"#ffffff":a;
   const OUT="#0d1a10",G0=W(en?"#4b7035":"#3f7436"),G1=W(en?"#2b4a22":"#26502a"),G2=W("#7fb55a"),BEL=W("#d9d28a"),BEL2=W("#a9a35e"),
         TEETH=W("#f6f0dc"),MAW=W("#7c1c2a"),TONG=W("#c4485c"),MOSS=W("#8fd05f"),GLOW=flash?"#ffffff":(hot?"#ff5a6e":en?"#ffa23a":"#ffe26a");
   const poly=(pts,fill,stroke,lw)=>{X.beginPath();pts.forEach((p,i)=>X[i?"lineTo":"moveTo"](p[0],p[1]));X.closePath();if(fill){X.fillStyle=fill;X.fill()}if(stroke){X.lineWidth=lw||2.4;X.strokeStyle=stroke;X.stroke()}};
   X.save();X.globalAlpha=.45*(1-dp);X.fillStyle="#000";X.beginPath();X.ellipse(b.x,c.GROUND_Y,BS.w*.6,5,0,0,7);X.fill();X.restore();
   X.save();X.globalAlpha=Math.max(0,1-dp*dp);
   X.translate(b.x+(b.hurt>0?Math.sin(t*90)*2:0)+(st==="wind"?Math.sin(t*70)*1.2*pw:0),c.GROUND_Y);X.scale(b.dir*(1+.4*dp)*(lunge?1.05:1),(.55+.45*rise)*(1-.85*dp)*(lunge?.95:1));
   X.lineJoin="round";X.lineCap="round";
   if(hot)c.glow(c.GLOW.rose,10,-18,70,.26+.2*pw);
   const sw=Math.sin(t*3)*4+(lunge?-7:0),raise=st==="wind"?pw*7:0;
   X.translate(0,-7);
   // ---- tail: thick, tapering, with a ridge ----
   X.beginPath();X.moveTo(-30,-34);X.bezierCurveTo(-56,-34+sw*.4,-78,-26+sw,-100,-12+sw*1.7);X.bezierCurveTo(-78,-8+sw,-56,-6,-30,-8);X.closePath();
   let gr=X.createLinearGradient(0,-36,0,-6);gr.addColorStop(0,G0);gr.addColorStop(1,G1);X.fillStyle=gr;X.fill();X.lineWidth=2.6;X.strokeStyle=OUT;X.stroke();
   for(let i=0;i<6;i++){const u=i/6,x=-38-u*52,y=-33+u*21+sw*u*.8,h=8-u*5;poly([[x+5,y+1],[x,y-h],[x-5,y+1]],G1,OUT,1.8)}
   // ---- far legs ----
   const leg=(x,ph,col,sp)=>{X.save();X.translate(0,7);const o=crawl?Math.sin(t*9+ph)*4:0,lf=crawl?Math.max(0,Math.cos(t*9+ph))*3:0;
    X.beginPath();X.moveTo(x-8,-18);X.quadraticCurveTo(x-13+o*.4,-8,x-6+o,-4-lf);X.lineTo(x+9+o,-4-lf);X.quadraticCurveTo(x+9,-10,x+8,-18);X.closePath();X.fillStyle=col;X.fill();X.lineWidth=2.4;X.strokeStyle=OUT;X.stroke();
    X.fillStyle=TEETH;for(let k=0;k<3;k++){poly([[x+o+k*4-2,-4-lf],[x+o+k*4+8,-4-lf],[x+o+k*4+10,-lf]],TEETH,OUT,1.4)}X.restore()};
   leg(-22,Math.PI,G1);leg(24+raise*.3,0,G1);
   // ---- body ----
   X.beginPath();X.moveTo(-36,-22);X.bezierCurveTo(-36,-40,-8,-44,16,-42);X.bezierCurveTo(34,-40,42,-30,40,-20);X.bezierCurveTo(38,-8,20,-6,0,-6);X.bezierCurveTo(-24,-6,-36,-10,-36,-22);X.closePath();
   gr=X.createLinearGradient(0,-44,0,-6);gr.addColorStop(0,G2);gr.addColorStop(.3,G0);gr.addColorStop(1,G1);X.fillStyle=gr;X.fill();X.lineWidth=3;X.strokeStyle=OUT;X.stroke();
   // belly with plate lines
   X.beginPath();X.moveTo(-30,-12);X.bezierCurveTo(-10,-5,20,-5,36,-14);X.bezierCurveTo(20,-12,-8,-12,-30,-12);X.closePath();X.fillStyle=BEL;X.fill();
   X.strokeStyle=BEL2;X.lineWidth=1.3;for(let i=-26;i<34;i+=8){X.beginPath();X.moveTo(i,-11);X.lineTo(i+2,-6.5);X.stroke()}
   // armored scutes in two rows along the back
   for(let i=0;i<8;i++){const x=-30+i*9.5,y=-39-Math.sin(i*.8)*1.5;poly([[x-5,y+3],[x,y-9],[x+5,y+3]],W(en?"#5a8a3a":"#3a6e34"),OUT,2);poly([[x-1,y-8],[x,y-9],[x+1.5,y-4]],en?(flash?"#fff":"#ffb04f"):G2,null)}
   X.fillStyle=G1;X.strokeStyle=OUT;X.lineWidth=1.6;for(let i=0;i<7;i++){const x=-27+i*9.5;X.beginPath();X.ellipse(x,-29,4.2,3.2,0,0,7);X.fill();X.stroke()}
   // moss and a few swamp warts
   X.fillStyle=MOSS;X.globalAlpha=.8;X.beginPath();X.ellipse(-14,-39,8,2.6,-.1,0,7);X.ellipse(10,-41,6,2.2,.1,0,7);X.fill();X.globalAlpha=1;
   // ---- near legs ----
   leg(-6,0,G0);leg(36+raise*.3,Math.PI,G0);
   // ---- head: hinged lower jaw, long armored snout ----
   X.save();X.translate(30,-20-raise*.6);X.rotate(-pw*.3-(lunge?.06:0)+(rec?.1:0));
   // lower jaw (behind)
   X.save();X.translate(-2,-1);X.rotate(jaw);
   X.beginPath();X.moveTo(0,0);X.lineTo(52,1);X.quadraticCurveTo(60,4,56,9);X.lineTo(4,11);X.quadraticCurveTo(-4,8,0,0);X.closePath();X.fillStyle=G1;X.fill();X.lineWidth=2.6;X.strokeStyle=OUT;X.stroke();
   X.beginPath();X.moveTo(6,10);X.lineTo(54,9);X.lineTo(52,6);X.lineTo(8,6);X.closePath();X.fillStyle=BEL;X.fill();
   for(let i=0;i<7;i++){poly([[8+i*7,1],[10.5+i*7,-6],[13+i*7,1]],TEETH,OUT,1.4)}
   X.beginPath();X.ellipse(24,0,12,4,0,0,Math.PI);X.fillStyle=TONG;X.fill();   // tongue
   X.restore();
   // mouth interior
   X.beginPath();X.moveTo(-2,-1);X.lineTo(52,-1);X.lineTo(44+jaw*18,5+jaw*30);X.lineTo(2,3+jaw*8);X.closePath();X.fillStyle=MAW;X.fill();
   // upper jaw / skull
   X.beginPath();X.moveTo(-10,-2);X.bezierCurveTo(-14,-16,-4,-22,6,-22);X.bezierCurveTo(22,-22,40,-17,56,-12);X.quadraticCurveTo(63,-9,60,-3);X.lineTo(52,-1);X.lineTo(-2,-1);X.closePath();
   gr=X.createLinearGradient(0,-22,0,-1);gr.addColorStop(0,G2);gr.addColorStop(.5,G0);gr.addColorStop(1,G1);X.fillStyle=gr;X.fill();X.lineWidth=2.8;X.strokeStyle=OUT;X.stroke();
   for(let i=0;i<7;i++){poly([[6+i*7,-1],[8.5+i*7,5+(i%2)*2],[11+i*7,-1]],TEETH,OUT,1.4)}
   // snout details: nostril bump, brow ridge, scale lines
   X.fillStyle=G1;X.beginPath();X.ellipse(53,-12,4,3,-.2,0,7);X.fill();X.stroke();X.fillStyle="#000";X.beginPath();X.arc(55,-12.5,1.2,0,7);X.fill();
   X.strokeStyle=OUT;X.globalAlpha=.4;X.lineWidth=1.3;for(let i=0;i<5;i++){X.beginPath();X.moveTo(16+i*7,-17+i*.8);X.lineTo(18+i*7,-9+i*.6);X.stroke()}X.globalAlpha=1;
   poly([[-2,-20],[4,-27],[16,-24],[18,-18],[8,-18]],W("#2d5e2c"),OUT,2.2);   // raised brow ridge
   // glowing eye with a slit pupil
   X.shadowColor=GLOW;X.shadowBlur=flash?0:12;X.fillStyle=GLOW;X.beginPath();X.ellipse(9,-16,5,3.8,.1,0,7);X.fill();X.shadowBlur=0;
   X.fillStyle="#1a0a0c";X.beginPath();X.ellipse(9.5,-16,1.3,3.4,0,0,7);X.fill();
   X.restore();
   X.restore();
  }
 };

 // "ape": the Level 4 boss, a mean Stone Ape. It stalks you, then picks an attack:
 //   ROCKS  it hoists a boulder overhead (the warning), then hurls it in an arc at where you were standing. Under half health it throws two in a row.
 //   CHARGE it beats its chest and roars (red lane on the ground shows where it will run), then bolts in a straight line. Jump over it, or get out of the lane.
 //          If it slams into the arena wall it is dazed for a long moment: that is your best window to strike.
 // Under half health it is faster, winds up quicker and stalks closer. Contact hurts except while it is dazed or in the intro.
 let apeRocks=[];
 kinds.ape={
  reset(c){apeRocks.length=0;const b=c.boss;b.cyc=0;b.rn=0;b.cd=1;b.wt=.8},
  update(c,dt,dx,en){
   const b=c.boss,BS=c.BS,AR=c.AR,s=c.state,G=380,lo=AR.x+BS.w/2+6,hi=c.LEVEL_W-BS.w/2-6,cl=x=>Math.max(lo,Math.min(hi,x));
   const face=()=>{b.dir=dx>=0?1:-1};
   const dust=(x,n)=>{for(let i=0;i<n;i++)c.fx.push({k:"puff",x:x+(Math.random()-.5)*14,y:c.GROUND_Y-3,vx:(Math.random()-.5)*60,vy:-14-Math.random()*14,life:.4,max:.4,r:3,g:8})};
   // ---- thrown rocks: arc under gravity, hurt on touch, shatter on the ground ----
   for(const o of apeRocks){o.x+=o.vx*dt;o.y+=o.vy*dt;o.vy+=G*dt;o.a+=o.va*dt;
    if(c.vis.dying<=0&&s.hp>0&&s.hurt<=0&&Math.abs(s.x-o.x)<c.HW+o.r&&Math.abs(s.y-o.y)<c.R+o.r){o.dead=true;c.hurtPlayer(o.x,"Thrown Rock");if(s.hp<=0)c.startDefeat()}
    else if(o.y>c.GROUND_Y-o.r+2){o.dead=true;c.AUDIO.play("thump");dust(o.x,5);
     for(let i=0;i<6;i++){const a=-Math.PI*(.15+Math.random()*.7),v=70+Math.random()*90;c.fx.push({k:"hit",x:o.x,y:c.GROUND_Y-4,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.4,max:.4,c:i%2?"#8a8076":"#5a5048"})}}}
   apeRocks=apeRocks.filter(o=>!o.dead&&o.x>AR.x-60&&o.x<c.LEVEL_W+60);
   // ---- the ape ----
   if(b.st==="intro"){face();b.t-=dt;if(b.t<=0){b.st="walk";b.t=1;b.cyc=0}return}   // chest-beating during the intro
   if(b.st==="walk"){
    face();if(b.hurt<=0&&Math.abs(dx)>(en?90:115))b.x=cl(b.x+b.dir*(en?58:40)*dt);
    b.t-=dt;
    if(b.t<=0){b.cyc++;
     if(b.cyc%3===0||Math.abs(dx)<90){b.st="tele";b.wt=en?.6:.85;b.t=b.wt;c.AUDIO.play("croak")}   // every third move is a charge; stand right next to it and it charges too
     else{b.st="throw";b.wt=en?.5:.75;b.t=b.wt;b.rn=en?2:1}}
   }else if(b.st==="throw"){   // rock held overhead, tracking you
    face();b.t-=dt;
    if(b.t<=0){
     const rx=b.x+b.dir*34,ry=c.GROUND_Y-74,T=Math.max(.55,Math.min(1.05,Math.abs(s.x-rx)/260+.35));
     apeRocks.push({x:rx,y:ry,vx:(s.x-rx)/T,vy:(s.y-ry-.5*G*T*T)/T,a:0,va:(Math.random()<.5?-1:1)*9,r:10});
     c.AUDIO.play("thump");b.st="hurl";b.t=.28}
   }else if(b.st==="hurl"){   // follow-through
    b.t-=dt;
    if(b.t<=0){b.rn--;if(b.rn>0){b.st="throw";b.wt=.38;b.t=.38}else{b.st="walk";b.t=(en?.7:1.1)+Math.random()*.5}}
   }else if(b.st==="tele"){   // beats chest, roars; the red lane on the ground follows you until it goes
    face();b.t-=dt;
    if(Math.random()<dt*14)dust(b.x+b.dir*30,1);
    if(b.t<=0){b.st="charge";b.cd=b.dir;b.t=1.7;c.AUDIO.play("croak")}
   }else if(b.st==="charge"){   // a straight run in the direction it was facing
    b.dir=b.cd;const x0=b.x;b.x=cl(b.x+b.cd*(en?480:390)*dt);b.t-=dt;
    if(Math.random()<dt*50)dust(b.x-b.cd*BS.w/2,1);
    if(b.x===x0||b.x<=lo+.5||b.x>=hi-.5){   // slammed into the wall: dazed
     b.st="stun";b.t=en?1.5:2;c.AUDIO.play("defeat");c.vis.shake=Math.max(c.vis.shake,.5);
     c.fx.push({k:"ring",x:b.x+b.cd*BS.w/2,y:c.GROUND_Y-40,vx:0,vy:0,life:.4,max:.4,c:"#ffb04f",g:50});dust(b.x+b.cd*BS.w/2,8);
    }else if(b.t<=0){b.st="recover";b.t=.8;c.AUDIO.play("thump");dust(b.x,4)}   // ran out of room to run, winded
   }else if(b.st==="stun"||b.st==="recover"){
    b.t-=dt;if(b.t<=0){b.st="walk";b.t=(en?.6:.9)+Math.random()*.4}
   }
   const hot=b.st==="walk"||b.st==="charge"||b.st==="tele"||b.st==="throw"||b.st==="hurl";
   if(hot&&c.vis.dying<=0&&s.hp>0&&s.hurt<=0&&b.hurt<=0&&
      s.x+c.HW>b.x-BS.w/2+8&&s.x-c.HW<b.x+BS.w/2-8&&s.y+c.R>c.GROUND_Y-BS.h+10&&s.y-c.R<c.GROUND_Y){
    c.hurtPlayer(b.x,BS.short);if(s.hp<=0)c.startDefeat();
   }
  },
  draw(c){
   const b=c.boss,BS=c.BS,X=c.X,t=b.tt,st=b.st,dp=b.defeated?1-b.dead/BS.defeat:0,en=b.hp<=BS.hp/2,GY=c.GROUND_Y;
   const flash=b.hurt>.09||(b.defeated&&Math.sin(t*55)>0),rise=st==="intro"?Math.min(1,1-b.t/1.4):1;
   const pw=st==="throw"?1-b.t/b.wt:0,tele=st==="tele"||st==="intro",chg=st==="charge",stun=st==="stun",hurl=st==="hurl",hold=st==="throw";
   const moving=(st==="walk"&&b.hurt<=0)||chg,mad=en||tele||chg||hold||hurl;
   const W=(a)=>flash?"#ffffff":a;
   // palette: slate fur, mossy stone plates, amber runes (red when it is angry)
   const OUT="#0c0f10",F0=W(en?"#4a444a":"#464c56"),F1=W(en?"#2f2a30":"#2c3038"),F2=W(en?"#6a5e64":"#69727e"),
         S0=W("#8d9792"),S1=W("#5f6b67"),S2=W("#b9c4bd"),MOSS=W("#58a85f"),
         RUNE=flash?"#ffffff":(mad?"#ff5a3c":"#ffb04f"),SK=W("#2a2327");
   const pulse=.65+.35*Math.sin(t*(mad?9:4));
   const poly=(pts,fill,stroke,lw)=>{X.beginPath();pts.forEach((p,i)=>X[i?"lineTo":"moveTo"](p[0],p[1]));X.closePath();if(fill){X.fillStyle=fill;X.fill()}if(stroke){X.lineWidth=lw||2.4;X.strokeStyle=stroke;X.stroke()}};
   // a thick limb through three points, with a rim light
   const limb=(p,w,col,rim)=>{X.lineCap="round";X.lineJoin="round";X.beginPath();X.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)X.lineTo(p[i],p[i+1]);
    X.strokeStyle=OUT;X.lineWidth=w+5;X.stroke();X.strokeStyle=col;X.lineWidth=w;X.stroke();
    if(rim){X.save();X.translate(-w*.18,-w*.2);X.strokeStyle=rim;X.globalAlpha=.35;X.lineWidth=w*.28;X.stroke();X.restore()}};
   // two-bone arm: shoulder -> elbow -> target
   const ik=(sx,sy,tx,ty,L,bend)=>{const dx=tx-sx,dy=ty-sy,d=Math.min(Math.hypot(dx,dy),2*L-.5)||1,a=Math.atan2(dy,dx),A=Math.acos(Math.max(-1,Math.min(1,d/(2*L))));
    const ang=a+bend*A;return[sx,sy,sx+Math.cos(ang)*L,sy+Math.sin(ang)*L,sx+Math.cos(a)*d,sy+Math.sin(a)*d]};
   const rock=(r,a)=>{X.save();X.rotate(a);const pts=[];for(let i=0;i<8;i++){const an=i/8*6.283,rr=r*(.84+.2*((i*37)%5)/4);pts.push([Math.cos(an)*rr,Math.sin(an)*rr])}
    poly(pts,W("#857d74"),"#26211c",2.4);X.fillStyle="rgba(255,255,255,.2)";X.beginPath();X.arc(-r*.3,-r*.3,r*.28,0,7);X.fill();
    X.strokeStyle="#26211c";X.lineWidth=1.4;X.beginPath();X.moveTo(r*.1,-r*.5);X.lineTo(-r*.05,0);X.lineTo(r*.3,r*.45);X.stroke();X.restore()};
   const fist=(x,y,r,a)=>{X.save();X.translate(x,y);X.rotate(a||0);const pts=[];for(let i=0;i<7;i++){const an=i/7*6.283+.3,rr=r*(.86+.2*((i*53)%5)/4);pts.push([Math.cos(an)*rr,Math.sin(an)*rr])}
    poly(pts,S0,OUT,2.6);X.fillStyle=S2;X.globalAlpha=.4;X.beginPath();X.arc(-r*.3,-r*.35,r*.3,0,7);X.fill();X.globalAlpha=1;
    X.fillStyle=MOSS;X.beginPath();X.ellipse(r*.15,r*.55,r*.5,r*.2,0,0,7);X.fill();
    X.strokeStyle=RUNE;X.globalAlpha=.55+.4*pulse;X.lineWidth=1.8;X.beginPath();X.moveTo(-r*.2,-r*.1);X.lineTo(r*.1,r*.1);X.lineTo(r*.4,-r*.15);X.stroke();X.restore()};
   // ---- charge lane ----
   if(st==="tele"){const u=1-b.t/b.wt,lo=c.AR.x;
    X.save();X.globalAlpha=(.25+.3*Math.abs(Math.sin(t*(14+16*u))));X.fillStyle="#ff4d5e";
    const xa=b.dir>0?b.x+BS.w/2:lo,xb=b.dir>0?c.LEVEL_W:b.x-BS.w/2;X.fillRect(Math.min(xa,xb),GY-5,Math.abs(xb-xa),5);X.restore()}
   // ---- rocks in flight ----
   if(!b.defeated)for(const o of apeRocks){X.save();X.translate(o.x,o.y);rock(o.r,o.a);X.restore()}
   X.save();X.globalAlpha=.45*(1-dp);X.fillStyle="#000";X.beginPath();X.ellipse(b.x,GY,BS.w*.7,6,0,0,7);X.fill();X.restore();
   X.save();X.globalAlpha=Math.max(0,1-dp*dp);
   X.translate(b.x+(b.hurt>0?Math.sin(t*90)*2:0)+(st==="tele"?Math.sin(t*70)*1.2:0),GY);X.scale(b.dir*(1+.4*dp),(.6+.4*rise)*(1-.85*dp));
   if(tele||chg||en)c.glow(c.GLOW.rose,8,-50,84,(.16+.14*pulse)*(en?1.2:.8));
   // ---- legs ----
   const sw=moving?Math.sin(t*(chg?22:8)):0;
   for(const [lx,ph,col] of [[-12,Math.PI,F1],[12,0,F0]]){
    const o=moving?Math.sin(t*(chg?22:8)+ph)*(chg?9:5):0,lift=moving?Math.max(0,Math.cos(t*(chg?22:8)+ph))*(chg?4:2):0;
    limb([lx,-36,lx+o*.5,-18-lift,lx+o,-5-lift],17,col,F2);
    poly([[lx+o-9,-6-lift],[lx+o+15,-6-lift],[lx+o+17,-lift],[lx+o-9,-lift]],S1,OUT,2.4);   // stone boot
   }
   // ---- body, leaning from the hips ----
   const lean=chg?.5:stun?.4:hold?-.2*pw:hurl?.24:tele?-.2:.2;
   X.save();X.translate(0,-36);X.rotate(lean+(stun?Math.sin(t*6)*.04:0));
   const br=moving?0:Math.sin(t*3)*1.2;   // breathing
   const g=(wx,wy)=>{const cs=Math.cos(lean),sn=Math.sin(lean);return[wx*cs+wy*sn,-wx*sn+wy*cs]};   // a ground point, in lean space
   const SHN=[8,-58+br],SHF=[-8,-58+br];
   let nf,ff;   // fist targets, near and far arm
   if(tele){const p=Math.sin(t*27);nf=[26,-36+9*p];ff=[10,-34-9*p]}
   else if(chg){nf=g(38+sw*10,36);ff=g(24-sw*10,36)}
   else if(stun){nf=g(26,36);ff=g(10,36)}
   else if(hold){nf=[14,-122-4*pw];ff=g(8,36)}
   else if(hurl){nf=[76,-46];ff=g(8,36)}
   else{nf=g(28+sw*13,36);ff=g(8-sw*13,36)}
   // far arm
   const fa=ik(SHF[0],SHF[1],ff[0],ff[1],40,tele||hold?-1:1);limb(fa,17,F1,F2);fist(fa[4],fa[5],11,t);
   // torso: broad shoulders, tapering to the waist
   X.beginPath();X.moveTo(-18,0);X.bezierCurveTo(-40,-14,-44,-48,-22,-66+br);X.bezierCurveTo(-6,-76+br,22,-72+br,36,-52+br);X.bezierCurveTo(42,-30,28,-10,18,0);X.closePath();
   const gr=X.createLinearGradient(-30,-70,30,0);gr.addColorStop(0,F2);gr.addColorStop(.35,F0);gr.addColorStop(1,F1);X.fillStyle=gr;X.fill();X.lineWidth=3;X.strokeStyle=OUT;X.stroke();
   // belly fur
   X.fillStyle=W(en?"#7a6a70":"#78828e");X.globalAlpha=.55;X.beginPath();X.ellipse(12,-24,15,17,.1,0,7);X.fill();X.globalAlpha=1;
   // mane tufts along the back
   for(let i=0;i<5;i++){const x0=-34+i*7,y0=-48-Math.sin(i*.9)*10+br;poly([[x0-7,y0+6],[x0-12-i,y0-10],[x0+3,y0-2]],F1,OUT,2)}
   // stone chest plate with a glowing rune
   poly([[8,-62+br],[34,-50+br],[30,-24],[14,-14],[2,-34]],S0,OUT,2.8);poly([[8,-62+br],[34,-50+br],[28,-46+br],[10,-54+br]],S2,null);
   poly([[2,-34],[14,-14],[10,-24]],S1,null);
   X.strokeStyle=RUNE;X.lineWidth=2.6;X.shadowColor=RUNE;X.shadowBlur=flash?0:8*pulse;X.globalAlpha=.7+.3*pulse;
   X.beginPath();X.moveTo(20,-52);X.lineTo(14,-38);X.lineTo(24,-34);X.lineTo(18,-22);X.stroke();X.shadowBlur=0;X.globalAlpha=1;
   X.fillStyle=MOSS;X.beginPath();X.ellipse(24,-26,6,3,.4,0,7);X.fill();
   // shoulder boulder (near)
   X.save();X.translate(6,-62+br);poly([[-16,6],[-12,-8],[2,-14],[16,-8],[18,6],[4,12]],S0,OUT,2.8);poly([[-12,-8],[2,-14],[16,-8],[4,-6]],S2,null);
   X.fillStyle=MOSS;X.beginPath();X.ellipse(-2,-10,9,3,-.2,0,7);X.fill();
   X.strokeStyle=RUNE;X.lineWidth=2;X.globalAlpha=.6+.35*pulse;X.beginPath();X.moveTo(0,-4);X.lineTo(5,2);X.lineTo(10,-3);X.stroke();X.restore();
   // ---- head: low and forward, like a gorilla ----
   const hx=stun?32:tele?24:chg?36:26,hy=stun?-52:tele?-82:chg?-62:hold?-74:-70,tilt=stun?.35:tele?-.35:chg?.18:0;
   X.save();X.translate(hx,hy+br);X.rotate(tilt);
   X.beginPath();X.ellipse(-4,-4,17,15,0,0,7);X.fillStyle=F0;X.fill();X.lineWidth=2.8;X.strokeStyle=OUT;X.stroke();   // skull
   poly([[-10,-16],[-4,-26],[2,-16]],F1,OUT,2);poly([[-2,-17],[6,-24],[10,-14]],F1,OUT,2);   // crest tufts
   poly([[-16,-6],[-8,-12],[-12,0]],S0,OUT,2);   // small stone horn plate on the brow
   // face mask
   X.beginPath();X.moveTo(0,-6);X.bezierCurveTo(8,-10,22,-6,24,2);X.bezierCurveTo(26,10,18,16,8,15);X.bezierCurveTo(-2,14,-4,4,0,-6);X.closePath();X.fillStyle=SK;X.fill();X.lineWidth=2.4;X.strokeStyle=OUT;X.stroke();
   // heavy brow
   poly([[0,-8],[22,-6],[24,-1],[14,-2],[2,-1]],F1,OUT,2.2);
   // glowing eye
   X.fillStyle=mad?"#ff3d4a":"#ffd23f";X.shadowColor=X.fillStyle;X.shadowBlur=flash?0:10;
   if(stun){X.shadowBlur=0;X.strokeStyle="#fff1c9";X.lineWidth=2.2;X.beginPath();X.moveTo(11,0);X.lineTo(16,5);X.moveTo(16,0);X.lineTo(11,5);X.stroke()}
   else{X.beginPath();X.ellipse(14,2,3.4,2.6,.2,0,7);X.fill()}
   X.shadowBlur=0;
   // nostrils
   X.fillStyle="#000";X.beginPath();X.arc(20,6,1.1,0,7);X.arc(23,5,1.1,0,7);X.fill();
   // jaw and tusks
   const mouth=tele?1:(chg||hurl)?.6:hold?.35:stun?.15:.12;
   X.save();X.translate(4,12);X.rotate(mouth*.5);
   X.fillStyle="#150a0c";X.beginPath();X.ellipse(10,3,12,5+mouth*5,0,0,7);X.fill();X.strokeStyle=OUT;X.lineWidth=2.2;X.stroke();
   X.beginPath();X.moveTo(-2,3);X.quadraticCurveTo(10,15+mouth*4,24,3);X.lineTo(22,7);X.quadraticCurveTo(10,18+mouth*4,0,8);X.closePath();X.fillStyle=SK;X.fill();X.stroke();
   poly([[3,4],[6,-8-mouth*3],[9,4]],W("#f2ecd8"),OUT,1.8);poly([[15,4],[18,-7-mouth*3],[21,4]],W("#f2ecd8"),OUT,1.8);   // tusks
   X.restore();X.restore();
   // near arm
   const na=ik(SHN[0]+2,SHN[1]+4,nf[0],nf[1],40,tele||hold?-1:1);limb(na,19,F0,F2);
   if(hold){X.save();X.translate(na[4]+1,na[5]-19);rock(15+pw*3,t*3);X.restore()}
   fist(na[4],na[5]+(hold?5:0),12.5,-t);
   X.restore();
   // dizzy stars when dazed
   if(stun)for(let i=0;i<3;i++){const a=t*5+i*2.094;X.fillStyle="#ffe26a";X.beginPath();X.arc(30+Math.cos(a)*20,-104+Math.sin(a)*5,3,0,7);X.fill()}
   X.restore();
  }
 };

 return{ENABLED,SLOTS,ARENA_W,kinds,attach,addArena,apply};
})();
