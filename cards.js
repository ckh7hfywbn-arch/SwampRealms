// ===== Shared by index.html and catalog.html =====
// To add a card: drop its image in /images and add one line to CARDS.
const CARDS=[
 {id:"boggy",name:"Boggy the Frog",rarity:"Uncommon",color:"#5fd38d",img:"images/boggy.jpg"},
 {id:"boggy-blood-moon",name:"Boggy: Blood Moon Awakening",rarity:"Epic",color:"#a855f7",img:"images/boggy-blood-moon.jpg"},
 {id:"donk-and-friends",name:"DonK and Friends",rarity:"Common",color:"#b9bcc2",img:"images/donk-and-friends.jpg"},
 {id:"monk-and-donk-crystal-edition",name:"MonK and DonK: Crystal Edition",rarity:"Mythical",color:"#ff4fd8",img:"images/monk-and-donk-crystal-edition.jpg"},
 {id:"monk-and-donk-crystal-cave",name:"MonK and DonK: Crystal Cave",rarity:"Legendary",color:"#ff9f1c",img:"images/monk-and-donk-crystal-cave.jpg"},
 {id:"monk-and-donk",name:"MonK and DonK",rarity:"Common",color:"#b9bcc2",img:"images/monk-and-donk.jpg"},
 {id:"ellie-the-elephant",name:"Ellie the Elephant",rarity:"Uncommon",color:"#5fd38d",img:"images/ellie-the-elephant.jpg"},
 {id:"donk-and-ellie-dessert-adventure",name:"DonK and Ellie: Dessert Adventure",rarity:"Uncommon",color:"#5fd38d",img:"images/donk-and-ellie-dessert-adventure.jpg"},
 {id:"donk-and-ellie-winter-adventure",name:"DonK and Ellie: Winter Adventure",rarity:"Uncommon",color:"#5fd38d",img:"images/donk-and-ellie-winter-adventure.jpg"},
 {id:"donk-and-ellie",name:"DonK and Ellie",rarity:"Common",color:"#b9bcc2",img:"images/donk-and-ellie.jpg"}
];
// ---- PACK RULES: edit these ----
const RULES={
 dailyPacks:1,                     // free packs per day (resets at local midnight)
 codes:{HEEHAW:1,HOLDTHELINE:2},   // bonus code -> extra packs (each code works once per browser)
 coinValues:{Common:5,Uncommon:10,Rare:25,Epic:50,Legendary:100,Mythical:250},  // Swamp Coins per extra copy
 shop:{packName:"Adventures of the Swamp",packPrice:50},   // the only pack for sale, price in Swamp Coins
 game:{playsPerDay:5,seconds:20,maxCoins:10,pointsPerCoin:2},  // Fly Frenzy: rounds per day, round length, max coins per round, points needed per coin
 dropWeights:{Common:60,Uncommon:25,Rare:8,Epic:6,Legendary:1,Mythical:0.25}  // relative pull odds per rarity; only rarities that have cards count
};
const KEY="swamp-cards-v1",PK="swamp-packs-v1";
let owned={},meta={day:"",used:0,bonus:0,codes:[],coins:0,gameDay:"",gamePlays:0,gameBest:0},tick,revealing=false;
try{owned=JSON.parse(localStorage.getItem(KEY)||"{}")||{}}catch(e){}
try{meta=Object.assign(meta,JSON.parse(localStorage.getItem(PK)||"{}"))}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(owned));localStorage.setItem(PK,JSON.stringify(meta))}catch(e){}updateBank()}
const today=()=>new Date().toLocaleDateString("en-CA");
function left(){if(meta.day!==today()){meta.day=today();meta.used=0;save()}return Math.max(0,RULES.dailyPacks-meta.used)+meta.bonus}
function untilMidnight(){const n=new Date(),m=new Date(n.getFullYear(),n.getMonth(),n.getDate()+1),s=Math.floor((m-n)/1000),p=x=>String(x).padStart(2,"0");return p(Math.floor(s/3600))+":"+p(Math.floor(s%3600/60))+":"+p(s%60)}

const BACK_SVG=`<svg class="bsv" viewBox="0 0 200 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="200" height="300" fill="#0f160a"/><circle cx="100" cy="92" r="52" fill="#f2c14e" opacity=".08"/><circle cx="100" cy="92" r="34" fill="#f2c14e" opacity=".14"/><circle cx="100" cy="92" r="20" fill="#ffe08a"/><g fill="none" stroke="#7fb23a" stroke-opacity=".35"><ellipse cx="100" cy="228" rx="38" ry="7"/><ellipse cx="100" cy="228" rx="66" ry="12"/><ellipse cx="100" cy="228" rx="92" ry="17"/></g><g stroke="#4f7a24" stroke-width="3" fill="none" stroke-linecap="round"><path d="M20 300C22 255 14 228 24 196M34 300C34 262 44 240 38 214M180 300C178 255 186 228 176 196M166 300C166 262 156 240 162 214"/></g><g fill="#6b4a22"><ellipse cx="24" cy="193" rx="4" ry="11"/><ellipse cx="176" cy="193" rx="4" ry="11"/><ellipse cx="38" cy="210" rx="3.5" ry="9"/><ellipse cx="162" cy="210" rx="3.5" ry="9"/></g><path d="M0 264q25-9 50 0t50 0 50 0 50 0V300H0z" fill="#1c2a13"/><path d="M0 278q25-8 50 0t50 0 50 0 50 0V300H0z" fill="#162010"/><g fill="#5f9a2c"><ellipse cx="62" cy="248" rx="15" ry="5"/><ellipse cx="140" cy="254" rx="12" ry="4"/><ellipse cx="104" cy="270" rx="10" ry="3.5"/></g><g fill="#fff3c4"><circle cx="46" cy="140" r="1.6" opacity=".9"/><circle cx="158" cy="120" r="1.4" opacity=".8"/><circle cx="150" cy="176" r="1.8" opacity=".7"/><circle cx="52" cy="186" r="1.3" opacity=".7"/><circle cx="128" cy="62" r="1.2" opacity=".8"/></g><text x="100" y="170" text-anchor="middle" font-family="'Bagel Fat One',Impact,sans-serif" font-size="27" fill="#f2c14e" stroke="#0f160a" stroke-width="5" paint-order="stroke">SwampVerse</text><text x="100" y="186" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="800" font-size="10" fill="#f6eedb" fill-opacity=".75">Swamp Cards</text><rect x="7" y="7" width="186" height="286" rx="11" fill="none" stroke="#f2c14e" stroke-width="2.5"/><rect x="13" y="13" width="174" height="274" rx="8" fill="none" stroke="#f2c14e" stroke-opacity=".4"/></svg>`;
function cardHTML(c){const [t,u]=c.name.split(/:\s*/);return `<div class="card" style="--c:${c.color};background-image:url('${c.img}')"><span class="rar">${c.rarity}</span><div class="bar"><b>${t}</b>${u?`<small>${u}</small>`:""}</div></div>`}


// ===== Shared helpers (shop, game, catalog) =====
// ===== Pack art: "Adventures of the Swamp" (one shared drawing: open-pack stage, shop, catalog) =====
const PACK_ART=`<span class="pk-wrap"><svg class="pk-art" viewBox="0 0 200 284" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="pkBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2a13"/><stop offset="1" stop-color="#080c05"/></linearGradient><radialGradient id="pkGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#f2c14e" stop-opacity=".22"/><stop offset="1" stop-color="#f2c14e" stop-opacity="0"/></radialGradient><linearGradient id="pkGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset=".55" stop-color="#f2c14e"/><stop offset="1" stop-color="#c9962a"/></linearGradient><linearGradient id="pkFoil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ecd488"/><stop offset=".5" stop-color="#c9a23f"/><stop offset="1" stop-color="#8f6d1c"/></linearGradient><linearGradient id="pkFade" x1="0" y1="0" x2="0" y2="1"><stop offset=".6" stop-color="#080c05" stop-opacity="0"/><stop offset="1" stop-color="#080c05" stop-opacity=".75"/></linearGradient><pattern id="pkRidge" width="4" height="27" patternUnits="userSpaceOnUse"><rect width="4" height="27" fill="url(#pkFoil)"/><rect width="1" height="27" fill="#000" opacity=".22"/><rect x="1" width="1" height="27" fill="#fff" opacity=".22"/></pattern><clipPath id="pkWin"><rect x="16" y="54" width="168" height="126" rx="9"/></clipPath></defs>
<rect width="200" height="284" fill="url(#pkBody)"/><ellipse cx="100" cy="214" rx="96" ry="52" fill="url(#pkGlow)"/>
<g transform="translate(66 31) scale(.5)"><rect x="9" y="3" width="16" height="24" rx="3.5" transform="rotate(10 17 15)" fill="none" stroke="#f2c14e" stroke-opacity=".6" stroke-width="2"/><rect x="3" y="4" width="16" height="24" rx="3.5" transform="rotate(-8 11 16)" fill="#f2c14e"/><path d="M11 10.5l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z" transform="rotate(-8 11 16)" fill="#1a1405"/></g>
<text x="82" y="43.5" font-family="'Bagel Fat One',Impact,sans-serif" font-size="10.5" fill="#f6eedb" textLength="52" lengthAdjust="spacingAndGlyphs">SwampVerse</text>
<image href="images/pack-hero.jpg" x="16" y="54" width="168" height="126" preserveAspectRatio="xMidYMid slice" clip-path="url(#pkWin)"/><rect x="16" y="54" width="168" height="126" rx="9" fill="url(#pkFade)"/><rect x="16" y="54" width="168" height="126" rx="9" fill="none" stroke="url(#pkGold)" stroke-width="2.2"/>
<text x="100" y="201" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="800" font-size="12" letter-spacing="1.2" fill="#f6eedb">Adventures of the</text>
<g font-family="'Bagel Fat One',Impact,sans-serif" font-size="40" stroke-linejoin="round" lengthAdjust="spacingAndGlyphs"><text x="38" y="233" fill="#080c05" stroke="#080c05" stroke-width="5" textLength="124" lengthAdjust="spacingAndGlyphs">Swamp</text><text x="38" y="234.6" fill="#a8740f" textLength="124" lengthAdjust="spacingAndGlyphs">Swamp</text><text x="38" y="233" fill="#f6c94e" textLength="124" lengthAdjust="spacingAndGlyphs">Swamp</text></g>
<g stroke="#f2c14e" stroke-opacity=".5" stroke-width="1"><path d="M42 247H64M136 247H158"/></g><text x="100" y="249.5" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="800" font-size="8.5" letter-spacing=".8" fill="#f2c14e" fill-opacity=".9">1 random card</text>
<rect x="5" y="5" width="190" height="274" rx="12" fill="none" stroke="url(#pkGold)" stroke-width="1.8"/><rect x="9" y="9" width="182" height="266" rx="9" fill="none" stroke="#f2c14e" stroke-opacity=".28" stroke-width=".8"/>
<rect y="257" width="200" height="27" fill="url(#pkRidge)"/><path d="M0 257.5H200" stroke="#6b4d0f" stroke-width="1"/><path d="M0 258.6H200" stroke="#fff" stroke-opacity=".35" stroke-width=".8"/>
</svg></span>`;
const PACK_LABEL=PACK_ART+`<span class="strip"></span>`;

// ===== Packs: add a pack here, then give cards pack:"its-id". Cards with no pack belong to the first one. =====
const PACKS=[
 {id:"adventures",name:"Adventures of the Swamp",how:`Open one free a day, or buy it in the Shop for ${RULES.shop.packPrice} Swamp Coins.`}
];
CARDS.forEach(c=>{c.pack=c.pack||PACKS[0].id});
const packOf=c=>PACKS.find(p=>p.id===c.pack)||PACKS[0];
// re-read saved data (use before changing coins/packs so two open tabs don't overwrite each other)
function load(){
 try{owned=JSON.parse(localStorage.getItem(KEY)||"{}")||{}}catch(e){owned={}}
 try{meta=Object.assign({day:"",used:0,bonus:0,codes:[],coins:0,gameDay:"",gamePlays:0,gameBest:0},JSON.parse(localStorage.getItem(PK)||"{}"))}catch(e){}
}
function gameLeft(){if(meta.gameDay!==today()){meta.gameDay=today();meta.gamePlays=0;save()}return Math.max(0,RULES.game.playsPerDay-meta.gamePlays)}
function pulse(el,cls){el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls)}
// little chips showing what an extra copy is worth, by rarity (only rarities that exist in CARDS)
function ratesHTML(){const seen={};CARDS.forEach(c=>seen[c.rarity]=c.color);
 return Object.keys(seen).sort((a,b)=>(RULES.coinValues[a]||0)-(RULES.coinValues[b]||0)).map(r=>`<li style="--c:${seen[r]}"><i></i>${r}<span class="coin"></span>${RULES.coinValues[r]||0}</li>`).join("")}

// ===== Motion helpers: scroll reveal + header shadow (shared by both pages) =====
(function(){
 const show=()=>{document.querySelectorAll(".reveal").forEach(x=>x.classList.add("in"));window.__rv=1};
 try{
  const h=document.querySelector("header");
  if(h){const f=()=>h.classList.toggle("scrolled",scrollY>8);f();addEventListener("scroll",f,{passive:true})}
  if(!("IntersectionObserver" in window)){show();return}
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}}),{threshold:.08,rootMargin:"0px 0px -6% 0px"});
  document.querySelectorAll(".reveal").forEach(x=>io.observe(x));window.__rv=1;
 }catch(e){show()}
})();

// iPhone/Safari can restore a page from memory with old pack and coin counts when you tap Back; reload so they are always current
addEventListener("pageshow",e=>{if(e.persisted)location.reload()});


// ===== Coin bank (top right of the header, every page) =====
var _bk=null;
function updateBank(){
 var e=document.getElementById("bankct");if(!e)return;
 var v=meta.coins||0,b=e.parentNode;
 if(_bk!==null&&v!==_bk){b.classList.remove("bump");void b.offsetWidth;b.classList.add("bump")}
 _bk=v;e.textContent=v;b.setAttribute("aria-label","Swamp Coins: "+v+". Open the shop");
}
(function(){
 var n=document.querySelector("header nav");if(!n||document.getElementById("bankct"))return;
 n.insertAdjacentHTML("beforeend",'<a class="bank" href="shop.html"><span class="coin" aria-hidden="true"></span><b id="bankct">0</b></a>');
 updateBank();
})();
