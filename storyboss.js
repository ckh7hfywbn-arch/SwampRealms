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
  0:{on:true, name:"Level 1 Boss",short:"Level 1 Boss",kind:"stub",hp:6, w:60,h:64,defeat:1.6,arenaLen:520,bossTime:60,fragment:null,music:undefined},
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

 return{ENABLED,SLOTS,ARENA_W,kinds,attach,addArena,apply};
})();
