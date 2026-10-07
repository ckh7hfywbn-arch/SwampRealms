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
let CS={c:0,earned:0,animal:"frog",own:{},eq:{hat:"",face:"",neck:"",shirt:"",bg:""},day:"",rounds:0,best:{},frags:{},gear:{},geq:{}};
function cload(){try{CS=Object.assign(CS,JSON.parse(localStorage.getItem(CK)||"{}"))}catch(e){}CS.eq=Object.assign({hat:"",face:"",neck:"",shirt:"",bg:""},CS.eq);CS.own=CS.own||{};CS.best=CS.best||{};if(!CS.frags||typeof CS.frags!=="object"||Array.isArray(CS.frags))CS.frags={};for(const k in CS.frags){const v=CS.frags[k];if(!(Number.isFinite(v)&&v>0))delete CS.frags[k];else CS.frags[k]=Math.floor(v)}
 if(!CS.gear||typeof CS.gear!=="object"||Array.isArray(CS.gear))CS.gear={};for(const k in CS.gear){const v=CS.gear[k];if(!(Number.isFinite(v)&&v>0))delete CS.gear[k];else CS.gear[k]=Math.floor(v)}
 if(!CS.geq||typeof CS.geq!=="object"||Array.isArray(CS.geq))CS.geq={};for(const sl in CS.geq){const g=CS.geq[sl];if(!(typeof g==="string"&&CS.gear[g]>0&&GEAR[g]&&GEAR[g].slot===sl))delete CS.geq[sl]}}
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
// Rarity names and colors are the SAME as the cards (cards.js CARDS: Common, Uncommon, Rare, Epic, Legendary, Mythical).
// They are read from CARDS when it is loaded, so changing a card rarity color changes fragments and gear too. The literals below are only a fallback.
const FRAG_RARITY=(()=>{
 const R={common:{name:"Common",color:"#b9bcc2"},uncommon:{name:"Uncommon",color:"#5fd38d"},rare:{name:"Rare",color:"#4da3ff"},epic:{name:"Epic",color:"#a855f7"},legendary:{name:"Legendary",color:"#ff9f1c"},mythical:{name:"Mythical",color:"#ff4fd8"}};
 try{if(typeof CARDS!=="undefined")CARDS.forEach(c=>{const k=String(c.rarity||"").toLowerCase();if(R[k]&&c.color){R[k].name=c.rarity;R[k].color=c.color}})}catch(e){}
 return R;
})();
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
 // bonus (optional) is added to the drop chance: the Endless Realms pass a little extra for deeper levels
 roll(enemyId,bonus){
  const d=FRAGMENTS[enemyId];
  if(!d||Math.random()>=Math.min(.95,d.chance+(Number(bonus)||0)))return null;
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
// id:{name,slot,rarity:common|uncommon|rare|epic|legendary|mythical (same as the cards), desc, stats:{Label:value,...}, icon:"<svg inner markup, 24x24, stroke style>"}   stats and icon are optional; stats are shown in the Bag
const GEAR={
 // weapons the player can craft from fragments (recipes are in RECIPES below)
 bogblaster:{name:"Bog Blaster",slot:"weapons",rarity:"uncommon",desc:"Spits sticky bog goo.",stats:{Damage:7,Speed:"Medium",Range:"Long"},icon:'<path d="M3 10h11l3 2h3v4h-3l-1 3h-4l-1-3H3z"/><path d="M7 10V7h4v3"/><circle cx="21.5" cy="8" r="1.3"/>'},
 spikedblade:{name:"Spiked Blade",slot:"weapons",rarity:"common",desc:"A blade bristling with bramble thorns.",stats:{Damage:9,Speed:"Fast",Range:"Short"},icon:'<path d="M20 4l-1 6-9 9-5-5 9-9z"/><path d="M8 14l-4 6M4 20l-1 1"/><path d="M14 4l-1-2M19 9l2 1M16 7l1-2"/>'},
 hopperstaff:{name:"Swamp Hopper Staff",slot:"weapons",rarity:"common",desc:"A staff that hops with a frog's spring.",stats:{Damage:5,Speed:"Medium",Range:"Medium"},icon:'<path d="M4 20l8-8"/><path d="M12 12l-1-3 3 1 1-3 3 1"/><circle cx="19" cy="5" r="2.2"/>'}
 // example:  oakclub:{name:"Oak Club",slot:"weapons",rarity:"common",desc:"A knobbly swamp club."},
};
const Gear={
 defs:GEAR,slots:GEAR_SLOTS,
 count:id=>CS.gear[id]||0,
 get all(){return CS.gear},
 get total(){let n=0;for(const k in CS.gear)n+=CS.gear[k];return n},
 info(id){const d=GEAR[id];if(!d)return null;const r=FRAG_RARITY[d.rarity]||FRAG_RARITY.common;return{id,name:d.name,slot:d.slot,desc:d.desc||"",rarity:d.rarity||"common",rarityName:r.name,color:r.color,count:CS.gear[id]||0,stats:d.stats||{},icon:d.icon||"",equipped:CS.geq[d.slot]===id}},
 // what is equipped in a slot (info record) or null
 equipped(slot){const id=CS.geq[slot];return id&&CS.gear[id]>0?this.info(id):null},
 isEquipped(id){const d=GEAR[id];return !!d&&CS.geq[d.slot]===id&&CS.gear[id]>0},
 // equip an item the player owns (one per slot; it replaces the old one). Returns {ok,reason,gear}
 equip(id){
  cload();const d=GEAR[id];
  if(!d)return{ok:false,reason:"Unknown item."};
  if(!(CS.gear[id]>0))return{ok:false,reason:"You don't own that yet."};
  CS.geq[d.slot]=id;csave();
  try{dispatchEvent(new CustomEvent("gear:change",{detail:{slot:d.slot,id}}))}catch(e){}
  return{ok:true,reason:"",gear:this.info(id)};
 },
 unequip(slot){
  cload();if(!CS.geq[slot])return{ok:false,reason:"Nothing equipped."};
  delete CS.geq[slot];csave();
  try{dispatchEvent(new CustomEvent("gear:change",{detail:{slot,id:""}}))}catch(e){}
  return{ok:true,reason:""};
 },
 // owned items of one slot, as info records
 list(slot){const out=[];for(const id in CS.gear){const d=GEAR[id];if(d&&d.slot===slot)out.push(this.info(id))}return out},
 add(id,n){if(!GEAR[id])return null;cload();n=Math.max(1,Math.floor(n)||1);CS.gear[id]=(CS.gear[id]||0)+n;csave();return this.info(id)}
};

// ---- Crafting: turn fragments into gear. One line per recipe. To add a weapon: add it to GEAR above, then add a line here.
// RECIPES id = the GEAR id it makes.  cost = { fragmentId: amount } (fragment ids are the FRAGMENTS keys; list as many as you like).
// Crafting.craft(id) checks the cost, subtracts the fragments and adds the gear in ONE save, so it can never take fragments without giving the item.
const RECIPES={
 bogblaster:{cost:{crawler:5}},   // 5 Bog Fragments
 spikedblade:{cost:{bug:4}},      // 4 Bramble Fragments
 hopperstaff:{cost:{frog:5}}      // 5 Frog Fragments (the Frog enemy is not in the game yet)
};
const Crafting={
 defs:RECIPES,
 // every recipe as a record: {id, gear:(Gear.info), cost:[{id,name,need,have,short}], can}
 list(){return Object.keys(RECIPES).filter(id=>GEAR[id]).map(id=>this.info(id))},
 info(id){
  const r=RECIPES[id],g=Gear.info(id);if(!r||!g)return null;
  const cost=Object.keys(r.cost).map(f=>{const d=FRAGMENTS[f],need=r.cost[f],have=Fragments.count(f);return{id:f,name:d?d.name:f,need,have,short:Math.max(0,need-have)}});
  return{id,gear:g,cost,can:cost.every(c=>c.short===0)};
 },
 // can the player craft it right now? {ok, reason, missing:[{id,name,short}]}
 check(id){
  cload();const r=this.info(id);
  if(!r)return{ok:false,reason:"Unknown recipe.",missing:[]};
  const missing=r.cost.filter(c=>c.short>0).map(c=>({id:c.id,name:c.name,short:c.short}));
  return missing.length?{ok:false,reason:"Not enough fragments.",missing}:{ok:true,reason:"",missing:[]};
 },
 // craft one. Returns {ok, reason, missing, gear}. Nothing is changed unless it succeeds.
 craft(id){
  const c=this.check(id);if(!c.ok)return c;
  const r=RECIPES[id];
  for(const f in r.cost){CS.frags[f]=(CS.frags[f]||0)-r.cost[f];if(CS.frags[f]<=0)delete CS.frags[f]}
  CS.gear[id]=(CS.gear[id]||0)+1;
  csave();
  return{ok:true,reason:"",missing:[],gear:Gear.info(id)};
 }
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
 const txt=info.name+" · "+info.rarityName+(kind==="frag"?" · dropped by the "+info.enemy:info.desc?" · "+info.desc:"");
 d.setAttribute("role","button");d.setAttribute("aria-label",txt);
 const show=()=>{const p=document.getElementById("bgdetail");if(!p)return;p.textContent=txt;p.style.setProperty("--c",info.color);p.hidden=false;document.querySelectorAll("#bag .bgs.on").forEach(x=>x.classList.remove("on"));d.classList.add("on")};
 d.addEventListener("click",show);d.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();show()}});
 d.addEventListener("contextmenu",e=>{e.preventDefault();show()});
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
  b.onclick=()=>{bagTab=t.id;bagGearMsg="";bagPaintBody();const nb=bagEl.querySelector("#bgt-"+t.id);nb&&nb.focus()};
  bar.appendChild(b);
 });
 const panel=bagEl.querySelector("#bgpanel");panel.textContent="";panel.setAttribute("aria-labelledby","bgt-"+bagTab);
 if(bagTab!=="fragments"&&Gear.list(bagTab).length){bagPaintGear(panel,bagTab);return}
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
 const det=document.createElement("p");det.className="bg-detail";det.id="bgdetail";det.hidden=true;det.setAttribute("aria-live","polite");panel.appendChild(det);
 const note=document.createElement("p");note.className="bg-note";
 if(!shown)note.textContent=bagTab==="fragments"?"No fragments yet. Defeat enemies in the Swamp Adventure for a chance to find them.":GEAR_SLOTS[bagTab].empty;
 else note.textContent=bagTab==="fragments"?"Fragments drop from defeated enemies. Tap one to see where it came from.":"Gear you collect shows up here.";
 panel.appendChild(note);
}
// a gear tab (Weapons, Armor...): one card per owned item with icon, rarity, stats, description, equipped status and an Equip / Unequip button
let bagGearMsg="";
function bagPaintGear(panel,slot){
 const items=Gear.list(slot).sort((a,b)=>(b.equipped-a.equipped)||a.name.localeCompare(b.name));
 const list=document.createElement("div");list.className="gr-list";
 items.forEach(g=>{
  const row=document.createElement("div");row.className="gr-row"+(g.equipped?" on":"");row.style.setProperty("--c",g.color);
  const ic=document.createElement("div");ic.className="gr-icon";ic.setAttribute("aria-hidden","true");
  ic.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">'+(g.icon||GEAR_SLOTS[slot].icon)+'</svg>';
  row.appendChild(ic);
  const body=document.createElement("div");body.className="gr-body";
  const top=document.createElement("div");top.className="gr-top";
  const nm=document.createElement("b");nm.textContent=g.name;top.appendChild(nm);
  const st=document.createElement("small");st.className="gr-state";st.textContent=g.equipped?"Equipped":"Unequipped";top.appendChild(st);
  body.appendChild(top);
  const rr=document.createElement("em");rr.className="gr-rar";rr.textContent=g.rarityName+(g.count>1?" · ×"+g.count:"");body.appendChild(rr);
  const keys=Object.keys(g.stats);
  if(keys.length){const sc=document.createElement("div");sc.className="gr-stats";keys.forEach(k=>{const c=document.createElement("span");c.className="gr-stat";c.textContent=k+" "+g.stats[k];sc.appendChild(c)});body.appendChild(sc)}
  if(g.desc){const ds=document.createElement("p");ds.className="gr-desc";ds.textContent=g.desc;body.appendChild(ds)}
  const b=document.createElement("button");b.type="button";b.className="gr-btn";b.textContent=g.equipped?"Unequip":"Equip";
  b.setAttribute("aria-label",(g.equipped?"Unequip ":"Equip ")+g.name);
  b.addEventListener("click",()=>{
   if(g.equipped){Gear.unequip(slot);bagGearMsg="Unequipped "+g.name+"."}
   else{const r=Gear.equip(g.id);bagGearMsg=r.ok?"Equipped "+g.name+".":r.reason}
   bagPaintBody();
  });
  body.appendChild(b);row.appendChild(body);list.appendChild(row);
 });
 panel.appendChild(list);
 const det=document.createElement("p");det.className="bg-detail";det.id="bgdetail";det.setAttribute("aria-live","polite");
 if(bagGearMsg){det.textContent=bagGearMsg;det.style.setProperty("--c","#f2c14e")}else det.hidden=true;
 panel.appendChild(det);
 const note=document.createElement("p");note.className="bg-note";note.textContent="One "+GEAR_SLOTS[slot].name.toLowerCase().replace(/s$/,"")+" can be equipped at a time. Crafted gear shows up here automatically.";panel.appendChild(note);
}
// the Crafting popup (its own section, like the Bag): one row per recipe with its cost, what the player has, and a Craft button (disabled until they have enough)
let craftMsg="";
function craftPaintPanel(panel){
 const list=document.createElement("div");list.className="cr-list";
 Crafting.list().forEach(r=>{
  const row=document.createElement("div");row.className="cr-row"+(r.can?" can":"");row.style.setProperty("--c",r.gear.color);
  const top=document.createElement("div");top.className="cr-top";
  const nm=document.createElement("b");nm.textContent=r.gear.name;top.appendChild(nm);
  const ow=document.createElement("small");ow.textContent=r.gear.count?"Owned ×"+r.gear.count:r.gear.rarityName;top.appendChild(ow);
  row.appendChild(top);
  if(r.gear.desc){const ds=document.createElement("p");ds.className="cr-desc";ds.textContent=r.gear.desc;row.appendChild(ds)}
  const sk=Object.keys(r.gear.stats||{});
  if(sk.length){const sc=document.createElement("div");sc.className="gr-stats";sk.forEach(k=>{const c=document.createElement("span");c.className="gr-stat";c.textContent=k+" "+r.gear.stats[k];sc.appendChild(c)});row.appendChild(sc)}
  const cs=document.createElement("div");cs.className="cr-cost";
  r.cost.forEach(c=>{const ch=document.createElement("span");ch.className="cr-chip"+(c.short?" short":"");ch.textContent=c.name+" "+Math.min(c.have,c.need)+" / "+c.need;cs.appendChild(ch)});
  row.appendChild(cs);
  const b=document.createElement("button");b.type="button";b.className="cr-btn";b.textContent=r.can?"Craft":"Need more fragments";b.disabled=!r.can;
  b.addEventListener("click",()=>{
   const res=Crafting.craft(r.id);
   craftMsg=res.ok?"Crafted "+res.gear.name+"! It is in your Bag, under Weapons.":(res.reason+(res.missing.length?" Need "+res.missing.map(m=>m.short+" more "+m.name).join(", ")+".":""));
   craftPaint();
  });
  row.appendChild(b);list.appendChild(row);
 });
 panel.appendChild(list);
 const det=document.createElement("p");det.className="bg-detail";det.id="crdetail";det.setAttribute("aria-live","polite");
 if(craftMsg){det.textContent=craftMsg;det.style.setProperty("--c","#f2c14e")}else det.hidden=true;
 panel.appendChild(det);
 const note=document.createElement("p");note.className="bg-note";note.textContent="Crafting uses up the fragments. Defeat enemies in the Swamp Adventure to find more.";panel.appendChild(note);
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
 if(tab==="craft"){craftOpen();return}   // crafting is its own section now
 cload();try{craftClose()}catch(e){}if(!bagEl)bagEl=bagBuild();
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

const Craft={
 get count(){return Crafting.list().filter(r=>r.can).length},
 open(){craftOpen()},close(){craftClose()},toggle(){craftEl&&!craftEl.hidden?craftClose():craftOpen()}
};
let craftEl=null,craftFrom=null;
function craftBuild(){
 const w=document.createElement("div");w.className="bag-wrap";w.hidden=true;w.id="craft";
 w.innerHTML='<div class="bag-back" data-x></div><div class="bag" role="dialog" aria-modal="true" aria-labelledby="crafttitle">'+
  '<div class="bag-head"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M14 4l6 6-3 3-6-6z"/><path d="M11 9l-7 7 4 4 7-7"/></svg><h2 id="crafttitle">Crafting</h2><button type="button" class="bag-x" data-x aria-label="Close crafting">&times;</button></div>'+
  '<div class="bg-wallet"><span class="bg-coins"><span class="bg-fr" aria-hidden="true"></span><b>0</b><em>Fragments</em></span><button type="button" class="cr-bagbtn" data-bag>Open Bag</button></div>'+
  '<div id="crpanel"></div></div>';
 document.body.appendChild(w);
 w.addEventListener("click",e=>{if(e.target.closest("[data-x]"))craftClose();else if(e.target.closest("[data-bag]"))craftClose()});
 w.addEventListener("keydown",e=>{
  if(e.key==="Escape"){e.stopPropagation();e.preventDefault();craftClose();return}
  if(e.key==="Tab"){const f=[...w.querySelectorAll("button")].filter(x=>!x.disabled);if(!f.length)return;const a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}
 },true);
 return w;
}
function craftPaint(){
 if(!craftEl)return;
 craftEl.querySelector(".bg-coins b").textContent=Fragments.total;
 const panel=craftEl.querySelector("#crpanel");panel.textContent="";craftPaintPanel(panel);
}
function craftOpen(){
 cload();if(!craftEl)craftEl=craftBuild();
 try{bagClose()}catch(e){}
 craftFrom=document.activeElement;craftMsg="";craftPaint();
 try{const fe=document.fullscreenElement||document.webkitFullscreenElement;(fe&&fe!==document.documentElement?fe:document.body).appendChild(craftEl)}catch(e){}
 craftEl.hidden=false;document.documentElement.classList.add("bag-open");
 try{dispatchEvent(new CustomEvent("craft:open"));dispatchEvent(new CustomEvent("bag:open"))}catch(e){}
 const x=craftEl.querySelector(".bag-x");x&&x.focus();
}
function craftClose(){
 if(!craftEl||craftEl.hidden)return;
 craftEl.hidden=true;document.documentElement.classList.remove("bag-open");
 try{dispatchEvent(new CustomEvent("craft:close"))}catch(e){}
 try{craftFrom&&craftFrom.focus&&craftFrom.focus()}catch(e){}
 if(location.hash==="#craft")history.replaceState(null,"",location.pathname+location.search);
}
function paintCraft(){
 const n=Craft.count;document.querySelectorAll("[data-craft-count]").forEach(e=>{e.textContent=n;e.hidden=!n});
 if(craftEl&&!craftEl.hidden)craftPaint();
}
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("[data-craft]");if(t){e.preventDefault();craftOpen()}});
addEventListener("hashchange",()=>{if(location.hash==="#craft")craftOpen()});
addEventListener("DOMContentLoaded",()=>{paintCraft();if(location.hash==="#craft")craftOpen()});
// item count badge on any [data-bag-count]
function paintBag(){
 const n=Bag.count;document.querySelectorAll("[data-bag-count]").forEach(e=>{e.textContent=n});
 if(bagEl&&!bagEl.hidden)bagPaintBody();
 try{paintCraft()}catch(e){}
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
