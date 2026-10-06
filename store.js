// ===== SwampRealms: Swamp Crystals + avatar wallet =====
// Load AFTER cards.js on every page:  <script src="cards.js"></script><script src="store.js"></script>
// Crystals are earned from games (unlimited rounds) and spent on cosmetics for your avatar animal.
// Saved separately from coins, so cards.js is never touched.

// ---- CRYSTAL RULES: edit these ----
const CRY={
 // per game: points needed for 1 crystal, and the most crystals one round can pay
 // adv = the Swamp Adventure: 1 crystal per 50 score, no cap, so every run pays and there is no daily limit
 games:{adv:{per:50,cap:Infinity},_:{per:4,cap:25}},
 minRound:2,          // every finished round pays at least this many (so a bad round still helps)
 firstOfDay:15        // bonus for your first round each day
};
const ANIMALS=[
 {id:"frog",name:"Boggy the Frog"},
 {id:"donkey",name:"DonK the Donkey"},
 {id:"owl",name:"Ollie the Owl"},
 {id:"monkey",name:"MonK the Monkey"},
 {id:"elephant",name:"Ellie the Elephant"}
];
// cat: hat | face | neck | shirt | bg   (avatar.js draws each id)
const COSMETICS=[
 {id:"beanie",cat:"hat",name:"Street Beanie",price:40},
 {id:"party",cat:"hat",name:"Neon Cone",price:60},
 {id:"cowboy",cat:"hat",name:"Outlaw Hat",price:90},
 {id:"wizard",cat:"hat",name:"Arcane Hat",price:150},
 {id:"halo",cat:"hat",name:"Divine Halo",price:250},
 {id:"crown",cat:"hat",name:"Swamp King Crown",price:400},
 {id:"eyepatch",cat:"face",name:"Raider Patch",price:50},
 {id:"shades",cat:"face",name:"Cyber Visor",price:60},
 {id:"hearts",cat:"face",name:"Love Lenses",price:70},
 {id:"monocle",cat:"face",name:"Gold Monocle",price:80},
 {id:"laser",cat:"face",name:"Laser Eyes",price:220},
 {id:"bell",cat:"neck",name:"Gold Bell",price:30},
 {id:"bowtie",cat:"neck",name:"Neon Bow Tie",price:40},
 {id:"scarf",cat:"neck",name:"Crimson Scarf",price:70},
 {id:"cape",cat:"neck",name:"Hero Cape",price:150},
 {id:"chain",cat:"neck",name:"Crystal Chain",price:200},
 {id:"tee",cat:"shirt",name:"Swamp Tee",price:40},
 {id:"hoodie",cat:"shirt",name:"Neon Hoodie",price:70},
 {id:"jersey",cat:"shirt",name:"Herd Jersey",price:100},
 {id:"tux",cat:"shirt",name:"Boss Tux",price:150},
 {id:"armor",cat:"shirt",name:"Crystal Armor",price:250},
 {id:"robe",cat:"shirt",name:"Royal Robe",price:350},
 {id:"pond",cat:"bg",name:"Lotus Pond",price:50},
 {id:"sunset",cat:"bg",name:"Dusk Marsh",price:80},
 {id:"night",cat:"bg",name:"Firefly Night",price:120},
 {id:"dust",cat:"bg",name:"Treasure Vault",price:200},
 {id:"rainbow",cat:"bg",name:"Aurora Mist",price:300},
 {id:"moon",cat:"bg",name:"Blood Moon",price:350}
];
const CATS={hat:"Hats",face:"Faces",neck:"Neck",shirt:"Shirts",bg:"Backgrounds"};
const tierOf=p=>p>=350?"Mythical":p>=220?"Legendary":p>=150?"Epic":p>=80?"Rare":p>=50?"Uncommon":"Common";

// ---- saved data ----
const CK="swamp-crystals-v1";
let CS={c:0,earned:0,animal:"frog",own:{},eq:{hat:"",face:"",neck:"",shirt:"",bg:""},day:"",rounds:0,best:{},frags:{},gear:{}};
function cload(){try{CS=Object.assign(CS,JSON.parse(localStorage.getItem(CK)||"{}"))}catch(e){}CS.eq=Object.assign({hat:"",face:"",neck:"",shirt:"",bg:""},CS.eq);CS.own=CS.own||{};CS.best=CS.best||{};if(!CS.frags||typeof CS.frags!=="object"||Array.isArray(CS.frags))CS.frags={};for(const k in CS.frags){const v=CS.frags[k];if(!(Number.isFinite(v)&&v>0))delete CS.frags[k];else CS.frags[k]=Math.floor(v)}
 if(!CS.gear||typeof CS.gear!=="object"||Array.isArray(CS.gear))CS.gear={};for(const k in CS.gear){const v=CS.gear[k];if(!(Number.isFinite(v)&&v>0))delete CS.gear[k];else CS.gear[k]=Math.floor(v)}}
function csave(){try{localStorage.setItem(CK,JSON.stringify(CS))}catch(e){}paintGems();paintAv();try{paintBag()}catch(e){}}
cload();

const Crystals={
 get balance(){return CS.c},
 get state(){return CS},
 items:COSMETICS,
 cats:CATS,
 animals:ANIMALS,
 tier:tierOf,
 item:id=>COSMETICS.find(x=>x.id===id),
 owns:id=>!!CS.own[id],
 reload:cload,
 // how many crystals a finished round pays. game = "fly" | "match" | ...; score = the round's points
 forScore(game,score){const g=CRY.games[game]||CRY.games._;return Math.max(CRY.minRound,Math.min(g.cap,Math.floor((score||0)/g.per)))},
 // call once when a round ends. Returns {gained, bonus, total, record}
 award(game,score){
  cload();
  const t=new Date().toLocaleDateString("en-CA");
  if(CS.day!==t){CS.day=t;CS.rounds=0}
  let gained=this.forScore(game,score),bonus=0;
  if(CS.rounds===0)bonus=CRY.firstOfDay;
  CS.rounds++;
  const record=(score||0)>(CS.best[game]||0);if(record)CS.best[game]=score;
  CS.c+=gained+bonus;CS.earned+=gained+bonus;csave();
  try{SFX.coin()}catch(e){}
  return{gained,bonus,total:gained+bonus,record};
 },
 buy(id){
  cload();const it=this.item(id);
  if(!it)return{ok:false,why:"Unknown item"};
  if(CS.own[id])return{ok:false,why:"You already own this"};
  if(CS.c<it.price)return{ok:false,why:"Need "+(it.price-CS.c)+" more crystals"};
  CS.c-=it.price;CS.own[id]=1;CS.eq[it.cat]=id;csave();
  try{SFX.streak()}catch(e){}
  return{ok:true};
 },
 equip(id){cload();const it=this.item(id);if(!it||!CS.own[id])return false;CS.eq[it.cat]=CS.eq[it.cat]===id?"":id;csave();return true},
 clear(cat){cload();CS.eq[cat]="";csave()},
 setAnimal(a){cload();if(ANIMALS.some(x=>x.id===a)){CS.animal=a;csave()}},
 outfit(){return{animal:CS.animal,hat:CS.eq.hat,face:CS.eq.face,neck:CS.eq.neck,shirt:CS.eq.shirt,bg:CS.eq.bg}}
};

// ---- Fragments: enemy loot. Saved INSIDE the crystals save (CS.frags = {fragmentId: count}), so they persist in the browser and sync with accounts like everything else.
// To give a new enemy a drop, add a line here and use the same id for the enemy (the adventure calls Fragments.roll(enemyId) when it is defeated).
const FRAG_RARITY={common:{name:"Common",color:"#9fe8c8"},uncommon:{name:"Uncommon",color:"#7fd0ff"},rare:{name:"Rare",color:"#ffd27a"}};
const FRAGMENTS={
 bug:{name:"Bramble Fragment",enemy:"Bramble Bug",chance:.35,rarity:"common"},
 crawler:{name:"Bog Fragment",enemy:"Bog Crawler",chance:.5,rarity:"uncommon"},
 boss:{name:"Rootmaw Fragment",enemy:"Rootmaw",chance:.3,rarity:"rare"},
 // ready for enemies that are not in the game yet
 frog:{name:"Frog Fragment",enemy:"Frog",chance:.4,rarity:"common"},
 crocodile:{name:"Crocodile Fragment",enemy:"Crocodile",chance:.4,rarity:"uncommon"},
 slime:{name:"Slime Fragment",enemy:"Slime",chance:.4,rarity:"common"}
};
const Fragments={
 defs:FRAGMENTS,
 rarity:FRAG_RARITY,
 count:id=>CS.frags[id]||0,
 get all(){return CS.frags},
 get total(){let n=0;for(const k in CS.frags)n+=CS.frags[k];return n},
 // the fragment record for the notification: {id,name,enemy,rarity,rarityName,color,count}
 info(id){const d=FRAGMENTS[id];if(!d)return null;const r=FRAG_RARITY[d.rarity]||FRAG_RARITY.common;return{id,name:d.name,enemy:d.enemy,rarity:d.rarity,rarityName:r.name,color:r.color,count:CS.frags[id]||0}},
 // put n fragments in the saved inventory. Returns the record, or null for an unknown id
 add(id,n){
  if(!FRAGMENTS[id])return null;
  cload();n=Math.max(1,Math.floor(n)||1);
  CS.frags[id]=(CS.frags[id]||0)+n;csave();
  return this.info(id);
 },
 // called when an enemy is defeated: rolls its drop chance; on a drop it is saved straight away. Returns the record, or null for no drop
 roll(enemyId){
  const d=FRAGMENTS[enemyId];
  if(!d||Math.random()>=d.chance)return null;
  return this.add(enemyId,1);
 }
};

// ---- Gear: weapons, armor and more, stored in the Bag. Saved INSIDE the crystals save (CS.gear = {gearId: count}), so it persists and syncs with accounts.
// To add gear later: add a line to GEAR (slot = weapons | armor | accessories), then call Gear.add("id") when the player earns or buys it.
// To add a whole new section (e.g. "pets"), add it to GEAR_SLOTS. The Bag builds its tabs from these two tables.
const GEAR_SLOTS={
 weapons:{name:"Weapons",icon:'<path d="M14.5 4.5L20 4l-.5 5.5L9 20l-5-5z"/><path d="M13 7l4 4M5 19l-2 2"/>',empty:"No weapons yet. Swords and blasters are coming soon."},
 armor:{name:"Armor",icon:'<path d="M12 3l8 3v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6z"/>',empty:"No armor yet. Shields and plating are coming soon."},
 accessories:{name:"Accessories",icon:'<circle cx="12" cy="14" r="5"/><path d="M9 4h6l-1 5h-4z"/>',empty:"No accessories yet. Charms and trinkets are coming soon."}
};
// id:{name,slot,rarity:common|uncommon|rare, desc}   (empty for now, gear is on the way)
const GEAR={
 // example:  oakclub:{name:"Oak Club",slot:"weapons",rarity:"common",desc:"A knobbly swamp club."},
};
const Gear={
 defs:GEAR,slots:GEAR_SLOTS,
 count:id=>CS.gear[id]||0,
 get all(){return CS.gear},
 get total(){let n=0;for(const k in CS.gear)n+=CS.gear[k];return n},
 info(id){const d=GEAR[id];if(!d)return null;const r=FRAG_RARITY[d.rarity]||FRAG_RARITY.common;return{id,name:d.name,slot:d.slot,desc:d.desc||"",rarity:d.rarity||"common",rarityName:r.name,color:r.color,count:CS.gear[id]||0}},
 // owned items of one slot, as info records
 list(slot){const out=[];for(const id in CS.gear){const d=GEAR[id];if(d&&d.slot===slot)out.push(this.info(id))}return out},
 add(id,n){if(!GEAR[id])return null;cload();n=Math.max(1,Math.floor(n)||1);CS.gear[id]=(CS.gear[id]||0)+n;csave();return this.info(id)}
};

// ---- The Bag: one place for coins, crystals, fragments and gear. Open it from anywhere with Bag.open(), or give any element data-bag.
// Put <span data-bag-count></span> inside a button to show how many items the player is carrying.
const Bag={
 get count(){return Fragments.total+Gear.total},
 open(tab){bagOpen(tab)},close(){bagClose()},toggle(){bagEl&&!bagEl.hidden?bagClose():bagOpen()}
};
let bagEl=null,bagTab="fragments",bagFrom=null;
const BAG_TABS=()=>[{id:"fragments",name:"Fragments",icon:'<path d="M12 3l7 6-3 12H8L5 9z"/>',n:Fragments.total}].concat(Object.keys(GEAR_SLOTS).map(k=>({id:k,name:GEAR_SLOTS[k].name,icon:GEAR_SLOTS[k].icon,n:Gear.list(k).reduce((a,g)=>a+g.count,0)})));
function bagCoins(){try{if(typeof load==="function")load();return typeof meta!=="undefined"?(meta.coins||0):0}catch(e){return 0}}
function bagSlot(info,kind){
 const d=document.createElement("div");d.className="bgs";d.style.setProperty("--c",info.color);d.tabIndex=0;
 d.title=info.name+" · "+info.rarityName+(kind==="frag"?" · dropped by the "+info.enemy:info.desc?" · "+info.desc:"");
 const i=document.createElement("i");i.setAttribute("aria-hidden","true");d.appendChild(i);
 const nm=document.createElement("b");nm.textContent=info.name;d.appendChild(nm);
 const rr=document.createElement("em");rr.textContent=info.rarityName;d.appendChild(rr);
 const q=document.createElement("span");q.className="bgq";q.textContent="×"+info.count;d.appendChild(q);
 return d;
}
function bagPaintBody(){
 if(!bagEl)return;
 bagEl.querySelector(".bg-coins b").textContent=bagCoins();
 bagEl.querySelector(".bg-gems b").textContent=CS.c;
 const tabs=BAG_TABS(),bar=bagEl.querySelector(".bg-tabs");bar.textContent="";
 if(!tabs.some(t=>t.id===bagTab))bagTab=tabs[0].id;
 tabs.forEach(t=>{
  const b=document.createElement("button");b.type="button";b.className="bg-tab";b.id="bgt-"+t.id;b.setAttribute("role","tab");b.setAttribute("aria-selected",t.id===bagTab?"true":"false");b.setAttribute("aria-controls","bgpanel");b.tabIndex=t.id===bagTab?0:-1;
  b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'+t.icon+'</svg>';
  const sp=document.createElement("span");sp.textContent=t.name;b.appendChild(sp);
  if(t.n){const c=document.createElement("small");c.textContent=t.n;b.appendChild(c)}
  b.onclick=()=>{bagTab=t.id;bagPaintBody();const nb=bagEl.querySelector("#bgt-"+t.id);nb&&nb.focus()};
  bar.appendChild(b);
 });
 const panel=bagEl.querySelector("#bgpanel");panel.textContent="";panel.setAttribute("aria-labelledby","bgt-"+bagTab);
 const grid=document.createElement("div");grid.className="bg-grid";
 let shown=0;
 if(bagTab==="fragments"){
  for(const id in Fragments.defs){if(!Fragments.count(id))continue;grid.appendChild(bagSlot(Fragments.info(id),"frag"));shown++}
 }else{
  Gear.list(bagTab).forEach(g=>{grid.appendChild(bagSlot(g,"gear"));shown++});
 }
 // pad with empty slots so the bag always looks like a bag
 const pad=Math.max(0,(shown<6?6:Math.ceil(shown/3)*3)-shown);
 for(let k=0;k<pad;k++){const e=document.createElement("div");e.className="bgs empty";e.setAttribute("aria-hidden","true");grid.appendChild(e)}
 panel.appendChild(grid);
 const note=document.createElement("p");note.className="bg-note";
 if(!shown)note.textContent=bagTab==="fragments"?"No fragments yet. Defeat enemies in the Swamp Adventure for a chance to find them.":GEAR_SLOTS[bagTab].empty;
 else note.textContent=bagTab==="fragments"?"Fragments drop from defeated enemies. Hover or long-press one to see where it came from.":"Gear you collect shows up here.";
 panel.appendChild(note);
}
function bagBuild(){
 const w=document.createElement("div");w.className="bag-wrap";w.hidden=true;w.id="bag";
 w.innerHTML='<div class="bag-back" data-x></div><div class="bag" role="dialog" aria-modal="true" aria-labelledby="bagtitle">'+
  '<div class="bag-head"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M8 7V5a4 4 0 018 0v2"/><path d="M6 7h12l2 13a1 1 0 01-1 1H5a1 1 0 01-1-1z"/><path d="M9 13h6"/></svg><h2 id="bagtitle">Bag</h2><button type="button" class="bag-x" data-x aria-label="Close bag">&times;</button></div>'+
  '<div class="bg-wallet"><span class="bg-coins"><span class="coin" aria-hidden="true"></span><b>0</b><em>Swamp Coins</em></span><span class="bg-gems"><span class="gem" aria-hidden="true"></span><b>0</b><em>Swamp Crystals</em></span></div>'+
  '<div class="bg-tabs" role="tablist" aria-label="Bag sections"></div><div id="bgpanel" role="tabpanel"></div></div>';
 document.body.appendChild(w);
 w.addEventListener("click",e=>{if(e.target.closest("[data-x]"))bagClose()});
 w.addEventListener("keydown",e=>{
  if(e.key==="Escape"){e.stopPropagation();e.preventDefault();bagClose();return}
  const t=e.target.closest&&e.target.closest(".bg-tab");
  if(t&&(e.key==="ArrowRight"||e.key==="ArrowLeft")){const all=[...w.querySelectorAll(".bg-tab")],i=all.indexOf(t),n=all[(i+(e.key==="ArrowRight"?1:all.length-1))%all.length];e.preventDefault();n.click()}
  if(e.key==="Tab"){const f=[...w.querySelectorAll("button,[tabindex='0']")].filter(x=>x.tabIndex>=0&&!x.disabled);if(!f.length)return;const a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}
 },true);
 return w;
}
function bagOpen(tab){
 cload();if(!bagEl)bagEl=bagBuild();
 if(tab)bagTab=tab;
 bagFrom=document.activeElement;bagPaintBody();
 try{const fe=document.fullscreenElement||document.webkitFullscreenElement;(fe&&fe!==document.documentElement?fe:document.body).appendChild(bagEl)}catch(e){}
 bagEl.hidden=false;document.documentElement.classList.add("bag-open");
 try{dispatchEvent(new CustomEvent("bag:open"))}catch(e){}
 const x=bagEl.querySelector(".bag-x");x&&x.focus();
}
function bagClose(){
 if(!bagEl||bagEl.hidden)return;
 bagEl.hidden=true;document.documentElement.classList.remove("bag-open");
 try{dispatchEvent(new CustomEvent("bag:close"))}catch(e){}
 try{bagFrom&&bagFrom.focus&&bagFrom.focus()}catch(e){}
 if(location.hash==="#bag")history.replaceState(null,"",location.pathname+location.search);
}
// item count badge on any [data-bag-count]
function paintBag(){
 const n=Bag.count;document.querySelectorAll("[data-bag-count]").forEach(e=>{e.textContent=n});
 if(bagEl&&!bagEl.hidden)bagPaintBody();
}
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("[data-bag]");if(t){e.preventDefault();bagOpen(t.getAttribute("data-bag")||undefined)}});
addEventListener("hashchange",()=>{if(location.hash==="#bag")bagOpen()});
addEventListener("DOMContentLoaded",()=>{paintBag();if(location.hash==="#bag")bagOpen()});

// ---- header: round avatar button (top right) -> avatar.html ----
function paintAv(){
 const b=document.getElementById("avbtn");if(!b||typeof AV==="undefined")return;
 const o=Crystals.outfit();
 b.innerHTML=AV.svg(o).replace('viewBox="0 0 200 200"','viewBox="22 4 156 156"');
 b.style.setProperty("--ac",AV.aura(o)||"#4ee6b4");
}
// ---- header: crystal pill next to the coin bank + Avatar link ----
let _g=null;
function paintGems(){
 const e=document.getElementById("gemct");if(!e)return;
 const v=CS.c,b=e.parentNode;
 if(_g!==null&&v!==_g){b.classList.remove("bump");void b.offsetWidth;b.classList.add("bump")}
 _g=v;e.textContent=v;b.setAttribute("aria-label","Swamp Crystals: "+v+". Open your avatar");
}
(function(){
 if(document.getElementById("gemct"))return;
 if(!document.querySelector('link[href^="ui.css"]')){const lk=document.createElement("link");lk.rel="stylesheet";lk.href="ui.css";document.head.appendChild(lk)}const st=document.createElement("style");
 st.textContent=".gem{display:inline-block;width:.95em;height:1.05em;margin-right:.35em;vertical-align:-.15em;background:linear-gradient(135deg,#d8fff0,#4ee6b4 45%,#14976f);clip-path:polygon(50% 0,100% 35%,50% 100%,0 35%);filter:drop-shadow(0 0 4px #4ee6b488)}.gem{flex:none}header nav .bank.cry{gap:0}html,body{overflow-x:clip}@media(max-width:639px){header{gap:8px;min-width:0}header nav{gap:6px}header .logo{font-size:20px;gap:6px;min-width:0}header nav .bank{min-height:32px;padding:5px 9px 5px 8px;font-size:14px}.snd{width:32px;height:32px}}@media(max-width:380px){header .logo{font-size:17px}header .logo .mark{width:20px;height:24px}header nav .bank{padding:5px 7px;font-size:13px}.bank .coin{margin-right:5px}}";
 document.head.appendChild(st);
 const n=document.querySelector("header nav");if(!n)return;
 const coin=n.querySelector(".bank"),html='<a class="bank cry" href="avatar.html"><span class="gem" aria-hidden="true"></span><b id="gemct">0</b></a>';
 if(coin)coin.insertAdjacentHTML("afterend",html);else n.insertAdjacentHTML("beforeend",html);
 const here=/avatar\.html/.test(location.pathname);
 const snd=document.getElementById("snd"),link='<a class="hide" href="avatar.html"'+(here?' aria-current="page"':'')+'>Avatar</a>';
 if(snd)snd.insertAdjacentHTML("beforebegin",link);
 paintGems();
 n.insertAdjacentHTML("beforeend",'<a class="avbtn" id="avbtn" href="avatar.html" aria-label="Your avatar"'+(here?' aria-current="page"':'')+'></a>');
 addEventListener("load",()=>{
  if(typeof AV!=="undefined"){paintAv();return}
  const sc=document.createElement("script");sc.src="avatar.js";sc.onload=paintAv;document.head.appendChild(sc);
 });
})();
addEventListener("storage",e=>{if(e.key===CK){cload();paintGems();paintAv();try{paintBag()}catch(_){}}});
