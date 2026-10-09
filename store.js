// ===== SwampRealms: Swamp Crystals + avatar wallet =====
// Load AFTER cards.js on every page:  <script src="cards.js"></script><script src="store.js"></script>
// Crystals are earned from games (unlimited rounds) and spent on cosmetics for your avatar animal.
// Saved separately from coins, so cards.js is never touched.

// ---- CRYSTAL RULES: edit these ----
const CRY={
 // per game: points needed for 1 crystal, and the most crystals one round can pay
 // adv = the Swamp Adventure: 1 crystal per 55.6 score (was 50: 10% fewer), no cap, so every run pays and there is no daily limit
 games:{adv:{per:55.6,cap:Infinity},_:{per:4,cap:25}},
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
// Crafting reset: raise this number to wipe everybody's fragments, crafted gear and equipped armor/weapons ONCE (coins, crystals, cosmetics, avatar and skins are never touched).
// Each save remembers the number it has been reset to (CS.cr), so it only happens once per save, and it syncs with accounts like the rest of the crystals save.
const CRAFT_RESET=1;
let CS={c:0,earned:0,animal:"frog",own:{},eq:{hat:"",face:"",neck:"",shirt:"",bg:""},day:"",rounds:0,best:{},frags:{},gear:{},geq:{},skins:{},skeq:{}};
function cload(){try{CS=Object.assign(CS,JSON.parse(localStorage.getItem(CK)||"{}"))}catch(e){}CS.eq=Object.assign({hat:"",face:"",neck:"",shirt:"",bg:""},CS.eq);CS.own=CS.own||{};CS.best=CS.best||{};if(!CS.frags||typeof CS.frags!=="object"||Array.isArray(CS.frags))CS.frags={};for(const k in CS.frags){const v=CS.frags[k];if(!(Number.isFinite(v)&&v>0))delete CS.frags[k];else CS.frags[k]=Math.floor(v)}
 if(!CS.gear||typeof CS.gear!=="object"||Array.isArray(CS.gear))CS.gear={};for(const k in CS.gear){const v=CS.gear[k];if(!(Number.isFinite(v)&&v>0))delete CS.gear[k];else CS.gear[k]=Math.floor(v)}
 if(!CS.geq||typeof CS.geq!=="object"||Array.isArray(CS.geq))CS.geq={};try{for(const sl in CS.geq){const g=CS.geq[sl];if(!(typeof g==="string"&&CS.gear[g]>0&&GEAR[g]&&eqk(GEAR[g])===sl))delete CS.geq[sl]}}catch(e){}
 if(!CS.skins||typeof CS.skins!=="object"||Array.isArray(CS.skins))CS.skins={};if(!CS.skeq||typeof CS.skeq!=="object"||Array.isArray(CS.skeq))CS.skeq={};
 try{for(const w in CS.skeq){const k=CS.skeq[w];if(!(typeof k==="string"&&CS.skins[k]&&SKINS[k]&&SKINS[k].w===w))delete CS.skeq[w]}}catch(e){}
 if((Number(CS.cr)||0)<CRAFT_RESET){const had=Object.keys(CS.frags).length+Object.keys(CS.gear).length>0;CS.frags={};CS.gear={};CS.geq={};CS.cr=CRAFT_RESET;if(had)CS.crn=1;try{localStorage.setItem(CK,JSON.stringify(CS))}catch(e){}}}   // GEAR and SKINS are declared further down this file; the first cload() runs before it exists, so it is re-run below
function csave(){try{localStorage.setItem(CK,JSON.stringify(CS))}catch(e){}paintGems();paintAv();try{paintBag()}catch(e){}}
cload();

// One-time notice after the crafting reset (CRAFT_RESET above). Only shown on the Arcade and Swamp Adventure pages, then cleared from the save.
(function(){
 function show(){
  if(!CS.crn||!document.querySelector("[data-bag],[data-craft],#stage"))return;
  const d=document.createElement("div");d.setAttribute("role","status");
  d.style.cssText="position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:9999;max-width:min(92vw,460px);padding:12px 40px 12px 16px;border-radius:12px;background:#10241f;color:#e9fff6;border:1px solid #4ee6b4;font:700 14px/1.4 Nunito,system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.45)";
  d.textContent="Crafting has been reset for the new Swamp Adventure. Your fragments and crafted gear were cleared. Coins, crystals and your avatar are untouched.";
  const x=document.createElement("button");x.type="button";x.textContent="\u00d7";x.setAttribute("aria-label","Dismiss");x.style.cssText="position:absolute;top:4px;right:8px;background:none;border:0;color:inherit;font-size:22px;cursor:pointer";
  const done=()=>{d.remove()};x.onclick=done;d.appendChild(x);document.body.appendChild(d);setTimeout(done,12000);
  delete CS.crn;try{localStorage.setItem(CK,JSON.stringify(CS))}catch(e){}
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",show);else show();
})();

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
 award(game,score,extra){   // extra: flat bonus crystals (the Swamp Adventure's purple boss-level glowspores)
  cload();
  const t=new Date().toLocaleDateString("en-CA");
  if(CS.day!==t){CS.day=t;CS.rounds=0}
  let gained=this.forScore(game,score)+Math.max(0,Math.floor(extra)||0),bonus=0;
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
 bug:{name:"Bramble Fragment",enemy:"Bramble Bug",chance:1,rarity:"common"},
 crawler:{name:"Bog Fragment",enemy:"Bog Crawler",chance:1,rarity:"uncommon"},
 boss:{name:"Rootmaw Fragment",enemy:"Rootmaw",chance:1,rarity:"rare"},
 // ready for enemies that are not in the game yet
 frog:{name:"Frog Fragment",enemy:"Frog",chance:1,rarity:"common"},
 crocodile:{name:"Crocodile Fragment",enemy:"Crocodile",chance:1,rarity:"uncommon"},
 slime:{name:"Slime Fragment",enemy:"Slime",chance:1,rarity:"common"},
 // story bosses (set as SLOTS[n].fragment in storyboss.js)
 wing:{name:"Wing Fragment",enemy:"Mirewing",chance:1,rarity:"rare"},
 ape:{name:"Ape Fragment",enemy:"Stone Ape",chance:1,rarity:"epic"}
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
  if(!d||Math.random()>=Math.min(1,d.chance+(Number(bonus)||0)))return null;
  return this.add(enemyId,1);
 }
};

// ---- Gear: weapons, armor and more, stored in the Bag. Saved INSIDE the crystals save (CS.gear = {gearId: count}), so it persists and syncs with accounts.
// To add gear later: add a line to GEAR (slot = weapons | armor | accessories), then call Gear.add("id") when the player earns or buys it.
// To add a whole new section (e.g. "pets"), add it to GEAR_SLOTS. The Bag builds its tabs from these two tables.
// Equip key: weapons use their slot ("weapons"); armor pieces have a part (helmet | chest | boots) and use "armor:helmet" etc., so one of each part can be worn at once.
function eqk(d){return d.part?d.slot+":"+d.part:d.slot}
const GEAR_SLOTS={
 weapons:{name:"Weapons",icon:'<path d="M14.5 4.5L20 4l-.5 5.5L9 20l-5-5z"/><path d="M13 7l4 4M5 19l-2 2"/>',empty:"No weapons yet. Swords and blasters are coming soon."},
 armor:{name:"Armor",icon:'<path d="M12 3l8 3v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6z"/>',empty:"No armor yet. Craft helmets, chest armor and boots from fragments."},
 accessories:{name:"Accessories",icon:'<circle cx="12" cy="14" r="5"/><path d="M9 4h6l-1 5h-4z"/>',empty:"No accessories yet. Charms and trinkets are coming soon."}
};
// id:{name,slot,rarity:common|uncommon|rare|epic|legendary|mythical (same as the cards), desc, stats:{Label:value,...}, icon:"<svg inner markup, 24x24, stroke style>"}   stats and icon are optional; stats are shown in the Bag
const GEAR={
 // weapons the player can craft from fragments (recipes are in RECIPES below)
 bogblaster:{name:"Bog Blaster",slot:"weapons",rarity:"uncommon",desc:"Spits sticky bog goo.",stats:{Damage:3.5,Speed:"Medium",Range:"Long"},icon:'<path d="M3 10h11l3 2h3v4h-3l-1 3h-4l-1-3H3z"/><path d="M7 10V7h4v3"/><circle cx="21.5" cy="8" r="1.3"/>'},
 spikedblade:{name:"Spiked Blade",slot:"weapons",rarity:"common",desc:"A blade bristling with bramble thorns.",stats:{Damage:9,Speed:"Fast",Range:"Short"},icon:'<path d="M20 4l-1 6-9 9-5-5 9-9z"/><path d="M8 14l-4 6M4 20l-1 1"/><path d="M14 4l-1-2M19 9l2 1M16 7l1-2"/>'},
 hopperstaff:{name:"Swamp Hopper Staff",slot:"weapons",rarity:"common",desc:"A staff that hops with a frog's spring.",stats:{Damage:5,Speed:"Medium",Range:"Medium"},icon:'<path d="M4 20l8-8"/><path d="M12 12l-1-3 3 1 1-3 3 1"/><circle cx="19" cy="5" r="2.2"/>'},
 // ---- Rootmaw armor set: one helmet, one chest piece and one pair of boots can be worn at once (part = helmet | chest | boots).
 // Stats shown here mirror ARMOR_FX below (what the game applies). Wearing all three adds SET_BONUS.
 wardenhelm:{name:"Rootmaw Helmet",slot:"armor",part:"helmet",set:"warden",rarity:"uncommon",desc:"A mossy iron helm with a bramble crest.",stats:{Health:"+1"},icon:'<path d="M4 15a8 8 0 0116 0v3H4z"/><path d="M12 4v5M8 18v-3M16 18v-3"/>'},
 wardenplate:{name:"Rootmaw Chest Piece",slot:"armor",part:"chest",set:"warden",rarity:"rare",desc:"Layered bark plates bound with swamp vine.",stats:{Health:"+1"},icon:'<path d="M7 4l-4 4 2 4 2-1v9h10v-9l2 1 2-4-4-4-3 2h-4z"/><path d="M12 8v12"/>'},
 wardenboots:{name:"Rootmaw Boots",slot:"armor",part:"boots",set:"warden",rarity:"uncommon",desc:"Light, waterproof and quick over the mud.",stats:{Speed:"+8%"},icon:'<path d="M7 3h6v8l6 3v5H5v-5l2-1z"/><path d="M5 16h14"/>'}
 // example:  oakclub:{name:"Oak Club",slot:"weapons",rarity:"common",desc:"A knobbly swamp club."},
};
cload();   // second pass now that GEAR exists: drops equipped weapons that are no longer owned
// Armor numbers the game applies. hp = extra max health, move = run speed (0.08 = +8%).
const ARMOR_FX={wardenhelm:{hp:1},wardenplate:{hp:1},wardenboots:{move:.08}};
// Wearing the full set adds this on top.
const SET_BONUS={warden:{name:"Rootmaw set",text:"+1 max health",hp:1}};
const Gear={
 defs:GEAR,slots:GEAR_SLOTS,
 count:id=>CS.gear[id]||0,
 get all(){return CS.gear},
 get total(){let n=0;for(const k in CS.gear)n+=CS.gear[k];return n},
 info(id){const d=GEAR[id];if(!d)return null;const r=FRAG_RARITY[d.rarity]||FRAG_RARITY.common;return{id,name:d.name,slot:d.slot,part:d.part||"",set:d.set||"",key:eqk(d),desc:d.desc||"",rarity:d.rarity||"common",rarityName:r.name,color:r.color,count:CS.gear[id]||0,stats:d.stats||{},icon:d.icon||"",equipped:CS.geq[eqk(d)]===id}},
 // what is equipped in a slot (info record) or null
 equipped(slot){const id=CS.geq[slot];return id&&CS.gear[id]>0?this.info(id):null},
 isEquipped(id){const d=GEAR[id];return !!d&&CS.geq[eqk(d)]===id&&CS.gear[id]>0},
 // equip an item the player owns (one per slot; it replaces the old one). Returns {ok,reason,gear}
 equip(id){
  cload();const d=GEAR[id];
  if(!d)return{ok:false,reason:"Unknown item."};
  if(!(CS.gear[id]>0))return{ok:false,reason:"You don't own that yet."};
  CS.geq[eqk(d)]=id;csave();
  try{dispatchEvent(new CustomEvent("gear:change",{detail:{slot:d.slot,part:d.part||"",key:eqk(d),id}}))}catch(e){}
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
 add(id,n){if(!GEAR[id])return null;cload();n=Math.max(1,Math.floor(n)||1);CS.gear[id]=(CS.gear[id]||0)+n;csave();return this.info(id)},
 // What the worn armor gives right now: {hp: extra max health, move: run speed multiplier, pieces: 0-3, set: set id or false}.
 // The game reads this in one place. To retune armor, change ARMOR_FX / SET_BONUS above.
 bonus(){
  cload();const o={hp:0,move:1,pieces:0,set:false},cnt={};
  ["helmet","chest","boots"].forEach(pt=>{const id=CS.geq["armor:"+pt];if(!(id&&CS.gear[id]>0&&GEAR[id]))return;o.pieces++;const fx=ARMOR_FX[id]||{};o.hp+=fx.hp||0;o.move+=fx.move||0;const st=GEAR[id].set;if(st)cnt[st]=(cnt[st]||0)+1});
  for(const st in cnt)if(cnt[st]>=3&&SET_BONUS[st]){o.set=st;o.hp+=SET_BONUS[st].hp||0;o.move+=SET_BONUS[st].move||0}
  return o;
 },
 // damage per hit as the game really applies it: Damage / 5, one decimal (a bare attack = 1). The Bag shows this same number and adventure.html uses it for combat.
 hitDmg(id){const st=GEAR[id]&&GEAR[id].stats;return st?Math.max(.5,Math.round((+st.Damage||5)/5*10)/10):1}
};

// ---- Weapon Skins: luxury paints for the weapons, bought with Swamp Crystals in the Skin Shop (Skins.open()). The art for each id is in SKIN_ART in weapons.js.
// Owned skins are saved INSIDE the crystals save (CS.skins = {skinId:1}); the one worn per weapon is CS.skeq = {weaponId: skinId}, so both sync with accounts.
// To add a skin: add its art to SKIN_ART in weapons.js, then a line here (w = weapon id, rarity: epic | legendary | mythical, price in Swamp Crystals).
// Free quest skins can be added later as lines with  price:0, free:true  and handed out with Skins.grant(id); nothing uses that yet.
const SKINS={
 midnightbramble:{w:"spikedblade",name:"Midnight Bramble",rarity:"epic",price:600,desc:"Obsidian steel with violet thorns that hum in the dark."},
 gildedthornbane:{w:"spikedblade",name:"Gilded Thornbane",rarity:"legendary",price:900,desc:"Pure gold blade, emerald thorns and a glowing jewel at the guard."},
 moonbriar:{w:"spikedblade",name:"Moonlit Briar",rarity:"mythical",price:1500,desc:"Frost-silver blade with ice thorns, etched runes and drifting starlight."},
 amberrelic:{w:"bogblaster",name:"Amber Relic",rarity:"epic",price:600,desc:"A sunken copper relic that spits molten amber goo."},
 royalmire:{w:"bogblaster",name:"Royal Mire Cannon",rarity:"legendary",price:900,desc:"Golden royal cannon with ringed barrel and glowing emerald goo."},
 toxicnebula:{w:"bogblaster",name:"Toxic Nebula",rarity:"mythical",price:1500,desc:"A void-dark blaster that fires glittering magenta goo."},
 glacialtreefrog:{w:"hopperstaff",name:"Glacial Tree Frog",rarity:"epic",price:600,desc:"A frozen frog with a pearl-white staff and an icy glow."},
 twilighttoad:{w:"hopperstaff",name:"Twilight Toad Sceptre",rarity:"legendary",price:900,desc:"A crowned violet toad that sparkles like a swamp at dusk."},
 emeraldmonarch:{w:"hopperstaff",name:"Emerald Monarch Staff",rarity:"mythical",price:1500,desc:"A solid gold staff topped by a jewelled, crowned emerald frog."}
};
const Skins={
 defs:SKINS,
 info(id){const d=SKINS[id];if(!d)return null;const r=FRAG_RARITY[d.rarity]||FRAG_RARITY.common;return{id,w:d.w,weapon:GEAR[d.w]?GEAR[d.w].name:d.w,name:d.name,desc:d.desc||"",price:d.price||0,rarity:d.rarity,rarityName:r.name,color:r.color,owned:!!CS.skins[id],equipped:CS.skeq[d.w]===id}},
 owns:id=>!!CS.skins[id],
 // every skin for one weapon (info records), cheapest first
 forWeapon(w){return Object.keys(SKINS).filter(id=>SKINS[id].w===w).map(id=>this.info(id)).sort((a,b)=>a.price-b.price)},
 // weapons that have skins, in GEAR order
 weapons(){return Object.keys(GEAR).filter(w=>Object.keys(SKINS).some(id=>SKINS[id].w===w))},
 // the skin id worn on a weapon, or null (this is what the Bag and the Swamp Adventure draw)
 equippedFor(w){const id=CS.skeq[w];return id&&CS.skins[id]&&SKINS[id]&&SKINS[id].w===w?id:null},
 // {ok, reason}: can the player buy it right now?
 check(id){
  cload();const d=SKINS[id];
  if(!d)return{ok:false,reason:"Unknown skin."};
  if(CS.skins[id])return{ok:false,reason:"You already own this skin."};
  if(!(CS.gear[d.w]>0))return{ok:false,reason:"Craft the "+(GEAR[d.w]?GEAR[d.w].name:d.w)+" first, then you can buy its skins."};
  if(CS.c<d.price)return{ok:false,reason:"Need "+(d.price-CS.c)+" more Swamp Crystals."};
  return{ok:true,reason:""};
 },
 // spend crystals, own the skin and wear it. Nothing is taken unless it succeeds.
 buy(id){
  const c=this.check(id);if(!c.ok)return c;
  const d=SKINS[id];CS.c-=d.price;CS.skins[id]=1;CS.skeq[d.w]=id;csave();
  try{SFX.streak()}catch(e){}
  try{dispatchEvent(new CustomEvent("skin:change",{detail:{w:d.w,id}}))}catch(e){}
  return{ok:true,reason:"",skin:this.info(id)};
 },
 // wear a skin the player owns (replaces the one on that weapon)
 equip(id){
  cload();const d=SKINS[id];
  if(!d)return{ok:false,reason:"Unknown skin."};
  if(!CS.skins[id])return{ok:false,reason:"You don't own that skin yet."};
  CS.skeq[d.w]=id;csave();
  try{dispatchEvent(new CustomEvent("skin:change",{detail:{w:d.w,id}}))}catch(e){}
  return{ok:true,reason:""};
 },
 // back to the plain weapon
 unequip(w){
  cload();if(!CS.skeq[w])return{ok:false,reason:"No skin worn."};
  delete CS.skeq[w];csave();
  try{dispatchEvent(new CustomEvent("skin:change",{detail:{w,id:""}}))}catch(e){}
  return{ok:true,reason:""};
 },
 // give a skin without charging (for quest rewards later; not used yet)
 grant(id){if(!SKINS[id])return null;cload();CS.skins[id]=1;csave();return this.info(id)},
 open(w){skinOpen(w)},close(){skinClose()},toggle(){skEl&&!skEl.hidden?skinClose():skinOpen()}
};
cload();   // third pass now that SKINS exists: drops worn skins that are no longer owned

// ---- Crafting: turn fragments into gear. One line per recipe. To add a weapon: add it to GEAR above, then add a line here.
// RECIPES id = the GEAR id it makes.  cost = { fragmentId: amount } (fragment ids are the FRAGMENTS keys; list as many as you like).
// Crafting.craft(id) checks the cost, subtracts the fragments and adds the gear in ONE save, so it can never take fragments without giving the item.
const RECIPES={
 bogblaster:{cost:{crawler:5}},   // 5 Bog Fragments
 spikedblade:{cost:{bug:4}},      // 4 Bramble Fragments
 hopperstaff:{cost:{frog:5}},     // 5 Frog Fragments (the Frog enemy is not in the game yet)
 // Rootmaw armor: every piece needs at least one Rootmaw Fragment (boss) on top of the other fragments
 wardenhelm:{cost:{bug:4,crawler:2,boss:1}},
 wardenplate:{cost:{crawler:5,boss:1}},
 wardenboots:{cost:{bug:3,crawler:3,boss:1}}
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
 try{loadoutPaint()}catch(e){}
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
 const items=Gear.list(slot).sort((a,b)=>(b.equipped-a.equipped)||((["helmet","chest","boots"].indexOf(a.part)-["helmet","chest","boots"].indexOf(b.part))||a.name.localeCompare(b.name)));
 const list=document.createElement("div");list.className="gr-list";
 items.forEach(g=>{
  const row=document.createElement("div");row.className="gr-row"+(g.equipped?" on":"");row.style.setProperty("--c",g.color);
  const ic=document.createElement("div");ic.className="gr-icon";ic.setAttribute("aria-hidden","true");
  ic.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">'+(g.icon||GEAR_SLOTS[slot].icon)+'</svg>';
  // the real weapon design (same drawing as the one held in the Swamp Adventure); falls back to the small icon if the art is missing
  let art=null;
  if(typeof WeaponArt!=="undefined"&&WeaponArt.has(g.id)){art=document.createElement("div");art.className="gr-art";art.setAttribute("role","img");art.setAttribute("aria-label",g.name+" design");const cv=document.createElement("canvas");cv.width=360;cv.height=150;WeaponArt.paint(cv,g.id,null,Skins.equippedFor(g.id));art.appendChild(cv);row.classList.add("has-art")}
  if(art)row.appendChild(art);else row.appendChild(ic);
  const body=document.createElement("div");body.className="gr-body";
  const top=document.createElement("div");top.className="gr-top";
  const nm=document.createElement("b");nm.textContent=g.name;top.appendChild(nm);
  const st=document.createElement("small");st.className="gr-state";st.textContent=g.equipped?"Equipped":"Unequipped";top.appendChild(st);
  body.appendChild(top);
  const rr=document.createElement("em");rr.className="gr-rar";rr.textContent=(g.part?g.part.charAt(0).toUpperCase()+g.part.slice(1)+" · ":"")+g.rarityName+(g.count>1?" · ×"+g.count:"");body.appendChild(rr);
  const keys=Object.keys(g.stats);
  if(keys.length){const sc=document.createElement("div");sc.className="gr-stats";keys.forEach(k=>{const c=document.createElement("span");c.className="gr-stat";c.textContent=k==="Damage"?"Damage "+Gear.hitDmg(g.id)+" per hit":k+" "+g.stats[k];sc.appendChild(c)});body.appendChild(sc)}
  if(g.desc){const ds=document.createElement("p");ds.className="gr-desc";ds.textContent=g.desc;body.appendChild(ds)}
  const b=document.createElement("button");b.type="button";b.className="gr-btn";b.textContent=g.equipped?"Unequip":"Equip";
  b.setAttribute("aria-label",(g.equipped?"Unequip ":"Equip ")+g.name);
  b.addEventListener("click",()=>{
   if(g.equipped){Gear.unequip(g.key);bagGearMsg="Unequipped "+g.name+"."}
   else{const r=Gear.equip(g.id);bagGearMsg=r.ok?"Equipped "+g.name+".":r.reason}
   bagPaintBody();
  });
  body.appendChild(b);
  if(slot==="weapons"&&Skins.forWeapon(g.id).length){const sb=document.createElement("button");sb.type="button";sb.className="gr-btn sk-open";const w=Skins.equippedFor(g.id);sb.textContent=w?"Skin: "+SKINS[w].name:"Skins";sb.setAttribute("aria-label","Open skins for "+g.name);sb.addEventListener("click",()=>skinOpen(g.id));body.appendChild(sb)}
  row.appendChild(body);list.appendChild(row);
 });
 panel.appendChild(list);
 const det=document.createElement("p");det.className="bg-detail";det.id="bgdetail";det.setAttribute("aria-live","polite");
 if(bagGearMsg){det.textContent=bagGearMsg;det.style.setProperty("--c","#f2c14e")}else det.hidden=true;
 panel.appendChild(det);
 const note=document.createElement("p");note.className="bg-note";note.textContent=slot==="armor"?"Wear one helmet, one chest piece and one pair of boots. Wear all three Rootmaw pieces for the set bonus ("+SET_BONUS.warden.text+"). Crafted gear shows up here automatically.":"One "+GEAR_SLOTS[slot].name.toLowerCase().replace(/s$/,"")+" can be equipped at a time. Crafted gear shows up here automatically.";panel.appendChild(note);
}
// the Crafting popup (its own section, like the Bag): one row per recipe with its cost, what the player has, and a Craft button (disabled until they have enough)
let craftMsg="",craftTab="";
const CRAFT_TABS=()=>Object.keys(GEAR_SLOTS).map(k=>({id:k,name:GEAR_SLOTS[k].name,icon:GEAR_SLOTS[k].icon,n:Crafting.list().filter(r=>r.gear.slot===k).length})).filter(t=>t.n);
function craftPaintPanel(panel){
 const list=document.createElement("div");list.className="cr-list";
 Crafting.list().filter(r=>r.gear.slot===craftTab).forEach(r=>{
  const row=document.createElement("div");row.className="cr-row"+(r.can?" can":"");row.style.setProperty("--c",r.gear.color);
  const top=document.createElement("div");top.className="cr-top";
  const nm=document.createElement("b");nm.textContent=r.gear.name;top.appendChild(nm);
  const ow=document.createElement("small");ow.textContent=r.gear.count?"Owned ×"+r.gear.count:r.gear.rarityName;top.appendChild(ow);
  row.appendChild(top);
  if(r.gear.desc){const ds=document.createElement("p");ds.className="cr-desc";ds.textContent=r.gear.desc;row.appendChild(ds)}
  const cs=document.createElement("div");cs.className="cr-cost";
  r.cost.forEach(c=>{const ch=document.createElement("span");ch.className="cr-chip"+(c.short?" short":"");ch.textContent=c.name+" "+Math.min(c.have,c.need)+" / "+c.need;cs.appendChild(ch)});
  row.appendChild(cs);
  const b=document.createElement("button");b.type="button";b.className="cr-btn";b.textContent=r.can?"Craft":"Need more fragments";b.disabled=!r.can;
  b.addEventListener("click",()=>{
   const res=Crafting.craft(r.id);
   craftMsg=res.ok?"Crafted "+res.gear.name+"! It is in your Bag, under "+GEAR_SLOTS[r.gear.slot].name+".":(res.reason+(res.missing.length?" Need "+res.missing.map(m=>m.short+" more "+m.name).join(", ")+".":""));
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
// On the Arcade page the Bag lives INSIDE the Your Loadout section: a <div id="bag" class="bag-inline"> in the page is filled with the very same Bag (no backdrop, no close button, always open).
// Everywhere else the Bag is still the popup.
function bagInlineHost(){const h=document.getElementById("bag");return h&&h.classList.contains("bag-inline")?h:null}
function bagBuild(){
 const inl=bagInlineHost();
 const w=inl||document.createElement("div");if(!inl){w.className="bag-wrap";w.hidden=true;w.id="bag"}
 w.innerHTML=(inl?'':'<div class="bag-back" data-x></div>')+'<div class="bag" role="'+(inl?'region':'dialog" aria-modal="true')+'" aria-labelledby="bagtitle">'+
  '<div class="bag-head"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M8 7V5a4 4 0 018 0v2"/><path d="M6 7h12l2 13a1 1 0 01-1 1H5a1 1 0 01-1-1z"/><path d="M9 13h6"/></svg><h2 id="bagtitle">Bag</h2>'+(inl?'':'<button type="button" class="bag-x" data-x aria-label="Close bag">&times;</button>')+'</div>'+
  '<div class="bg-wallet"><span class="bg-coins"><span class="coin" aria-hidden="true"></span><b>0</b><em>Swamp Coins</em></span><span class="bg-gems"><span class="gem" aria-hidden="true"></span><b>0</b><em>Swamp Crystals</em></span></div>'+
  '<div class="bg-tabs" role="tablist" aria-label="Bag sections"></div><div id="bgpanel" role="tabpanel"></div></div>';
 if(!inl)document.body.appendChild(w);
 w.addEventListener("click",e=>{if(e.target.closest("[data-x]"))bagClose()});
 w.addEventListener("keydown",e=>{
  if(!inl&&e.key==="Escape"){e.stopPropagation();e.preventDefault();bagClose();return}
  const t=e.target.closest&&e.target.closest(".bg-tab");
  if(t&&(e.key==="ArrowRight"||e.key==="ArrowLeft")){const all=[...w.querySelectorAll(".bg-tab")],i=all.indexOf(t),n=all[(i+(e.key==="ArrowRight"?1:all.length-1))%all.length];e.preventDefault();n.click()}
  if(!inl&&e.key==="Tab"){const f=[...w.querySelectorAll("button,[tabindex='0']")].filter(x=>x.tabIndex>=0&&!x.disabled);if(!f.length)return;const a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}
 },true);
 return w;
}
function bagOpen(tab){
 if(tab==="craft"){craftOpen();return}   // crafting is its own section now
 cload();try{craftClose()}catch(e){}try{skinClose()}catch(e){}try{armoryClose()}catch(e){}if(!bagEl)bagEl=bagBuild();
 if(tab)bagTab=tab;
 if(bagInlineHost()){bagPaintBody();loadoutGo("bag");try{dispatchEvent(new CustomEvent("bag:open"))}catch(e){}return}
 bagFrom=document.activeElement;bagPaintBody();
 try{const fe=document.fullscreenElement||document.webkitFullscreenElement;(fe&&fe!==document.documentElement?fe:document.body).appendChild(bagEl)}catch(e){}
 bagEl.hidden=false;document.documentElement.classList.add("bag-open");
 try{dispatchEvent(new CustomEvent("bag:open"))}catch(e){}
 const x=bagEl.querySelector(".bag-x");x&&x.focus();
}
function bagClose(){
 if(!bagEl||bagEl.hidden||bagEl.classList.contains("bag-inline"))return;
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
// On the Arcade page Crafting also lives inside Your Loadout, as the pane next to the Bag (swipe sideways between them): <div id="craft" class="craft-inline">.
function craftInlineHost(){const h=document.getElementById("craft");return h&&h.classList.contains("craft-inline")?h:null}
function craftBuild(){
 const inl=craftInlineHost();
 const w=inl||document.createElement("div");if(!inl){w.className="bag-wrap";w.hidden=true;w.id="craft"}
 w.innerHTML=(inl?'':'<div class="bag-back" data-x></div>')+'<div class="bag" role="'+(inl?'region':'dialog" aria-modal="true')+'" aria-labelledby="crafttitle">'+
  '<div class="bag-head"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M14 4l6 6-3 3-6-6z"/><path d="M11 9l-7 7 4 4 7-7"/></svg><h2 id="crafttitle">Crafting</h2>'+(inl?'':'<button type="button" class="bag-x" data-x aria-label="Close crafting">&times;</button>')+'</div>'+
  '<div class="bg-wallet"><span class="bg-coins"><span class="bg-fr" aria-hidden="true"></span><b>0</b><em>Fragments</em></span><button type="button" class="cr-bagbtn" data-bag>Open Bag</button></div>'+
  '<div class="bg-tabs" role="tablist" aria-label="Crafting sections"></div><div id="crpanel" role="tabpanel"></div></div>';
 if(!inl)document.body.appendChild(w);
 w.addEventListener("click",e=>{if(e.target.closest("[data-x]"))craftClose();else if(e.target.closest("[data-bag]"))craftClose()});
 w.addEventListener("keydown",e=>{
  if(!inl&&e.key==="Escape"){e.stopPropagation();e.preventDefault();craftClose();return}
  const t=e.target.closest&&e.target.closest(".bg-tab");
  if(t&&(e.key==="ArrowRight"||e.key==="ArrowLeft")){const all=[...w.querySelectorAll(".bg-tab")],i=all.indexOf(t),n=all[(i+(e.key==="ArrowRight"?1:all.length-1))%all.length];e.preventDefault();n.click()}
  if(!inl&&e.key==="Tab"){const f=[...w.querySelectorAll("button")].filter(x=>x.tabIndex>=0&&!x.disabled);if(!f.length)return;const a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}
 },true);
 return w;
}
function craftPaint(){
 if(!craftEl)return;
 craftEl.querySelector(".bg-coins b").textContent=Fragments.total;
 const tabs=CRAFT_TABS(),bar=craftEl.querySelector(".bg-tabs");bar.textContent="";
 if(!tabs.some(t=>t.id===craftTab))craftTab=tabs.length?tabs[0].id:"";
 tabs.forEach(t=>{
  const b=document.createElement("button");b.type="button";b.className="bg-tab";b.id="crt-"+t.id;b.setAttribute("role","tab");b.setAttribute("aria-selected",t.id===craftTab?"true":"false");b.setAttribute("aria-controls","crpanel");b.tabIndex=t.id===craftTab?0:-1;
  b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">'+t.icon+'</svg>';
  const sp=document.createElement("span");sp.textContent=t.name;b.appendChild(sp);
  const c=document.createElement("small");c.textContent=t.n;b.appendChild(c);
  b.onclick=()=>{craftTab=t.id;craftMsg="";craftPaint();const nb=craftEl.querySelector("#crt-"+t.id);nb&&nb.focus()};
  bar.appendChild(b);
 });
 const panel=craftEl.querySelector("#crpanel");panel.textContent="";panel.setAttribute("aria-labelledby","crt-"+craftTab);craftPaintPanel(panel);
}
function craftOpen(){
 cload();if(!craftEl)craftEl=craftBuild();
 if(craftInlineHost()){try{skinClose()}catch(e){}craftPaint();loadoutGo("craft");try{dispatchEvent(new CustomEvent("craft:open"))}catch(e){}return}
 try{bagClose()}catch(e){}try{skinClose()}catch(e){}
 craftFrom=document.activeElement;craftMsg="";craftPaint();
 try{const fe=document.fullscreenElement||document.webkitFullscreenElement;(fe&&fe!==document.documentElement?fe:document.body).appendChild(craftEl)}catch(e){}
 craftEl.hidden=false;document.documentElement.classList.add("bag-open");
 try{dispatchEvent(new CustomEvent("craft:open"));dispatchEvent(new CustomEvent("bag:open"))}catch(e){}
 const x=craftEl.querySelector(".bag-x");x&&x.focus();
}
function craftClose(){
 if(!craftEl||craftEl.hidden||craftEl.classList.contains("craft-inline"))return;
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
addEventListener("DOMContentLoaded",()=>{if(craftInlineHost()&&!craftEl){cload();craftEl=craftBuild();craftPaint()}paintCraft();try{loadoutPager()}catch(e){}if(location.hash==="#craft")craftOpen()});
// ---- Your Loadout (Arcade page): hero portrait, max health, weapon and armor, always showing what the game will use. Redrawn whenever the Bag changes (bagPaintBody).
// Fills the <section id="loadout"> markup in arcade.html. Does nothing on pages without it.
const LO_BASEHP=3;   // keep in step with BASEHP in adventure.html
const LO_FLAME='<svg viewBox="0 0 24 28" aria-hidden="true"><path d="M12 1C12 1 4 10 4 17a8 8 0 0016 0C20 10 12 1 12 1z"/><path class="in" d="M12 12s-3.5 3.6-3.5 6.2a3.5 3.5 0 007 0C15.5 15.6 12 12 12 12z"/></svg>';
function loadoutPaint(){
 const root=document.getElementById("loadout");if(!root)return;
 cload();
 const q=s=>root.querySelector(s);
 // portrait + name
 const an=ANIMALS.find(a=>a.id===CS.animal)||ANIMALS[0];
 q("#lo-name").textContent=an.name;
 const av=q("#lo-av");
 if(typeof AV!=="undefined"){const o=Crystals.outfit();av.innerHTML=AV.svg(o).replace('viewBox="0 0 200 200"','viewBox="22 4 156 156"');av.style.setProperty("--ac",AV.aura(o)||"#4ee6b4")}
 // max health: 3 base + worn armor (Hardy Hide picks only apply inside a run)
 const bn=Gear.bonus(),max=LO_BASEHP+bn.hp;
 q("#lo-flames").innerHTML=Array.from({length:max},()=>'<i class="fl on">'+LO_FLAME+"</i>").join("");
 q("#lo-hp").textContent=bn.hp?max+" ("+LO_BASEHP+" base +"+bn.hp+" from armor)":max+" ("+LO_BASEHP+" base)";
 q("#lo-flames").setAttribute("aria-label","Max health "+max);
 // weapon
 const wp=Gear.equipped("weapons"),cv=q("#lo-wcv"),wn=q("#lo-wname"),wi=q("#lo-winfo");
 cv.getContext("2d").clearRect(0,0,cv.width,cv.height);
 if(wp){
  if(!(typeof WeaponArt!=="undefined"&&WeaponArt.paint(cv,wp.id,null,Skins.equippedFor(wp.id))))cv.getContext("2d").clearRect(0,0,cv.width,cv.height);
  cv.hidden=false;wn.textContent=wp.name;wi.textContent=wp.rarityName+" · Damage "+Gear.hitDmg(wp.id)+" per hit";wi.style.color=wp.color;
 }else{cv.hidden=true;wn.textContent="No weapon equipped";wi.textContent="Bare hands · Damage 1 per hit";wi.style.color=""}
 // armor
 ["helmet","chest","boots"].forEach(pt=>{
  const g=Gear.equipped("armor:"+pt),el=q("#lo-"+pt);
  el.textContent=g?g.name:"Empty";el.classList.toggle("none",!g);
  if(g)el.style.setProperty("--c",g.color);else el.style.removeProperty("--c");
 });
 const sb=q("#lo-set");
 if(bn.set&&SET_BONUS[bn.set]){sb.textContent="Set bonus active";sb.classList.add("on");sb.title=SET_BONUS[bn.set].name+": "+SET_BONUS[bn.set].text}
 else{sb.textContent="Wear a full set for a bonus";sb.classList.remove("on");sb.title=""}
}
// ---- Weapon picker: the Weapon card in Your Loadout opens this popup. Pick which owned weapon to carry, and which skin it wears (Plain or any skin you own).
// "Skin Shop" jumps to the Skin Shop to buy more. Everything uses the same Gear / Skins calls as the Bag, so the Bag, the Loadout and the Swamp Adventure stay in step.
let arEl=null,arFrom=null,arMsg="";
function armoryBuild(){
 const w=document.createElement("div");w.className="bag-wrap ar-wrap";w.hidden=true;w.id="armory";
 w.innerHTML='<div class="bag-back" data-x></div><div class="bag" role="dialog" aria-modal="true" aria-labelledby="artitle">'+
  '<div class="bag-head"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M14.5 3.5l6 6-9.5 9.5-3.2.7.7-3.2zM6 18l-3 3"/></svg><h2 id="artitle">Choose Weapon &amp; Skin</h2><button type="button" class="bag-x" data-x aria-label="Close weapon picker">&times;</button></div>'+
  '<div id="arpanel"></div></div>';
 document.body.appendChild(w);
 w.addEventListener("click",e=>{if(e.target.closest("[data-x]"))armoryClose()});
 w.addEventListener("keydown",e=>{
  if(e.key==="Escape"){e.stopPropagation();e.preventDefault();armoryClose();return}
  if(e.key==="Tab"){const f=[...w.querySelectorAll("button")].filter(x=>!x.disabled);if(!f.length)return;const a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}
 },true);
 return w;
}
function armoryPaint(){
 if(!arEl)return;
 const panel=arEl.querySelector("#arpanel"),bag=arEl.querySelector(".bag"),keep=bag?bag.scrollTop:0;
 panel.textContent="";
 const items=Gear.list("weapons").sort((a,b)=>(b.equipped-a.equipped)||a.name.localeCompare(b.name));
 const sync=()=>{armoryPaint();try{loadoutPaint()}catch(e){}try{paintBag()}catch(e){}};
 if(!items.length){
  const p=document.createElement("p");p.className="bg-note";p.textContent="You don't own a weapon yet. Craft one from your fragments, then come back here to equip it and pick its skin.";panel.appendChild(p);
  const b=document.createElement("button");b.type="button";b.className="gr-btn";b.textContent="Open Crafting";b.addEventListener("click",()=>{armoryClose();try{craftOpen()}catch(e){}});panel.appendChild(b);
 }else{
  const list=document.createElement("div");list.className="gr-list";
  items.forEach(g=>{
   const row=document.createElement("div");row.className="gr-row has-art"+(g.equipped?" on":"");row.style.setProperty("--c",g.color);
   const sk=Skins.equippedFor(g.id);
   if(typeof WeaponArt!=="undefined"&&WeaponArt.has(g.id)){const art=document.createElement("div");art.className="gr-art";art.setAttribute("role","img");art.setAttribute("aria-label",g.name+" design");const cv=document.createElement("canvas");cv.width=360;cv.height=150;try{WeaponArt.paint(cv,g.id,null,sk)}catch(e){}art.appendChild(cv);row.appendChild(art)}
   const body=document.createElement("div");body.className="gr-body";
   const top=document.createElement("div");top.className="gr-top";
   const nm=document.createElement("b");nm.textContent=g.name;top.appendChild(nm);
   const st=document.createElement("small");st.className="gr-state";st.textContent=g.equipped?"Equipped":"Unequipped";top.appendChild(st);body.appendChild(top);
   const rr=document.createElement("em");rr.className="gr-rar";rr.textContent=g.rarityName+" · Damage "+Gear.hitDmg(g.id)+" per hit";body.appendChild(rr);
   const b=document.createElement("button");b.type="button";b.className="gr-btn";b.textContent=g.equipped?"Unequip":"Equip";b.setAttribute("aria-label",(g.equipped?"Unequip ":"Equip ")+g.name);
   b.addEventListener("click",()=>{if(g.equipped){Gear.unequip(g.key);arMsg="Unequipped "+g.name+"."}else{const r=Gear.equip(g.id);arMsg=r.ok?"Equipped "+g.name+".":r.reason}sync()});
   body.appendChild(b);
   // skins for this weapon: Plain + every skin you own, plus a way into the shop
   const all=Skins.forWeapon(g.id);
   if(all.length){
    const lab=document.createElement("span");lab.className="ar-lbl";lab.textContent="Skin";body.appendChild(lab);
    const chips=document.createElement("div");chips.className="ar-chips";chips.setAttribute("role","group");chips.setAttribute("aria-label","Skin for "+g.name);
    const chip=(text,on,color,fn)=>{const c=document.createElement("button");c.type="button";c.className="ar-chip"+(on?" on":"");if(color)c.style.setProperty("--c",color);c.textContent=text;c.setAttribute("aria-pressed",on?"true":"false");c.addEventListener("click",fn);chips.appendChild(c)};
    chip("Plain",!sk,"",()=>{if(sk)Skins.unequip(g.id);arMsg="Back to the plain "+g.name+".";sync()});
    all.filter(k=>k.owned).forEach(k=>chip(k.name,k.equipped,k.color,()=>{const r=Skins.equip(k.id);arMsg=r.ok?k.name+" equipped on your "+g.name+".":r.reason;sync()}));
    const left=all.filter(k=>!k.owned).length;
    chip(left?"Skin Shop · "+left+" more":"Skin Shop",false,"#f2c14e",()=>{armoryClose();skinOpen(g.id)});
    body.appendChild(chips);
   }
   row.appendChild(body);list.appendChild(row);
  });
  panel.appendChild(list);
 }
 const det=document.createElement("p");det.className="bg-detail";det.id="ardetail";det.setAttribute("aria-live","polite");
 if(arMsg){det.textContent=arMsg;det.style.setProperty("--c","#f2c14e")}else det.hidden=true;
 panel.appendChild(det);
 const note=document.createElement("p");note.className="bg-note";note.textContent="Skins are cosmetic: they change how a weapon looks, not how it fights. Only weapons you own are listed.";panel.appendChild(note);
 if(bag)bag.scrollTop=keep;
}
function armoryOpen(){
 cload();if(!arEl)arEl=armoryBuild();
 try{bagClose()}catch(e){}try{craftClose()}catch(e){}try{skinClose()}catch(e){}
 arFrom=document.activeElement;arMsg="";armoryPaint();
 arEl.hidden=false;document.documentElement.classList.add("bag-open");
 const x=arEl.querySelector(".bag-x");x&&x.focus();
}
function armoryClose(){
 if(!arEl||arEl.hidden)return;
 arEl.hidden=true;document.documentElement.classList.remove("bag-open");
 try{loadoutPaint()}catch(e){}
 try{arFrom&&arFrom.focus&&arFrom.focus()}catch(e){}
}
addEventListener("DOMContentLoaded",()=>{
 const card=document.getElementById("lo-weapon");if(!card)return;
 card.addEventListener("click",armoryOpen);
 card.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();armoryOpen()}});
});
// Bag | Crafting pager on the Arcade page: two panes side by side in a swipeable strip, with two buttons that show which one you are on.
function loadoutPane(){const t=document.getElementById("lo-track");return t?Math.round(t.scrollLeft/Math.max(1,t.clientWidth)):0}
let _lpIdx=-1,_lpBusy=false;
function loadoutMark(){
 const i=loadoutPane();if(i===_lpIdx)return;_lpIdx=i;
 document.querySelectorAll("#lo-pager [data-pane]").forEach((b,k)=>{b.setAttribute("aria-selected",k===i?"true":"false")});
}
// height follows the pane you are on; only done when the swipe has settled so nothing is re-laid-out mid-swipe
function loadoutFit(){
 const t=document.getElementById("lo-track");if(!t)return;
 loadoutMark();const p=t.children[loadoutPane()];if(p){const h=(p.offsetHeight+24)+"px";if(t.style.height!==h)t.style.height=h}
}
function loadoutGo(which){
 const t=document.getElementById("lo-track");if(!t)return;
 const i=which==="craft"?1:0;
 try{t.scrollTo({left:i*t.clientWidth,behavior:"smooth"})}catch(e){t.scrollLeft=i*t.clientWidth}
 const pg=document.getElementById("lo-pager");if(pg)try{pg.scrollIntoView({behavior:"smooth",block:"start"})}catch(e){pg.scrollIntoView()}
 loadoutMark();
}
let _lpInit=false;
function loadoutPager(){
 const t=document.getElementById("lo-track");if(!t||_lpInit)return;_lpInit=true;
 let tm=0;const settle=()=>{clearTimeout(tm);if(_lpBusy){_lpBusy=false;t.classList.remove("moving")}loadoutFit()};
 t.addEventListener("scroll",()=>{if(!_lpBusy){_lpBusy=true;t.classList.add("moving")}loadoutMark();clearTimeout(tm);tm=setTimeout(settle,110)},{passive:true});
 if("onscrollend" in window)t.addEventListener("scrollend",settle);
 addEventListener("resize",()=>{t.scrollLeft=Math.max(0,loadoutPane())*t.clientWidth;loadoutFit()});
 document.querySelectorAll("#lo-pager [data-pane]").forEach(b=>b.addEventListener("click",()=>loadoutGo(b.getAttribute("data-pane"))));
 let rf=0;if("ResizeObserver" in window){const ro=new ResizeObserver(()=>{if(_lpBusy)return;cancelAnimationFrame(rf);rf=requestAnimationFrame(loadoutFit)});[...t.children].forEach(c=>ro.observe(c))}
 loadoutFit();
}
// item count badge on any [data-bag-count]
function paintBag(){
 const n=Bag.count;document.querySelectorAll("[data-bag-count]").forEach(e=>{e.textContent=n});
 if(bagEl&&!bagEl.hidden)bagPaintBody();
 try{paintCraft()}catch(e){}
 try{if(skEl&&!skEl.hidden)skinPaint()}catch(e){}
}
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("[data-bag]");if(t){e.preventDefault();bagOpen(t.getAttribute("data-bag")||undefined)}});
addEventListener("hashchange",()=>{if(location.hash==="#bag")bagOpen()});
addEventListener("DOMContentLoaded",()=>{if(bagInlineHost()&&!bagEl){cload();bagEl=bagBuild()}paintBag();try{loadoutPaint()}catch(e){}if(location.hash==="#bag")bagOpen()});
// avatar.js can finish loading after the page: redraw the loadout portrait then
addEventListener("load",()=>{try{loadoutPaint()}catch(e){}});

// ---- The Skin Shop popup (its own section like the Bag and Crafting). Open it with Skins.open(), Skins.open("bogblaster"), any element with data-skins, the Skins button on a weapon in the Bag, or by visiting #skins.
// Each skin shows a live shimmering preview, its rarity, the weapon it is for and its Swamp Crystal price. Buying asks for a second tap to confirm.
let skEl=null,skFrom=null,skMsg="",skFocus="",skPending="",skTimer=0;
function skinBuild(){
 const w=document.createElement("div");w.className="bag-wrap sk-wrap";w.hidden=true;w.id="skins";
 w.innerHTML='<div class="bag-back" data-x></div><div class="bag" role="dialog" aria-modal="true" aria-labelledby="skintitle">'+
  '<div class="bag-head"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M12 3l2.4 5.2 5.6.7-4.1 3.9 1 5.6L12 15.6 7.1 18.4l1-5.6L4 8.9l5.6-.7z"/></svg><h2 id="skintitle">Skin Shop</h2><button type="button" class="bag-x" data-x aria-label="Close skin shop">&times;</button></div>'+
  '<div class="bg-wallet"><span class="bg-gems"><span class="gem" aria-hidden="true"></span><b>0</b><em>Swamp Crystals</em></span><button type="button" class="cr-bagbtn" data-bag>Open Bag</button></div>'+
  '<div id="skpanel"></div></div>';
 document.body.appendChild(w);
 w.addEventListener("click",e=>{if(e.target.closest("[data-x]"))skinClose();else if(e.target.closest("[data-bag]"))skinClose()});
 w.addEventListener("keydown",e=>{
  if(e.key==="Escape"){e.stopPropagation();e.preventDefault();skinClose();return}
  if(e.key==="Tab"){const f=[...w.querySelectorAll("button")].filter(x=>!x.disabled);if(!f.length)return;const a=f[0],z=f[f.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus()}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus()}}
 },true);
 return w;
}
function skinPaintPanel(panel){
 const lives=[],order=Skins.weapons().sort((a,b)=>(b===skFocus)-(a===skFocus));
 order.forEach(wid=>{
  const own=CS.gear[wid]>0,sec=document.createElement("section");sec.className="sk-sec";
  const h=document.createElement("h3");h.className="sk-h";h.textContent=GEAR[wid].name;
  const st=document.createElement("small");st.textContent=own?" · you own this weapon":" · craft it to unlock these skins";h.appendChild(st);sec.appendChild(h);
  const list=document.createElement("div");list.className="cr-list sk-list";
  Skins.forWeapon(wid).forEach(k=>{
   const row=document.createElement("div");row.className="cr-row sk-row"+(k.equipped?" on":"")+(k.owned?" owned":"");row.style.setProperty("--c",k.color);
   const art=document.createElement("div");art.className="gr-art sk-art";art.setAttribute("role","img");art.setAttribute("aria-label",k.name+" preview");
   const cv=document.createElement("canvas");cv.width=360;cv.height=150;try{WeaponArt.paint(cv,wid,null,k.id)}catch(e){}art.appendChild(cv);row.appendChild(art);
   lives.push(()=>{try{WeaponArt.live(cv,wid,k.id)}catch(e){}});
   const top=document.createElement("div");top.className="cr-top";
   const nm=document.createElement("b");nm.textContent=k.name;top.appendChild(nm);
   const sm=document.createElement("small");sm.textContent=k.equipped?"Equipped":k.owned?"Owned":k.rarityName;top.appendChild(sm);row.appendChild(top);
   const ds=document.createElement("p");ds.className="cr-desc";ds.textContent=k.rarityName+" skin for the "+k.weapon+". "+k.desc;row.appendChild(ds);
   const b=document.createElement("button");b.type="button";b.className="cr-btn";
   if(k.owned){
    b.textContent=k.equipped?"Unequip":"Equip";
    b.addEventListener("click",()=>{const r=k.equipped?Skins.unequip(wid):Skins.equip(k.id);skMsg=r.ok?(k.equipped?"Back to the plain "+k.weapon+".":k.name+" equipped."):r.reason;skPending="";skinPaint()});
   }else{
    const c=Skins.check(k.id);
    b.textContent=skPending===k.id?"Tap again to confirm · "+k.price:"Buy · "+k.price+" crystals";
    if(!c.ok&&!(c.reason.indexOf("Need")===0)){b.textContent=own?c.reason:"Craft the weapon first";b.disabled=true}
    else if(!c.ok){b.textContent=c.reason.replace("Swamp ","").replace("."," ·")+" "+k.price;b.disabled=true}
    b.addEventListener("click",()=>{
     if(skPending!==k.id){skPending=k.id;clearTimeout(skTimer);skTimer=setTimeout(()=>{skPending="";skinPaint()},4000);skMsg="Spend "+k.price+" Swamp Crystals on "+k.name+"? Tap again to confirm.";skinPaint();return}
     clearTimeout(skTimer);skPending="";const r=Skins.buy(k.id);skMsg=r.ok?"You bought "+k.name+"! It is equipped on your "+k.weapon+".":r.reason;skinPaint();
    });
   }
   row.appendChild(b);list.appendChild(row);
  });
  sec.appendChild(list);panel.appendChild(sec);
 });
 const det=document.createElement("p");det.className="bg-detail";det.id="skdetail";det.setAttribute("aria-live","polite");
 if(skMsg){det.textContent=skMsg;det.style.setProperty("--c","#f2c14e")}else det.hidden=true;
 panel.appendChild(det);
 const note=document.createElement("p");note.className="bg-note";note.textContent="Skins are cosmetic: they change how a weapon looks, not how it fights. You must own a weapon to buy its skins. Earn Swamp Crystals in the Swamp Adventure.";panel.appendChild(note);
 lives.forEach(f=>f());
}
function skinPaint(){
 if(!skEl)return;
 skEl.querySelector(".bg-gems b").textContent=CS.c;
 const panel=skEl.querySelector("#skpanel"),keep=panel.scrollTop,bag=skEl.querySelector(".bag"),k2=bag?bag.scrollTop:0;
 panel.textContent="";skinPaintPanel(panel);panel.scrollTop=keep;if(bag)bag.scrollTop=k2;
}
function skinOpen(w){
 cload();if(!skEl)skEl=skinBuild();
 try{bagClose()}catch(e){}try{craftClose()}catch(e){}try{armoryClose()}catch(e){}
 skFrom=document.activeElement;skMsg="";skPending="";skFocus=typeof w==="string"?w:"";skinPaint();
 try{const fe=document.fullscreenElement||document.webkitFullscreenElement;(fe&&fe!==document.documentElement?fe:document.body).appendChild(skEl)}catch(e){}
 skEl.hidden=false;document.documentElement.classList.add("bag-open");skinPaint();
 try{dispatchEvent(new CustomEvent("skins:open"));dispatchEvent(new CustomEvent("bag:open"))}catch(e){}
 const x=skEl.querySelector(".bag-x");x&&x.focus();
}
function skinClose(){
 if(!skEl||skEl.hidden)return;
 skEl.hidden=true;clearTimeout(skTimer);skPending="";document.documentElement.classList.remove("bag-open");
 try{dispatchEvent(new CustomEvent("skins:close"))}catch(e){}
 try{skFrom&&skFrom.focus&&skFrom.focus()}catch(e){}
 if(location.hash==="#skins")history.replaceState(null,"",location.pathname+location.search);
}
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("[data-skins]");if(t){e.preventDefault();skinOpen(t.getAttribute("data-skins")||undefined)}});
addEventListener("hashchange",()=>{if(location.hash==="#skins")skinOpen()});
addEventListener("DOMContentLoaded",()=>{if(location.hash==="#skins")skinOpen()});

// ---- header: round avatar button (top right) -> arcade.html#avatar ----
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
 const coin=n.querySelector(".bank"),html='<a class="bank cry" href="arcade.html#avatar"><span class="gem" aria-hidden="true"></span><b id="gemct">0</b></a>';
 if(coin)coin.insertAdjacentHTML("afterend",html);else n.insertAdjacentHTML("beforeend",html);
 const here=/#avatar/.test(location.hash);
 const snd=document.getElementById("snd"),link='<a class="hide" href="arcade.html#avatar"'+(here?' aria-current="page"':'')+'>Avatar</a>';
 if(snd)snd.insertAdjacentHTML("beforebegin",link);
 paintGems();
 n.insertAdjacentHTML("beforeend",'<a class="avbtn" id="avbtn" href="arcade.html#avatar" aria-label="Your avatar"'+(here?' aria-current="page"':'')+'></a>');
 addEventListener("load",()=>{
  if(typeof AV!=="undefined"){paintAv();return}
  const sc=document.createElement("script");sc.src="avatar.js";sc.onload=paintAv;document.head.appendChild(sc);
 });
})();
addEventListener("storage",e=>{if(e.key===CK){cload();paintGems();paintAv();try{paintBag()}catch(_){}}});
