// ===== SwampVerse: Swamp Crystals + avatar wallet =====
// Load AFTER cards.js on every page:  <script src="cards.js"></script><script src="store.js"></script>
// Crystals are earned from games (unlimited rounds) and spent on cosmetics for your avatar animal.
// Saved separately from coins, so cards.js is never touched.

// ---- CRYSTAL RULES: edit these ----
const CRY={
 // per game: points needed for 1 crystal, and the most crystals one round can pay
 games:{fly:{per:3,cap:30},hop:{per:4,cap:30},dash:{per:5,cap:30},memory:{per:3,cap:30},_:{per:4,cap:25}},
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
// cat: hat | face | neck | bg   (avatar.js draws each id)
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
 {id:"pond",cat:"bg",name:"Lotus Pond",price:50},
 {id:"sunset",cat:"bg",name:"Dusk Marsh",price:80},
 {id:"night",cat:"bg",name:"Firefly Night",price:120},
 {id:"dust",cat:"bg",name:"Treasure Vault",price:200},
 {id:"rainbow",cat:"bg",name:"Aurora Mist",price:300},
 {id:"moon",cat:"bg",name:"Blood Moon",price:350}
];
const CATS={hat:"Hats",face:"Faces",neck:"Neck",bg:"Backgrounds"};
const tierOf=p=>p>=350?"Mythical":p>=220?"Legendary":p>=150?"Epic":p>=80?"Rare":p>=50?"Uncommon":"Common";

// ---- saved data ----
const CK="swamp-crystals-v1";
let CS={c:0,earned:0,animal:"frog",own:{},eq:{hat:"",face:"",neck:"",bg:""},day:"",rounds:0,best:{}};
function cload(){try{CS=Object.assign(CS,JSON.parse(localStorage.getItem(CK)||"{}"))}catch(e){}CS.eq=Object.assign({hat:"",face:"",neck:"",bg:""},CS.eq);CS.own=CS.own||{};CS.best=CS.best||{}}
function csave(){try{localStorage.setItem(CK,JSON.stringify(CS))}catch(e){}paintGems()}
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
 outfit(){return{animal:CS.animal,hat:CS.eq.hat,face:CS.eq.face,neck:CS.eq.neck,bg:CS.eq.bg}}
};

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
 const lk=document.createElement("link");lk.rel="stylesheet";lk.href="ui.css";document.head.appendChild(lk);const st=document.createElement("style");
 st.textContent=".gem{display:inline-block;width:.95em;height:1.05em;margin-right:.35em;vertical-align:-.15em;background:linear-gradient(135deg,#d8fff0,#4ee6b4 45%,#14976f);clip-path:polygon(50% 0,100% 35%,50% 100%,0 35%);filter:drop-shadow(0 0 4px #4ee6b488)}.gem{flex:none}header nav .bank.cry{gap:0}html,body{overflow-x:clip}@media(max-width:639px){header{gap:8px;min-width:0}header nav{gap:6px}header .logo{font-size:20px;gap:6px;min-width:0}header nav .bank{min-height:32px;padding:5px 9px 5px 8px;font-size:14px}.snd{width:32px;height:32px}}@media(max-width:380px){header .logo{font-size:17px}header .logo .mark{width:20px;height:24px}header nav .bank{padding:5px 7px;font-size:13px}.bank .coin{margin-right:5px}}";
 document.head.appendChild(st);
 const n=document.querySelector("header nav");if(!n)return;
 const coin=n.querySelector(".bank"),html='<a class="bank cry" href="avatar.html"><span class="gem" aria-hidden="true"></span><b id="gemct">0</b></a>';
 if(coin)coin.insertAdjacentHTML("afterend",html);else n.insertAdjacentHTML("beforeend",html);
 const here=/avatar\.html/.test(location.pathname);
 const snd=document.getElementById("snd"),link='<a class="hide" href="arcade.html"'+(/arcade\.html/.test(location.pathname)?' aria-current="page"':'')+'>Arcade</a><a class="hide" href="avatar.html"'+(here?' aria-current="page"':'')+'>Avatar</a>';
 if(snd)snd.insertAdjacentHTML("beforebegin",link);
 paintGems();
})();
addEventListener("storage",e=>{if(e.key===CK){cload();paintGems()}});
