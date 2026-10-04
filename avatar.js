// ===== SwampVerse avatar drawing =====  AV.svg({animal,hat,face,neck,bg}) returns an SVG string.
const AV=(function(){
 const COL={frog:"#5cb85c",donkey:"#9a9aa8",owl:"#8b5e3c",monkey:"#7a4a2b",elephant:"#8fa3b8"};
 const eye=(x,y,r,p)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/><circle cx="${x+1}" cy="${y+1}" r="${p}" fill="#111"/>`;
 const A={
  frog:{top:50,eyes:[[76,72],[124,72]],d:c=>`<ellipse cx="100" cy="108" rx="52" ry="42" fill="${c}"/><circle cx="76" cy="70" r="17" fill="${c}"/><circle cx="124" cy="70" r="17" fill="${c}"/>${eye(76,72,11,6)}${eye(124,72,11,6)}<path d="M70 120Q100 142 130 120" fill="none" stroke="#1b3d1b" stroke-width="4" stroke-linecap="round"/><circle cx="92" cy="104" r="2" fill="#1b3d1b"/><circle cx="108" cy="104" r="2" fill="#1b3d1b"/>`},
  donkey:{top:58,eyes:[[82,98],[118,98]],d:c=>`<ellipse cx="68" cy="50" rx="12" ry="32" transform="rotate(-14 68 50)" fill="${c}"/><ellipse cx="132" cy="50" rx="12" ry="32" transform="rotate(14 132 50)" fill="${c}"/><ellipse cx="68" cy="52" rx="6" ry="22" transform="rotate(-14 68 52)" fill="#f3b6c4"/><ellipse cx="132" cy="52" rx="6" ry="22" transform="rotate(14 132 52)" fill="#f3b6c4"/><ellipse cx="100" cy="106" rx="46" ry="48" fill="${c}"/><ellipse cx="100" cy="130" rx="28" ry="20" fill="#dcdce6"/><circle cx="91" cy="130" r="3" fill="#444"/><circle cx="109" cy="130" r="3" fill="#444"/>${eye(82,98,9,4.5)}${eye(118,98,9,4.5)}`},
  owl:{top:62,eyes:[[80,102],[120,102]],d:c=>`<path d="M58 84L56 52L84 70Z M142 84L144 52L116 70Z" fill="${c}"/><ellipse cx="100" cy="114" rx="50" ry="50" fill="${c}"/><ellipse cx="100" cy="160" rx="28" ry="22" fill="#d9b48a"/><circle cx="80" cy="102" r="21" fill="#f1e3c6"/><circle cx="120" cy="102" r="21" fill="#f1e3c6"/>${eye(80,102,13,7)}${eye(120,102,13,7)}<path d="M92 116L108 116L100 132Z" fill="#f29b2c"/>`},
  monkey:{top:58,eyes:[[84,100],[116,100]],d:c=>`<circle cx="54" cy="106" r="17" fill="${c}"/><circle cx="146" cy="106" r="17" fill="${c}"/><circle cx="54" cy="106" r="9" fill="#e8a9a0"/><circle cx="146" cy="106" r="9" fill="#e8a9a0"/><circle cx="100" cy="104" r="46" fill="${c}"/><ellipse cx="100" cy="118" rx="34" ry="30" fill="#e8c39e"/>${eye(84,100,8,4)}${eye(116,100,8,4)}<circle cx="94" cy="116" r="2.5" fill="#5a3a22"/><circle cx="106" cy="116" r="2.5" fill="#5a3a22"/><path d="M84 128Q100 142 116 128" fill="none" stroke="#5a3a22" stroke-width="3.5" stroke-linecap="round"/>`},
  elephant:{top:56,eyes:[[84,96],[116,96]],d:c=>`<ellipse cx="48" cy="104" rx="28" ry="36" fill="${c}"/><ellipse cx="152" cy="104" rx="28" ry="36" fill="${c}"/><ellipse cx="50" cy="106" rx="16" ry="24" fill="#f3b6c4"/><ellipse cx="150" cy="106" rx="16" ry="24" fill="#f3b6c4"/><circle cx="100" cy="100" r="44" fill="${c}"/><path d="M88 114Q84 168 108 166Q116 164 112 156Q102 158 110 114Z" fill="${c}"/>${eye(84,96,7,3.8)}${eye(116,96,7,3.8)}`}
 };
 const HAT={
  beanie:`<path d="M56 12Q56-30 100-30Q144-30 144 12Z" fill="#15151a"/><rect x="52" y="4" width="96" height="14" rx="7" fill="#2b2b33"/>`,
  party:`<path d="M100-46L70 8H130Z" fill="#ff5fa2"/><path d="M88-18H112M80-2H120" stroke="#fff" stroke-width="4"/><circle cx="100" cy="-48" r="6" fill="#f2c14e"/>`,
  cowboy:`<ellipse cx="100" cy="6" rx="62" ry="10" fill="#8b5a2b"/><path d="M68 4Q70-34 100-30Q130-34 132 4Z" fill="#a8703a"/><rect x="68" y="-6" width="64" height="7" fill="#4a2f14"/>`,
  wizard:`<path d="M100-62L64 8H136Z" fill="#6a3fc4"/><ellipse cx="100" cy="8" rx="46" ry="8" fill="#4d2c99"/><circle cx="94" cy="-16" r="5" fill="#f2c14e"/><circle cx="112" cy="-30" r="3" fill="#f2c14e"/>`,
  halo:`<ellipse cx="100" cy="-14" rx="30" ry="8" fill="none" stroke="#f2c14e" stroke-width="6" style="filter:drop-shadow(0 0 6px #f2c14e)"/>`,
  crown:`<path d="M62 8L66-22L84-2L100-28L116-2L134-22L138 8Z" fill="#f2c14e" stroke="#b8860b" stroke-width="3" stroke-linejoin="round"/><circle cx="100" cy="-8" r="4" fill="#e83a5f"/><circle cx="76" cy="0" r="3" fill="#4ee6b4"/><circle cx="124" cy="0" r="3" fill="#4ee6b4"/>`
 };
 const FACE={
  eyepatch:e=>`<path d="M${e[0][0]-12} ${e[0][1]-10}L${e[1][0]+16} ${e[1][1]-28}" stroke="#111" stroke-width="3"/><circle cx="${e[0][0]}" cy="${e[0][1]}" r="12" fill="#111"/>`,
  shades:e=>e.map(p=>`<rect x="${p[0]-15}" y="${p[1]-9}" width="30" height="18" rx="7" fill="#111"/><path d="M${p[0]-9} ${p[1]-4}l8 0" stroke="#fff6" stroke-width="3"/>`).join("")+`<path d="M${e[0][0]+15} ${e[0][1]-3}H${e[1][0]-15}" stroke="#111" stroke-width="3"/>`,
  hearts:e=>e.map(p=>`<path transform="translate(${p[0]},${p[1]-1}) scale(1.05)" d="M0 10C-18-4-8-18 0-8C8-18 18-4 0 10Z" fill="#ff4f7b" stroke="#fff" stroke-width="2"/>`).join(""),
  monocle:e=>`<circle cx="${e[1][0]}" cy="${e[1][1]}" r="13" fill="#fff2" stroke="#f2c14e" stroke-width="3"/><path d="M${e[1][0]+10} ${e[1][1]+10}Q150 130 146 160" fill="none" stroke="#f2c14e" stroke-width="2"/>`,
  laser:e=>e.map((p,i)=>`<path d="M${p[0]} ${p[1]}L${i?200:0} ${p[1]-16}" stroke="#ff2d2d" stroke-width="5" stroke-linecap="round" style="filter:drop-shadow(0 0 5px #f00)"/><circle cx="${p[0]}" cy="${p[1]}" r="5" fill="#ff5a5a"/>`).join("")
 };
 const NECK={
  bell:`<path d="M72 146Q100 160 128 146" fill="none" stroke="#c0392b" stroke-width="4"/><circle cx="100" cy="156" r="8" fill="#f2c14e" stroke="#b8860b" stroke-width="2"/><path d="M96 158h8" stroke="#8a6508" stroke-width="2"/>`,
  bowtie:`<path d="M100 152L78 140V164Z M100 152L122 140V164Z" fill="#e83a5f"/><circle cx="100" cy="152" r="6" fill="#b01f40"/>`,
  scarf:`<path d="M60 146Q100 164 140 146L140 160Q100 178 60 160Z" fill="#d94a3a"/><path d="M118 160L132 194L110 194Z" fill="#b83a2c"/><path d="M68 154Q100 168 132 154" stroke="#f2c14e" stroke-width="3" fill="none"/>`,
  cape:`<circle cx="100" cy="150" r="5" fill="#f2c14e"/><path d="M64 144Q100 160 136 144" fill="none" stroke="#c4263f" stroke-width="6"/>`,
  chain:`<path d="M68 144Q100 188 132 144" fill="none" stroke="#f2c14e" stroke-width="5"/><circle cx="100" cy="171" r="9" fill="#f2c14e" stroke="#b8860b" stroke-width="2"/>`
 };
 const BACK={cape:`<path d="M62 142Q38 190 50 202L150 202Q162 190 138 142Z" fill="#c4263f"/>`};
 const G=(id,a,b)=>`<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="200" height="200" rx="22" fill="url(#${id})"/>`;
 const BG={
  "":`<rect width="200" height="200" rx="22" fill="#1b2314"/>`,
  pond:G("gbp","#2c6d6a","#143a3a")+`<ellipse cx="30" cy="182" rx="24" ry="7" fill="#4aa85a"/><ellipse cx="172" cy="188" rx="28" ry="8" fill="#3d9150"/><circle cx="160" cy="176" r="5" fill="#ff9ec7"/>`,
  sunset:G("gbs","#ff7b54","#7a2b6b")+`<circle cx="152" cy="118" r="28" fill="#ffd166" opacity=".9"/>`,
  night:G("gbn","#0a1230","#1d2f52")+[[30,40],[168,60],[44,150],[160,140],[100,24]].map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#ffe66d" style="filter:drop-shadow(0 0 4px #ffe66d)"><animate attributeName="opacity" values=".2;1;.2" dur="${2+i*.6}s" repeatCount="indefinite"/></circle>`).join(""),
  dust:G("gbd","#1a150a","#2e2308")+[[24,30],[170,40],[40,120],[176,110],[28,176],[150,180],[100,16],[120,60]].map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="#f2c14e" opacity=".8"/>`).join(""),
  rainbow:`<defs><linearGradient id="gbr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5f6d"/><stop offset=".25" stop-color="#ffc371"/><stop offset=".5" stop-color="#7fe07f"/><stop offset=".75" stop-color="#4db8ff"/><stop offset="1" stop-color="#a66bff"/></linearGradient></defs><rect width="200" height="200" rx="22" fill="url(#gbr)"/><ellipse cx="100" cy="196" rx="120" ry="30" fill="#fff" opacity=".35"/>`,
  moon:G("gbm","#3a0d16","#0d0508")+`<circle cx="150" cy="54" r="26" fill="#e83a3a" style="filter:drop-shadow(0 0 12px #e83a3a)"/>`
 };
 function svg(o){
  o=o||{};const an=A[o.animal]||A.frog,c=COL[o.animal]||COL.frog;
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Your swamp avatar">`+
   (BG[o.bg]||BG[""])+(BACK[o.neck]||"")+`<ellipse cx="100" cy="178" rx="40" ry="30" fill="${c}"/>`+an.d(c)+
   (NECK[o.neck]||"")+(FACE[o.face]?FACE[o.face](an.eyes):"")+(HAT[o.hat]?`<g transform="translate(0,${an.top})">${HAT[o.hat]}</g>`:"")+`</svg>`;
 }
 return{svg,animals:Object.keys(A)};
})();
