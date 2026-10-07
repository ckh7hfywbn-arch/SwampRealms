// ===== SwampRealms: shared full screen for every arcade game =====
// Games go full screen automatically the moment the player starts playing (Play, Resume, Retry, a level). Browsers only allow
// full screen after a tap or key press, so the start button IS that tap. On iPhone (no element fullscreen) it falls back to a
// page-filling view, so it works everywhere. If the player leaves full screen on purpose, we stop re-entering it until they
// press the Full screen button again (remembered for the visit).
//
// ADDING A GAME:  <script src="gamefs.js"></script> then, after the page markup:
//   GameFS.attach({stage:"#stage", start:"[data-fs-start]"});
//  - stage: the element that should fill the screen (the game plus its controls)
//  - start: a selector for every button that starts or resumes play (add data-fs-start to them)
//  - buttons with data-fs toggle full screen by hand; the F key does too. Style the full screen look with .fs on the stage and html.fs-on (see ui.css).
const GameFS={
 attach(o){
  o=o||{};
  const st=document.querySelector(o.stage||"#stage"),root=document.documentElement;
  if(!st||st.__gfs)return null;st.__gfs=1;
  const btns=[].slice.call(document.querySelectorAll(o.buttons||"[data-fs]")),startSel=o.start||"[data-fs-start]";
  const rq=st.requestFullscreen||st.webkitRequestFullscreen,ex=document.exitFullscreen||document.webkitExitFullscreen;
  const KEY="swamp-fs-off";let pseudo=false,off=false,asked=false;
  try{off=sessionStorage.getItem(KEY)==="1"}catch(e){}
  const setOff=v=>{off=v;try{v?sessionStorage.setItem(KEY,"1"):sessionStorage.removeItem(KEY)}catch(e){}};
  const real=()=>(document.fullscreenElement||document.webkitFullscreenElement)===st;
  const on=()=>real()||pseudo;
  function sync(){
   const f=on();
   st.classList.toggle("fs",f);root.classList.toggle("fs-on",f);
   btns.forEach(b=>{b.setAttribute("aria-pressed",f?"true":"false");
    if(b.classList.contains("gfs")||b.id==="fsb")b.setAttribute("aria-label",f?"Exit full screen":"Enter full screen");
    else b.textContent=f?"Exit full screen":"Full screen"});
  }
  // iPhone browsers (Safari, Opera, Chrome, Firefox all use Apple's engine) cannot fullscreen a page element: go straight to the page-filling view
  const IPHONE=/iPhone|iPod/.test(navigator.userAgent||"")||navigator.platform==="iPhone";
  let tk=0;
  function enter(){
   const my=++tk;
   if(rq&&!IPHONE){try{const p=rq.call(st);if(p&&p.catch)p.catch(()=>{pseudo=true;sync()})}catch(e){pseudo=true}}else pseudo=true;
   sync();
   // some browsers accept the call but never actually go fullscreen (no error either): check shortly, then use the page-filling view
   if(!pseudo)setTimeout(()=>{if(my===tk&&!real()&&!pseudo){pseudo=true;sync()}},500);
  }
  function leave(){
   tk++;pseudo=false;
   if(real()&&ex){try{const p=ex.call(document);if(p&&p.catch)p.catch(()=>{})}catch(e){}}
   sync();
  }
  // by hand: remember the choice so Play does not fight it
  const toggle=()=>{if(on()){setOff(true);leave()}else{setOff(false);enter()}};
  btns.forEach(b=>b.addEventListener("click",()=>{toggle();try{b.blur()}catch(e){}}));
  // automatic: called from a tap/key press that starts play
  const auto=()=>{if(!on()&&!off)enter()};
  document.addEventListener("click",e=>{
   const b=e.target.closest&&e.target.closest(startSel);
   if(b&&st.contains(b)&&!b.disabled&&b.getAttribute("aria-disabled")!=="true")auto();
  },true);
  // the browser's own exit (Esc, swipe) counts as leaving on purpose
  const chg=()=>{const was=asked;if(!real()){if(!pseudo&&was)setOff(true);pseudo=false;asked=false}else asked=true;sync()};
  document.addEventListener("fullscreenchange",chg);document.addEventListener("webkitfullscreenchange",chg);
  addEventListener("keydown",e=>{
   if(e.code==="KeyF"&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!/^(INPUT|TEXTAREA|SELECT)$/.test((e.target&&e.target.tagName)||"")){e.preventDefault();toggle()}
   else if(e.code==="Escape"&&pseudo){setOff(true);leave()}
  });
  sync();
  return{enter:()=>{setOff(false);enter()},leave:()=>{setOff(true);leave()},toggle,auto,get active(){return on()}};
 }
};
