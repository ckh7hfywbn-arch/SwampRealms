/* SwampRealms endless progression.
 *
 * The four hand-built levels (Mossy Trail, Murky Marsh, Forgotten Jungle, Sunlit Canopy) stay exactly as they are in adventure.html.
 * Every level after them is GENERATED from the numbers in this file, so there is no limit and nothing to write by hand:
 *
 *   Progression.scale(i)      -> the difficulty + reward settings for level index i (0-based)
 *   Progression.build(i, ctx) -> a complete level object (same shape as the hand-built LEVELS entries)
 *
 * A level is always the same for the same index (seeded random), so best scores, checkpoints and replays stay consistent.
 * Pure data and maths: no DOM, no storage, no game state. Load it before the game script.
 *
 * TO TUNE THE GAME: edit the TUNING table just below. Nothing else needs to change.
 */
const Progression=(function(){
 "use strict";

 // ---------------------------------------------------------------- tuning
 // d = depth = how many levels past the last hand-made one (Level 4 is hand-made, so the first Endless level is d=1, the next d=2 ...). b = boss rank (Rootmaw = 0, Elder Rootmaw = 1 ...).
 const TUNING={
  handLevels:4,          // levels written by hand in adventure.html (Mossy Trail, Murky Marsh, Forgotten Jungle, Sunlit Canopy)
  bossEvery:3,           // a boss level every N levels: 3, 6, 9, 12 ...
  maxLevel:100000,       // sanity cap for saved data only

  // enemy health (hits to defeat). Level 1-3 values are the originals: Bramble Bug 2, Bog Crawler 3, Rootmaw 12.
  // Health grows with the square root of depth (and a bit slower than linear for bosses) so fights get longer but never become a grind.
  bugHp:    d=>2+Math.round(1.5*Math.sqrt(d)),
  crawlerHp:d=>3+Math.round(1.5*Math.sqrt(d)),
  bossHp:   b=>12+Math.round(7*Math.pow(b,.8)),

  // enemy behaviour multipliers (1 = the original). Capped so every fight stays dodgeable at any depth.
  speed:    d=>Math.min(1.8,1+.05*d),     // walk / hop / lunge speed
  aggro:    d=>Math.min(1.45,1+.035*d),     // how far away a Bog Crawler notices you
  recover:  d=>Math.max(.6,1-.02*d),    // shorter "winded" window after an attack (1 = original)
  bossSpeed:(d,b)=>Math.min(1.65,1+.035*d+.05*b),
  waveSpeed:d=>Math.min(1.3,1+.02*d),     // the Rootmaw's ground shockwave
  slamPlus: b=>Math.min(2,Math.floor(b/2)),// extra follow-up slams per attack

  // rewards. This multiplies every score value (spores, kills, clear bonus, speed bonus). Coins and crystals are paid from score,
  // so they grow with it. Not capped: deeper is always worth more.
  rewardMul:d=>1+.12*d,
  bossPts:  b=>1+.25*b,                    // extra multiplier on the boss kill itself
  fragBonus:d=>Math.min(.25,.01*d),       // added to every fragment drop chance

  // level shape
  gapCount: d=>Math.min(7,3+Math.floor(d/2)),
  gapMin:   190,
  gapMax:   d=>Math.min(430,255+9*d),
  moverOdds:d=>Math.min(.65,.1+.055*d),    // chance a stepping stone glides side to side
  thornOdds:d=>Math.min(.6,.22+.045*d),
  thornMax: d=>Math.min(84,60+3*d)
 };

 // ---------------------------------------------------------------- names and looks
 const VARIANTS=[   // enemy variants: one new look every 3 levels. Name prefix + glow colour.
  {adj:"Thornback",c:"#ff8a9a"},{adj:"Ember",c:"#ff9f4a"},{adj:"Frostbite",c:"#8fd8ff"},{adj:"Gloom",c:"#b48cff"},
  {adj:"Stormcall",c:"#ffe45f"},{adj:"Venom",c:"#9dff5a"},{adj:"Moonshade",c:"#d9e4ff"},{adj:"Voidtouched",c:"#ff5fd6"}
 ];
 const RANKS=["","Greater ","Elder ","Ancient ","Mythic "];   // after all 8 looks are used, the same looks come back one rank up
 const BOSSES=["The Rootmaw","Elder Rootmaw","Ancient Rootmaw","Primeval Rootmaw","Mythic Rootmaw","Eternal Rootmaw"];
 const L_ADJ=["Whispering","Sunken","Gloomwood","Mirrored","Hallowed","Ashen","Starlit","Tangled","Drowned","Verdant","Crimson","Frostbound","Thunder","Silent","Ember","Moonlit"];
 const L_NOUN=["Fen","Hollow","Mire","Canopy","Bayou","Thicket","Lagoon","Wilds","Basin","Grove","Reach","Delta"];
 const HUE_SHIFTS=[-35,35,70,-70,150,210,290,-120];   // palette rotation applied to the three base themes (curated, all stay dark and readable)

 // ---------------------------------------------------------------- helpers
 const HAND=TUNING.handLevels;
 const depth=i=>Math.max(0,i-(HAND-1));                                  // Level 3 and below = 0
 const isBoss=i=>i>=2&&(i+1)%TUNING.bossEvery===0;   // boss levels stay at Level 3, 6, 9 ... (index 2, 5, 8 ...) whatever the number of hand-made levels
 const bossRank=i=>isBoss(i)?(i+1)/TUNING.bossEvery-1:0;
 function roman(n){const m=[[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]];if(n<1||n>3999)return String(n);let s="";for(const[v,t]of m)while(n>=v){s+=t;n-=v}return s}
 // The Mirewing: the second kind of boss (a flying mire-moth). Boss ranks 1, 3, 5 ... are Mirewings; ranks 0, 2, 4 ... are Rootmaws.
 const WINGS=["The Mirewing","Elder Mirewing","Ancient Mirewing","Primeval Mirewing","Mythic Mirewing","Eternal Mirewing"];
 function wingName(n){return n<WINGS.length?WINGS[n]:WINGS[WINGS.length-1]+" "+roman(n-WINGS.length+2)}
 function bossName(b){return b<BOSSES.length?BOSSES[b]:BOSSES[BOSSES.length-1]+" "+roman(b-BOSSES.length+2)}
 // enemy variant for a depth: rank 0 = the original look and name
 function variant(d,base){
  const r=Math.floor((d+2)/3);if(r<1)return{name:base,aura:null,rank:0};
  const k=r-1,v=VARIANTS[k%VARIANTS.length],rk=RANKS[Math.min(RANKS.length-1,Math.floor(k/VARIANTS.length))];
  return{name:rk+v.adj+" "+base,aura:v.c,rank:r};
 }
 function rng(i){let a=(0x9e3779b9^Math.imul(i+1,0x85ebca6b))>>>0;return function(){a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296}}

 // everything the game needs to know about how hard / how rewarding level i is
 function scale(i){
  const d=depth(i),b=bossRank(i),boss=isBoss(i),T=TUNING;
  const bv=variant(d,"Bug"),cv=variant(d,"Crawler");
  const bn=b===0?{name:"The Rootmaw",aura:null}:b%2===1?{name:wingName((b-1)/2),aura:VARIANTS[(b-1)%VARIANTS.length].c,kind:"wing"}:{name:bossName(b),aura:VARIANTS[(b-1)%VARIANTS.length].c};
  return{
   depth:d,isBoss:boss,bossRank:b,
   bugHp:T.bugHp(d),crawlerHp:T.crawlerHp(d),bossHp:T.bossHp(b),
   speed:T.speed(d),aggro:T.aggro(d),recover:T.recover(d),bossSpeed:T.bossSpeed(d,b),waveSpeed:T.waveSpeed(d),slamPlus:T.slamPlus(b),
   rewardMul:T.rewardMul(d),bossPts:T.bossPts(b),fragBonus:T.fragBonus(d),
   bug:{name:d?bv.name:"Bramble Bug",aura:bv.aura},
   crawler:{name:d?cv.name:"Bog Crawler",aura:cv.aura},
   boss:{name:bn.name,short:bn.name.replace(/^The /,""),aura:bn.aura,kind:bn.kind||"root"}
  };
 }

 // ---------------------------------------------------------------- theme palette rotation
 function rot(r,g,b,deg){
  r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;let h=0,s=0;
  if(mx!==mn){const dd=mx-mn;s=l>.5?dd/(2-mx-mn):dd/(mx+mn);h=mx===r?(g-b)/dd+(g<b?6:0):mx===g?(b-r)/dd+2:(r-g)/dd+4;h*=60}
  h=((h+deg)%360+360)%360;
  const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q,f=t=>{t=(t+360)%360/360;return t<1/6?p+(q-p)*6*t:t<.5?q:t<2/3?p+(q-p)*(2/3-t)*6:p};
  const o=s===0?[l,l,l]:[f(h+120),f(h),f(h-120)];
  return o.map(v=>Math.max(0,Math.min(255,Math.round(v*255))));
 }
 const hex2=n=>(n<16?"0":"")+n.toString(16);
 function shiftStr(s,deg){
  if(/^\d+,\d+,\d+$/.test(s)){const p=s.split(",").map(Number);return rot(p[0],p[1],p[2],deg).join(",")}
  return s
   .replace(/#([0-9a-f]{6})([0-9a-f]{2})?/gi,(m,c,a)=>{const o=rot(parseInt(c.slice(0,2),16),parseInt(c.slice(2,4),16),parseInt(c.slice(4,6),16),deg);return"#"+o.map(hex2).join("")+(a||"")})
   .replace(/(rgba?\()\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g,(m,pre,r,g,b)=>pre+rot(+r,+g,+b,deg).join(","));
 }
 // returns a copy of a theme object with every colour rotated by deg degrees of hue (flags and numbers are copied as they are)
 function shiftTheme(t,deg){
  if(!deg)return t;const o={};
  for(const k in t){const v=t[k];o[k]=typeof v==="string"?shiftStr(v,deg):Array.isArray(v)?v.map(x=>typeof x==="string"?shiftStr(x,deg):x):v}
  return o;
 }

 // ---------------------------------------------------------------- the level generator
 // ctx = {gr,pf,bx,mp (the game's own piece builders), themes:[base themes], START_X, GROUND_Y}
 // Every piece is placed inside the reach of the player's jump (a stepping stone is never more than ~66px from the next one and never
 // more than 34px higher), thorns and obstacles keep a landing margin from every gap edge, and enemy patches are kept clear of obstacles.
 function build(i,ctx){
  const r=rng(i),S=scale(i),d=S.depth,boss=S.isBoss,T=TUNING,GY=ctx.GROUND_Y,START=ctx.START_X;
  const R=(a,b)=>a+Math.floor(r()*(b-a+1)),chance=p=>r()<p,pick=a=>a[Math.floor(r()*a.length)];
  const grounds=[],platforms=[],solids=[],hazards=[],spores=[],gaps=[],cps=[START],segs=[];
  const nGaps=T.gapCount(d),gapMax=T.gapMax(d),PW=44,MAXS=66;
  let x=0;

  // 1) ground islands joined by stepping-stone crossings
  for(let k=0;k<=nGaps;k++){
   const last=k===nGaps,w=k===0?560:last?(boss?930:560):R(440,660);
   grounds.push(ctx.gr(x,w));segs.push({x0:x,x1:x+w,k:k});
   if(k>0)cps.push(x+15);
   x+=w;
   if(last)break;
   const gw=R(T.gapMin,Math.max(T.gapMin,gapMax)),g0=x,g1=x+gw;
   gaps.push([g0,g1]);
   const n=Math.max(1,Math.ceil((gw-MAXS)/(PW+MAXS))),s=(gw-n*PW)/(n+1);   // n stones, s = even space between stones (always <= 66)
   let y=GY-34;
   for(let j=0;j<n;j++){
    const px=Math.round(g0+s*(j+1)+PW*j);
    if(j>0)y=Math.max(GY-82,Math.min(GY-34,y+pick([-24,0,0,24])));   // random walk, never rising more than 24 between stones
    const mover=n>=3&&j>0&&j<n-1&&s<=56&&chance(T.moverOdds(d));
    const p=mover?ctx.mp(px,y,PW+8,18,R(13,19)/10,R(0,6)):ctx.pf(px,y,PW);
    platforms.push(p);
    spores.push([px+Math.round(p.w/2),y-(mover?44:34)]);
   }
   x=g1;
  }
  const W=x,lastSeg=segs[segs.length-1];

  // 2) enemies: a Bramble-type bug on one middle island, a Bog-Crawler-type on another
  const mids=segs.filter(s=>s.k>=1&&s.k<nGaps),bugSeg=mids.splice(R(0,mids.length-1),1)[0],crSeg=mids.splice(R(0,mids.length-1),1)[0]||bugSeg;
  const bug=[bugSeg.x0+110,bugSeg.x1-110,0];bug[2]=Math.round((bug[0]+bug[1])/2);
  const cx=Math.round((crSeg.x0+crSeg.x1)/2)+R(-50,50),crawler={min:cx-36,max:cx+36,x:cx};

  // 3) fill each island: crates, stumps, stair-steps and thorn patches with room to land between them, plus Glowspores over every one
  function fill(s,from,to,clear){
   if(clear){for(let sx=from;sx<=to;sx+=95)spores.push([sx,R(0,1)?344:380]);return}
   let cur=from;
   while(cur<to-70){
    const roll=r(),thorn=roll<T.thornOdds(d)*.9;
    if(thorn){const w=R(44,T.thornMax(d));if(cur+w>to)break;hazards.push({x:cur,y:GY,w});const c=cur+w/2;spores.push([c-w/2-4,346],[c,312],[c+w/2+4,346]);cur+=w+R(120,190);continue}
    const kind=roll<.5?"crate":(roll<.78||d<2)?"stump":"stairs";
    let w=40;
    if(kind==="crate"){solids.push(ctx.bx(cur,GY-40,40,40));spores.push([cur+20,GY-82])}
    else if(kind==="stump"){w=44;solids.push(ctx.bx(cur,GY-60,44,60));spores.push([cur+22,GY-104])}
    else{w=90;if(cur+w>to)break;solids.push(ctx.bx(cur,GY-60,40,60),ctx.bx(cur+50,GY-100,40,100));spores.push([cur+20,GY-102],[cur+70,GY-142])}
    if(cur+w>to)break;
    const sp=R(120,190);spores.push([cur+w+Math.round(sp/2),GY-30]);cur+=w+sp;
   }
  }
  for(const s of segs){
   if(s===lastSeg)continue;
   const isEnemy=s===bugSeg||s===crSeg,from=s.x0+(s.k===0?250:110),to=s.x1-110;
   fill(s,from,to,isEnemy);
  }
  // the final island: the goal gate, or the boss arena (thorns and spores on the approach, then a clear fighting floor)
  const gx=lastSeg.x0;let arena=null,goalX=99999;
  if(boss){arena={x:gx+490,bx:gx+790};cps.push(gx+450);fill(lastSeg,gx+110,gx+400,false);spores.push([gx+330,GY-60],[gx+560,GY-30],[gx+700,GY-30])}
  else{goalX=lastSeg.x1-130;fill(lastSeg,gx+110,lastSeg.x1-210,false)}

  // 4) names, palette, timing
  const nm=boss?S.boss.name+"'s Domain":"The "+pick(L_ADJ)+" "+pick(L_NOUN);
  const hue=d>0?HUE_SHIFTS[(d-1)%HUE_SHIFTS.length]:0;
  const theme=shiftTheme(ctx.themes[i%ctx.themes.length],hue);
  return{
   name:nm,banner:true,W:W,boss:boss,gen:true,
   grounds,platforms,solids,hazards,cps,spores,bug,crawler,arena,goalX,gaps,theme,scale:S,
   sub:boss?"Boss: "+S.boss.name:"Danger "+d,
   timeLimit:Math.round((30+W/24+(boss?60:0))/10)*10,
   music:i%3
  };
 }

 return{TUNING,HAND,maxLevel:TUNING.maxLevel,depth,isBoss,bossRank,scale,build,shiftTheme,variant,bossName,
  isGenerated:i=>i>=HAND,
  label:i=>i<HAND?"":(isBoss(i)?"Boss · ":"")+"Danger "+depth(i)};
})();
