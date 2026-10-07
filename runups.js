/* SwampRealms run upgrades (Endless Realms).
 *
 * After every Endless level the player picks 1 of 2 random upgrades. They last for the current run only: they are
 * cleared when the run ends (Game Over, Quit to title, or starting a level from the title / Level Select / Replay).
 * Pure data + maths, no DOM. Load before the game script in adventure.html.
 *
 *   RunUps.offer()   -> two different upgrades that are not maxed out yet
 *   RunUps.take(id)  -> adds one stack of that upgrade
 *   RunUps.reset()   -> clears everything (run over)
 *   RunUps.dmg() / .cd() / .reach() / .move() / .hp()  -> multipliers / bonuses the game reads
 *
 * TO ADD AN UPGRADE: add one line to POOL (id, name, text, per-pick amount, max picks) and, if it is a new kind of
 * stat, read it in the game. Existing stats (dmg, cd, reach, move, hp) need nothing else.
 */
const RunUps=(function(){
 "use strict";
 // stat: which number it changes. per: amount per pick. max: how many times it can be picked in one run.
 const POOL=[
  {id:"dmg",  name:"Sharpened Edge", text:"+5% damage",         stat:"dmg",  per:.05, max:20, icon:"\u2694"},
  {id:"spd",  name:"Quick Hands",    text:"+8% attack speed",   stat:"cd",   per:.08, max:6,  icon:"\u26A1"},
  {id:"hp",   name:"Hardy Hide",     text:"+1 max health",      stat:"hp",   per:1,   max:4,  icon:"\u2764"},
  {id:"move", name:"Swift Roots",    text:"+6% move speed",     stat:"move", per:.06, max:6,  icon:"\u27A4"},
  {id:"reach",name:"Long Reach",     text:"+10% weapon reach",  stat:"reach",per:.10, max:5,  icon:"\u2194"}
 ];
 let picks={};   // id -> times taken this run
 const byId=id=>POOL.find(u=>u.id===id);
 const n=stat=>POOL.reduce((s,u)=>u.stat===stat?s+(picks[u.id]||0)*u.per:s,0);
 function offer(){
  const open=POOL.filter(u=>(picks[u.id]||0)<u.max),a=open.slice();
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a.slice(0,2);
 }
 return{
  POOL,offer,
  take(id){const u=byId(id);if(u&&(picks[id]||0)<u.max)picks[id]=(picks[id]||0)+1;return u},
  reset(){picks={}},
  count:id=>picks[id]||0,
  total:()=>Object.keys(picks).reduce((s,k)=>s+picks[k],0),
  dmg:()=>1+n("dmg"),                          // damage multiplier
  cd:()=>1/(1+n("cd")),                        // swing cooldown multiplier (smaller = faster)
  reach:()=>1+n("reach"),                      // reach multiplier
  move:()=>1+n("move"),                        // run speed multiplier
  hp:()=>Math.round(n("hp")),                  // extra max health
  summary(){return POOL.filter(u=>picks[u.id]).map(u=>{const t=picks[u.id]*u.per;return{id:u.id,icon:u.icon,name:u.name,val:"+"+(u.stat==="hp"?Math.round(t):Math.round(t*100)+"%")}})}   // for the HUD
 };
})();
