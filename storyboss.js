/* StoryBoss: the setup for an end-of-level boss in the main story (Levels 1-4). Load after progression.js, before the game script.
 *
 * What this file gives you (no real bosses yet, only the slots and a placeholder so every slot can be tested):
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
  0:{on:true, name:"The Bog Gator",short:"Bog Gator",kind:"gator",hp:6, w:96,h:38,defeat:1.6,arenaLen:520,bossTime:60,fragment:null,music:undefined},
  1:{on:true, name:"The Mirewing",short:"Mirewing",kind:"wing",hp:9, w:64,h:46,defeat:2.2,arenaLen:520,bossTime:60,fragment:null,music:undefined},
  3:{on:true, name:"Level 4 Boss",short:"Level 4 Boss",kind:"stub",hp:12,w:64,h:70,defeat:1.8,arenaLen:520,bossTime:60,fragment:null,music:undefined}
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
   const pw=st==="wind"?1-b.t/b.wt:0,hot=st==="wind"||st==="lunge";
   const jaw=st==="wind"?.25+.6*pw:st==="lunge"?.2:st==="recover"?.12:.1+.08*Math.sin(t*4);
   const crawl=st==="walk"&&b.hurt<=0?Math.sin(t*9):0;
   const g1=flash?"#f4ffe8":"#3f7d3a",g2=flash?"#ffffff":"#2c5c2b",bel=flash?"#ffffff":"#b9c97a",dk="#16301a";
   X.save();X.globalAlpha=.45*(1-dp);X.fillStyle="#000";X.beginPath();X.ellipse(b.x,c.GROUND_Y,BS.w*.55,5,0,0,7);X.fill();X.restore();
   X.save();X.globalAlpha=Math.max(0,1-dp*dp);
   X.translate(b.x+(b.hurt>0?Math.sin(t*90)*2:0)+(st==="wind"?Math.sin(t*70)*1.2*pw:0),c.GROUND_Y);X.scale(b.dir*(1+.4*dp),(.55+.45*rise)*(1-.85*dp));
   X.lineJoin="round";X.lineWidth=2.5;X.strokeStyle=dk;
   if(hot)c.glow(c.GLOW.rose,10,-18,64,.28+.2*pw);
   // legs (four little stumps that paddle while it crawls)
   X.fillStyle=g2;for(const lx of[-30,-10,14,32]){const o=Math.sin(t*9+lx)*3*(crawl?1:0);X.beginPath();X.rect(lx-5+o,-9,10,10);X.fill();X.stroke()}
   // tail, swaying
   const sw=Math.sin(t*3)*4+(st==="lunge"?-6:0);
   X.fillStyle=g1;X.beginPath();X.moveTo(-34,-30);X.quadraticCurveTo(-58,-30+sw,-86,-14+sw*1.6);X.quadraticCurveTo(-58,-10+sw,-34,-8);X.closePath();X.fill();X.stroke();
   // body
   X.fillStyle=g1;X.beginPath();X.ellipse(-2,-19,40,15,0,0,7);X.fill();X.stroke();
   X.fillStyle=bel;X.beginPath();X.ellipse(0,-11,32,5,0,0,7);X.fill();
   // back ridges
   X.fillStyle=g2;for(let i=-3;i<=3;i++){X.beginPath();X.moveTo(i*10-5,-32);X.lineTo(i*10,-39);X.lineTo(i*10+5,-32);X.closePath();X.fill();X.stroke()}
   // head: upper jaw, lower jaw (hinged at the back of the head, opens with `jaw`), teeth, eye
   X.save();X.translate(28,-14);
   X.save();X.rotate(jaw);X.fillStyle=g2;X.beginPath();X.moveTo(0,0);X.lineTo(30,-1);X.lineTo(31,7);X.lineTo(0,9);X.closePath();X.fill();X.stroke();
   X.fillStyle="#fff";for(let i=0;i<4;i++){X.beginPath();X.moveTo(8+i*6,0);X.lineTo(10+i*6,-5);X.lineTo(12+i*6,0);X.fill()}X.restore();
   X.fillStyle=g1;X.beginPath();X.moveTo(-6,-10);X.lineTo(32,-14);X.lineTo(33,-4);X.lineTo(-6,0);X.closePath();X.fill();X.stroke();
   X.fillStyle="#fff";for(let i=0;i<4;i++){X.beginPath();X.moveTo(8+i*6,-4);X.lineTo(10+i*6,1);X.lineTo(12+i*6,-4);X.fill()}
   X.fillStyle=hot?"#ff5a6e":en?"#ffb04f":"#ffe26a";X.beginPath();X.arc(4,-12,4,0,7);X.fill();X.stroke();
   X.fillStyle=dk;X.fillRect(3,-14,2,5);
   X.restore();X.restore();
  }
 };

 return{ENABLED,SLOTS,ARENA_W,kinds,attach,addArena,apply};
})();
