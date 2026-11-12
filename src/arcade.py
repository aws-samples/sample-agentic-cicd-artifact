"""The deployed artifact: THE FALL OF TROY, a 90s 16-bit-era 2D scene.

640x360 canvas, gradient night sky, parallax city, shaded stonework and
wood grain, sprite cast per the epic (Odysseus in the boar-tusk helmet,
Agamemnon red-crested). While Troy burns, Zeus appears among the storm
clouds, glowering down at the broken guest-law. The horse idles at the
gate; the assault begins only when the viewer presses START. ?auto=1
starts it automatically (used by the pipeline's screenshot checks).

Sound is chiptune WebAudio and works on iPhone: the audio session is
promoted to 'playback' (so the mute switch does not silence it), the
context is resumed inside the START gesture, and any later tap resumes
a context the ?auto=1 path had to create suspended.
"""

HTML = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>THE FALL OF TROY</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html,body{margin:0;background:#000;height:100%;overflow:hidden}
  #wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%}
  canvas{image-rendering:pixelated;border:3px solid #1a1f2e;box-shadow:0 0 60px #123,0 0 120px #0a1626}
  #hud{color:#8fd48f;font:15px monospace;margin:8px;letter-spacing:3px;text-shadow:0 0 8px #2a4}
  #hud2{color:#9aa7b8;font:11px monospace;margin-top:6px}
  #dedication,#visitor-dedication{color:#efe9cd}
  #start{position:absolute;color:#ffd75e;font:bold 30px monospace;text-align:center;
         top:58%;width:100%;cursor:pointer;text-shadow:0 2px 0 #7a4a00,0 0 18px #f80;
         background:none;border:0;padding:0}
  #start:focus-visible{outline:3px solid #ffd75e;outline-offset:6px}
  .sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;
           clip:rect(0 0 0 0);white-space:nowrap;border:0}
  .blink{animation:b 1.1s steps(1) infinite}@keyframes b{50%{opacity:0}}
  @media (prefers-reduced-motion: reduce){.blink{animation:none}}
</style></head><body>
<div id="wrap">
  <h1 id="hud">THE FALL OF TROY &nbsp;·&nbsp; SCORE 001186 &nbsp;·&nbsp; HI 001184</h1>
  <canvas id="c" width="640" height="360" role="img"
    aria-label="A 16-bit scene of the fall of Troy: the wooden horse waits outside the city
                gate, is hauled inside, and Troy burns as Zeus looks on while Aeneas
                carries his father out of the city.">
    The Trojan Horse is brought inside the walls of Troy; the city burns while Zeus
    watches from the storm clouds. This is decorative animation.
  </canvas>
  <p id="dedication">TO ATHENA &middot; FOR RE:INVENT 2026 &middot; THE GREEKS DEDICATE THIS OFFERING</p>
  <p id="narration" class="sr-only" role="status" aria-live="polite"></p>
  <div id="hud2">Troy delivery demo · AI review, automated checks, and staged releases · <!--RELEASE_VERSION--></div>
  <div id="visitor-dedication" aria-live="polite"><!--VISITOR_DEDICATION--></div>
</div>
<button id="start" class="blink" type="button"
        aria-label="Press start to watch the fall of Troy">▶ PRESS START</button>
<script>
const cv=document.getElementById('c'),g=cv.getContext('2d');
const REDUCED=matchMedia('(prefers-reduced-motion: reduce)').matches;
const W=640,H=360,GY=300; // ground line
let t=0,mode='idle',phase=0,lastCap='',horseX=150,squad=[],army=[],flames=[],embers=[],smoke=[],
    ms0=performance.now(),pT=0,gate=0,ac=null;
const stars=[...Array(110)].map(()=>[Math.random()*W|0,Math.random()*220|0,Math.random()<.3?2:1]);
const clouds=[...Array(4)].map((_,i)=>({x:i*180+Math.random()*80,y:26+i*22,w:90+Math.random()*70}));
function px(x,y,w,h,c){g.fillStyle=c;g.fillRect(x|0,y|0,w,h)}
function pa(x,y,w,h,c,a){g.globalAlpha=a;px(x,y,w,h,c);g.globalAlpha=1}

let WX=430,WW=46,GX=WX+3,GW=40,GH=96,screen='ext',fade=0; // wall x, width; gate arch (sized to swallow the horse)
function sky(){
  const gr=g.createLinearGradient(0,0,0,GY);
  gr.addColorStop(0,'#04030e');gr.addColorStop(.55,'#0a0821');gr.addColorStop(1,'#1b1436');
  g.fillStyle=gr;g.fillRect(0,0,W,GY);
  stars.forEach(s=>{const tw=.4+.6*Math.abs(Math.sin(t*.02+s[0]));
    pa(s[0],s[1],s[2],s[2],'#cdd8ff',tw*.9)});
  px(88,56,20,20,'#efe9cd');px(86,60,24,12,'#efe9cd');px(92,54,12,24,'#efe9cd');
  px(96,62,4,4,'#cfc7a4');px(102,68,3,3,'#cfc7a4');px(93,70,2,2,'#cfc7a4');
  clouds.forEach(c=>{c.x=(c.x+.06)%(W+140);const x=c.x-70;
    pa(x,c.y,c.w,10,'#2a2f4e',.5);pa(x+10,c.y-5,c.w*.6,8,'#343a5e',.45);
    pa(x+c.w*.25,c.y+6,c.w*.55,6,'#232848',.5)});
}
function ground(){
  const gr=g.createLinearGradient(0,GY,0,H);
  gr.addColorStop(0,'#2a2043');gr.addColorStop(1,'#150f28');
  g.fillStyle=gr;g.fillRect(0,GY,W,H-GY);
  px(0,GY,W,2,'#3b3160');
  for(let i=0;i<180;i++)pa((i*97)%W,GY+8+(i*53)%(H-GY-10),2,1,'#453a6e',.35);
}
function archPassage(){ // the dark way through the wall — drawn BEHIND the horse
  px(GX,GY-GH,GW,GH,'#0d0b18');
  pa(GX+2,GY-GH+8,GW-4,GH-10,'#1c1428',.55);                 // inner depth
  pa(GX+GW/2-4,GY-44,9,44,'#ff8c1a',.05+.03*Math.sin(t*.2)); // torchlight from inside
}
function wall(){
  g.save();                                   // face + stones get a REAL hole at the arch
  g.beginPath();g.rect(0,0,W,H);g.rect(GX,GY-GH,GW,GH);g.clip('evenodd');
  const sg=g.createLinearGradient(WX,0,WX+WW,0);
  sg.addColorStop(0,'#8b95a3');sg.addColorStop(.5,'#67707e');sg.addColorStop(1,'#454d59');
  g.fillStyle=sg;g.fillRect(WX,96,WW,GY-96);
  for(let r=0;r<17;r++)for(let q=0;q<3;q++){                 // stone courses
    const off=(r%2)*7;
    pa(WX+2+q*14+off,100+r*12,12,10,(r+q)%2?'#77818f':'#5d6673',.55);
    pa(WX+2+q*14+off,100+r*12,12,2,'#98a2b0',.35)}
  for(let i=0;i<4;i++){px(WX-2+i*12,86,9,12,'#78848f');px(WX-2+i*12,86,9,3,'#98a2b0')}
  g.restore();
  // gate arch header + doors (two panels swing inward as gate grows)
  px(GX-3,GY-GH-8,GW+6,10,'#78848f');px(GX-3,GY-GH-8,GW+6,3,'#98a2b0');
  const sw=Math.min(GW/2,gate*.35);
  px(GX+sw-3,GY-GH+2,3,GH-2,'#2e2414');                     // left door edge
  px(GX+GW-sw,GY-GH+2,3,GH-2,'#2e2414');                    // right door edge
  if(gate<1){const dg=g.createLinearGradient(0,GY-GH,0,GY);
    dg.addColorStop(0,'#4a3a20');dg.addColorStop(1,'#2e2414');
    g.fillStyle=dg;g.fillRect(GX,GY-GH+2,GW,GH-2);
    px(GX+GW/2-1,GY-GH+2,2,GH-2,'#1d1710');
    for(let i=0;i<4;i++){px(GX+3,GY-GH+10+i*14,GW-6,2,'#5d4a28')}}
  // torches
  [[WX-8,150],[WX-8,230]].forEach(([x,y])=>{
    px(x,y,3,14,'#4a3320');
    const f=Math.sin(t*.3+x)*2;
    pa(x-3,y-10+f*.3,9,10,'#ff5a1f',.5);px(x,y-8+f*.4,3,7,'#ffb31a');px(x+1,y-9,1,4,'#fff3b0');
    pa(x-8,y-14,19,22,'#ff8c1a',.10+.04*Math.sin(t*.2))});
}
function horse(x,y,scale){ // 16-bit wooden horse; smaller scale once inside
  const s=scale||1,bob=mode==='idle'?Math.sin(t*.05)*1.5:0;
  g.save();g.translate(x,y+bob);g.scale(s,s);
  const P=(a,b,c,d,e)=>px(a,b,c,d,e);
  P(-4,-12,66,6,'#3d2a16');P(-4,-12,66,2,'#5a3f22');
  for(let w=0;w<3;w++){P(2+w*22,-8,14,14,'#4a3018');P(6+w*22,-4,6,6,'#241708');
    P(8+w*22,-8,2,14,'#2e1d0c');P(2+w*22,-2,14,2,'#2e1d0c')}
  const bg=g.createLinearGradient(0,-58,0,-24);
  bg.addColorStop(0,'#a5713a');bg.addColorStop(.5,'#8a5a2b');bg.addColorStop(1,'#6b4420');
  g.fillStyle=bg;g.fillRect(4,-58,48,34);
  for(let i=1;i<5;i++){P(4,-58+i*7,48,1,'#5b3a1c');P(4,-56+i*7,48,1,'rgba(255,220,160,.12)')}
  P(4,-58,48,2,'#c08a4a');
  P(9,-26,6,14,'#6b4420');P(24,-26,6,14,'#75491f');P(40,-26,6,14,'#6b4420');
  P(9,-26,2,14,'#4a2e12');P(40,-26,2,14,'#4a2e12');
  P(44,-76,10,20,'#8a5a2b');P(42,-72,6,10,'#75491f');
  P(48,-86,16,12,'#8a5a2b');P(60,-82,6,5,'#a5713a');
  P(58,-84,3,3,'#120b04');P(59,-83,1,1,'#ffd77a');
  P(50,-90,3,6,'#5b3a1c');P(55,-90,3,6,'#5b3a1c');
  for(let i=0;i<6;i++)P(44+i,-88+i*3,3,4,'#4a2e12');
  P(2,-54,4,16,'#5b3a1c');P(0,-42,3,10,'#4a2e12');
  P(22,-38,12,12,'#3d2a16');P(22,-38,12,2,'#5a3f22');
  if(mode==='assault'&&phase>=1&&phase<3)P(27,-26,2,26,'#c9b48a');
  g.restore();
}
function warrior(s){
  const f=(t>>3)%2, X=s.x|0, Y=s.y|0, sc=s.sc||1;
  g.save();g.translate(X,Y);g.scale(sc,sc);
  if(s.kind==='ody'){
    px(0,-22,8,3,'#efe6cc');px(0,-19,8,2,'#cabf9e');px(0,-17,8,2,'#efe6cc');
    px(1,-15,6,1,'#8f866c');
    px(1,-14,6,4,'#d9a76e');px(2,-13,1,1,'#221108');
    px(0,-10,8,8,'#7a4a1f');px(0,-7,8,1,'#5a3617');
    px(-4,-11,4,9,'#5a3617');px(-3,-8,2,2,'#c9a227');
  }else if(s.kind==='aeneas'){
    // Aeneas, with Anchises carried on his shoulders. Two figures in one
    // sprite: the father sits above the son's shoulder line, which is why his
    // pixels are drawn at a negative offset from the walking body.
    px(1,-38,6,3,'#cfc3a4');px(2,-35,4,3,'#d9a76e');px(3,-34,1,1,'#221108');
    px(0,-32,8,6,'#8b6f47');px(-2,-31,2,5,'#8b6f47');px(8,-31,2,5,'#8b6f47');
    px(1,-24,6,3,'#b5651d');px(1,-21,6,1,'#8a4a12');
    px(1,-20,6,4,'#d9a76e');px(2,-19,1,1,'#221108');
    px(0,-16,8,9,'#a0522d');px(0,-13,8,1,'#7b3f21');
    px(f?0:2,-7,3,7,'#d9a76e');px(f?5:3,-7,3,7,'#c8965f');
  }else if(s.kind==='aga'){
    px(1,-26,6,3,'#c0392b');px(3,-29,2,3,'#c0392b');px(5,-27,3,2,'#a02f22');
    px(0,-23,8,4,'#d4af37');px(0,-21,8,1,'#8a6f14');
    px(1,-19,6,4,'#d9a76e');px(2,-18,1,1,'#221108');
    px(0,-15,8,9,'#d4af37');px(0,-12,8,1,'#8a6f14');px(0,-9,8,1,'#8a6f14');
    px(-5,-16,5,11,'#8c2f24');px(-4,-12,3,3,'#ffd75e');
    px(8,-30,2,24,'#b8ae8f');px(8,-32,2,3,'#c9a227');
  }else{
    px(1,-20,6,4,'#b08d24');px(1,-18,6,1,'#8a6f14');
    px(2,-16,4,3,'#d9a76e');
    px(1,-13,6,7,'#8c2f24');px(1,-10,6,1,'#6e2118');
    px(7,-26,2,20,'#b8ae8f');
    px(-3,-13,3,8,'#5a3617');
  }
  if(f)px(1,-2,2,2,'#d9a76e');else px(4,-2,2,2,'#d9a76e');
  g.restore();
}
function fx(){
  flames.forEach(f=>{const w=Math.sin(t*.21+f.x)*2.5, h=f.h+Math.sin(t*.33+f.x*2)*4;
    pa(f.x-5,f.y-h*.5,13,h*.55,'#a3170a',.85);
    pa(f.x-3+w*.4,f.y-h*.78,9,h*.62,'#ff5a1f',.9);
    px(f.x-1+w*.6,f.y-h,5,h*.6,'#ffb31a');
    px(f.x+w*.8,f.y-h,2,h*.35,'#fff3b0');
    pa(f.x-8,f.y-h-4,19,h+8,'#ff8c1a',.08);
    if((t+f.x|0)%4<1)embers.push({x:f.x+2,y:f.y-h,vy:-.5-Math.random()*.6,life:34+Math.random()*26});
    if((t+f.x|0)%9<1)smoke.push({x:f.x,y:f.y-h-2,r:3,life:70})});
  embers=embers.filter(e=>e.life-->0);
  embers.forEach(e=>{e.y+=e.vy;e.x+=Math.sin(t*.2+e.life)*.4;
    px(e.x,e.y,2,2,e.life>20?'#ffd77a':'#ff5a1f')});
  smoke=smoke.filter(s=>s.life-->0);
  smoke.forEach(s=>{s.y-=.5;s.x+=Math.sin(t*.05+s.life)*.3;s.r+=.09;
    pa(s.x-s.r,s.y-s.r,s.r*2,s.r*2,'#5a5a6e',Math.min(.3,s.life/220))});
}
let statueA=0, statueVA=0, zeusA=0, aeneas=null;
function cityInt(){
  const B=[[300,214,64,86],[386,196,70,104],[560,224,60,76]];
  B.forEach(([x,y,w,h],i)=>{const c=['#5e4c42','#6a5547','#645042'][i];
    px(x,y,w,h,c);px(x,y,w,3,'#7d6754');px(x,y,3,h,'#4a3b34');
    for(let r=0;r<3;r++)for(let q=0;q<3;q++){
      const lit=((t>>6)+r*3+q+i)%4>0;
      px(x+8+q*((w-16)/3),y+12+r*24,7,10,lit?'#ffd77a':'#2b2126');
      if(lit)pa(x+7+q*((w-16)/3),y+11+r*24,9,12,'#ffb43a',.25)}});
  const TX=470,TW=84,TY=300;
  px(TX-4,TY-6,TW+8,6,'#8d8577');px(TX-2,TY-10,TW+4,4,'#9d9587');
  for(let i=0;i<4;i++){px(TX+6+i*20,TY-58,8,48,'#b0a795');
    px(TX+6+i*20,TY-58,2,48,'#8d8577');px(TX+5+i*20,TY-60,10,3,'#c4bba9')}
  px(TX,TY-66,TW,8,'#9d9587');
  g.fillStyle='#b0a795';g.beginPath();g.moveTo(TX-2,TY-66);
  g.lineTo(TX+TW/2,TY-84);g.lineTo(TX+TW+2,TY-66);g.fill();
  pa(TX+10,TY-52,TW-20,40,'#1d1626',.5);
}
function statue(){
  const SX=452,SY=300;
  g.save();g.translate(SX,SY);
  px(-8,-8,16,8,'#8d8577');px(-6,-10,12,2,'#9d9587');
  g.rotate(statueA);
  px(-3,-34,6,24,'#cfc7b6');
  px(-4,-14,8,4,'#bfb7a6');
  px(-2,-40,5,6,'#cfc7b6');px(-1,-42,4,2,'#b8ae8f');
  px(1,-44,2,3,'#a89f8c');
  px(-7,-30,3,14,'#bfb7a6');
  px(5,-46,2,20,'#8d8577');
  g.restore();
}
function zeus(a){ // Zeus Xenios among the storm clouds, glowering at the sack
  const cyc=t%210, fl=!REDUCED&&(cyc<5||(cyc>9&&cyc<13)); // strobe; off for reduced-motion
  g.save();g.translate(205,120);g.scale(2.2,2.2);
  const zp=(x,y,w,h,c,al)=>{g.globalAlpha=a*(al===undefined?1:al);
    g.fillStyle=c;g.fillRect(x|0,y|0,w,h)};
  // parted storm clouds framing him
  zp(-34,-24,68,12,'#1b1830',.75);zp(-40,-16,26,10,'#232041',.7);
  zp(16,-18,26,11,'#232041',.7);zp(-30,-27,56,4,'#343a5e',.5);
  zp(-44,4,18,26,'#1b1830',.65);zp(26,2,20,28,'#1b1830',.65);
  // hair
  zp(-14,-16,28,6,'#e8e4da');zp(-18,-12,6,12,'#cfc9bd');zp(12,-12,6,12,'#cfc9bd');
  zp(-14,-18,10,3,'#f4f1ea');zp(4,-18,10,3,'#f4f1ea');
  // forehead + cheeks + nose
  zp(-10,-12,20,6,'#e2c39a');zp(-10,-6,3,8,'#e2c39a');zp(7,-6,3,8,'#e2c39a');
  zp(-1,-4,2,7,'#c9a077');
  // furrowed brow — inner ends dip: the disapproval
  zp(-9,-6,4,2,'#6b5232');zp(-5,-5,4,2,'#6b5232');
  zp(1,-5,4,2,'#6b5232');zp(5,-6,4,2,'#6b5232');
  // eyes cast DOWN at the burning city
  zp(-8,-3,5,3,fl?'#fff3b0':'#f2e9cf');zp(-6,-1,2,2,'#221108');
  zp(3,-3,5,3,fl?'#fff3b0':'#f2e9cf');zp(5,-1,2,2,'#221108');
  if(fl){zp(-9,-4,7,5,'#ffd75e',.35);zp(2,-4,7,5,'#ffd75e',.35)}
  // mustache + great beard
  zp(-7,3,14,3,'#e8e4da');
  zp(-12,5,24,8,'#e8e4da');zp(-10,13,20,7,'#dcd7cb');
  zp(-7,20,14,6,'#cfc9bd');zp(-4,26,8,4,'#c2bcae');
  zp(-8,7,2,14,'#b8b2a4',.6);zp(0,8,2,16,'#b8b2a4',.6);zp(6,7,2,12,'#b8b2a4',.6);
  // the bolt in his fist, flickering with the strobe
  if(fl){zp(20,-6,3,7,'#fff3b0');zp(22,1,3,7,'#ffd75e');zp(19,8,3,7,'#fff3b0');
    zp(17,-8,10,26,'#ffd75e',.18)}
  g.globalAlpha=1;g.restore();
  if(fl)pa(0,0,W,GY,'#e8ecff',.07*a);                    // sheet lightning over the sky
}
function wallInt(){
  const sg=g.createLinearGradient(0,0,58,0);
  sg.addColorStop(0,'#454d59');sg.addColorStop(.6,'#67707e');sg.addColorStop(1,'#8b95a3');
  g.fillStyle=sg;g.fillRect(0,96,58,GY-96);
  for(let r=0;r<17;r++)for(let q=0;q<4;q++){const off=(r%2)*6;
    pa(2+q*14+off,100+r*12,12,10,(r+q)%2?'#77818f':'#5d6673',.5);
    pa(2+q*14+off,100+r*12,12,2,'#98a2b0',.3)}
  for(let i=0;i<4;i++){px(2+i*14,86,10,12,'#78848f');px(2+i*14,86,10,3,'#98a2b0')}
  px(8,234,3,14,'#4a3320');
  const fl=Math.sin(t*.3)*2;
  pa(5,224+fl*.3,9,10,'#ff5a1f',.5);px(8,226+fl*.4,3,7,'#ffb31a');
  const IGX=10,IGW=40;
  px(IGX-3,GY-GH-8,IGW+6,10,'#78848f');
  px(IGX,GY-GH,IGW,GH,'#0d0b18');
  if(gate<1){const dg=g.createLinearGradient(0,GY-GH,0,GY);
    dg.addColorStop(0,'#4a3a20');dg.addColorStop(1,'#2e2414');
    g.fillStyle=dg;g.fillRect(IGX,GY-GH+2,IGW,GH-2);
    px(IGX+IGW/2-1,GY-GH+2,2,GH-2,'#1d1710');
    for(let i=0;i<4;i++)px(IGX+3,GY-GH+10+i*14,IGW-6,2,'#5d4a28')}
  else{const sw=Math.min(IGW/2,gate*.35);
    px(IGX+sw-3,GY-GH+2,3,GH-2,'#2e2414');px(IGX+IGW-sw,GY-GH+2,3,GH-2,'#2e2414')}
}
function update(sec){
  if(mode==='idle'){horseX=Math.min(horseX+.12,GX-80);return}
  if(screen==='ext'){
    if(phase===0){gate=Math.min(GH,gate+.7);if(gate>=GH*.85){phase=1;pT=sec}}
    else if(phase===1){horseX+=.62;
      if(horseX-4>GX+GW){fade=Math.min(1,fade+.05);   // tail swallowed by the passage
        if(fade>=1){screen='int';phase=2;pT=sec;horseX=236;gate=0}}}
  }else{
    fade=Math.max(0,fade-.05);
    if(phase===2){if(sec-pT>2){phase=3;pT=sec;
      squad.push({x:horseX+18,y:GY,kind:'ody',vx:-.55});
      for(let i=1;i<4;i++)squad.push({x:horseX+18+i*5,y:GY,kind:'man',vx:-.5})}}
    else if(phase===3){squad.forEach(s=>{s.x=Math.max(s.x+s.vx,46)});
      if(sec-pT>4.5){phase=4;pT=sec}}
    else if(phase===4){gate=Math.min(GH,gate+.9);
      if(gate>=GH){phase=5;pT=sec;
        for(let i=0;i<9;i++)army.push({x:-16-i*15,y:GY,kind:i?'man':'aga',vx:1.05})}}
    else if(phase===5){army.forEach(a=>{a.x+=a.vx});
      // One family leaving while the city falls. Spawned once, walks off the
      // left edge, then stops moving - no per-frame allocation.
      if(!aeneas&&flames.length>8)aeneas={x:430,y:GY,sc:1.15,kind:'aeneas'};
      if(aeneas&&!REDUCED)aeneas.x-=.32;   // reduced motion: he stands, still carried
      army=army.filter(a=>a.x<600);
      if(statueVA>0||army.some(a=>a.x>424)){statueVA+=.0022;
        statueA=Math.min(1.45,statueA+statueVA)}
      if(statueA>.02&&flames.length<26&&Math.random()<.06)
        flames.push({x:300+Math.random()*300,y:202+Math.random()*94,h:12+Math.random()*9});
      if(flames.length>5)zeusA=Math.min(1,zeusA+.012);   // the god fades in over the fire
      if(zeusA>.5&&t%210===0&&ac){noise(.6,.05);note(55,'sawtooth',.04,.7)} // thunder
      if(sec-pT>24){reset()}}
  }
}
function draw(){
  const sec=(performance.now()-ms0)/1000;
  update(sec);
  sky();ground();
  if(screen==='ext'){
    archPassage();                                    // dark passage behind the horse
    g.save();g.beginPath();g.rect(0,0,GX+GW-2,H);g.clip(); // nothing renders past the arch —
    horse(horseX,GY,1);                               // the horse is swallowed by the dark
    g.restore();
    if(gate>1)pa(GX,GY-GH,GW,GH,'#0d0b18',.38);       // passage gloom dims what's inside
    wall();
  }else{
    if(aeneas)warrior(aeneas);
    if(zeusA>0)zeus(zeusA);
    cityInt();statue();
    if(phase>=5)fx();
    horse(horseX,GY,1);
    squad.forEach(warrior);army.forEach(warrior);
    wallInt();
  }
  if(fade>0)pa(0,0,W,H,'#000',fade);
  g.textAlign='center';g.font='bold 22px monospace';
  const cap=mode==='idle'?'BEWARE GEEKS BEARING GIFTS':
    screen==='ext'?(phase===0?'THE TROJANS OPEN THE GATE':'THE GIFT IS TAKEN INSIDE'):
    phase===2?'NIGHT FALLS WITHIN THE WALLS':
    phase===3?'ODYSSEUS DESCENDS':
    phase===4?'THE GATE OPENS FROM WITHIN':
    phase===5?([('TROY BURNS'),'',(zeusA>.3?'ZEUS SEES THE BROKEN GUEST-LAW':'TROY BURNS'),'',(aeneas?'AENEAS CARRIES HIS FATHER OUT':''),''][(t>>5)%6]):'';
  if(cap){g.fillStyle='#2b1c00';g.fillText(cap,W/2+2,44);
    g.fillStyle='#ffd75e';g.fillText(cap,W/2,42)}
  if(cap&&cap!==lastCap){lastCap=cap;                       // narrate to assistive tech
    document.getElementById('narration').textContent=cap.toLowerCase()}
  g.font='10px monospace';g.fillStyle='#9aa7b8';
  g.fillText('© 1186 BC ODYSSEY CORP',W/2,H-8);
  t++;requestAnimationFrame(draw)}
function reset(){mode='idle';screen='ext';phase=0;horseX=150;gate=0;fade=0;
  statueA=0;statueVA=0;zeusA=0;aeneas=null;squad=[];army=[];flames=[];embers=[];smoke=[];
  ms0=performance.now();pT=0;
  document.getElementById('start').style.display=''}
function fit(){const a=W/H,vw=innerWidth*.94,vh=innerHeight*.8;
  let w=vw,h=w/a;if(h>vh){h=vh;w=h*a}
  cv.style.width=(w|0)+'px';cv.style.height=(h|0)+'px'}
addEventListener('resize',fit);fit();
function note(f,type,vol,d){if(!ac)return;const o=ac.createOscillator(),v=ac.createGain();
  o.type=type;o.frequency.value=f;v.gain.value=vol;o.connect(v);v.connect(ac.destination);
  o.start();v.gain.exponentialRampToValueAtTime(.001,ac.currentTime+d);o.stop(ac.currentTime+d)}
function noise(d,vol){if(!ac)return;const b=ac.createBuffer(1,4410,44100),x=b.getChannelData(0);
  for(let i=0;i<4410;i++)x[i]=Math.random()*2-1;const s=ac.createBufferSource(),v=ac.createGain();
  s.buffer=b;v.gain.value=vol||.02;s.connect(v);v.connect(ac.destination);s.start();
  v.gain.exponentialRampToValueAtTime(.001,ac.currentTime+d);s.stop(ac.currentTime+d)}
const LEAD=[220,262,330,262,349,330,262,220,196,220,262,220,330,262,220,196,
            220,262,330,392,330,262,220,262,175,196,220,262,220,196,175,147];
const BASS=[110,0,110,0,87,0,98,0,110,0,110,0,87,0,98,0];
function music(){const step=60/132/2;let i=0;
  setInterval(()=>{if(mode!=='assault')return;
    const l=LEAD[i%LEAD.length];if(l)note(l,'square',.045,step*.9);
    const b=BASS[i%BASS.length];if(b)note(b,'triangle',.09,step*1.8);
    if(i%8===0)noise(step*.4,.018);i++},step*1000)}
function audioUp(){ // iPhone-safe bring-up; call from inside a user gesture when possible
  try{if(navigator.audioSession)navigator.audioSession.type='playback'}catch(e){} // Safari 16.4+: play through the mute switch
  if(!ac){ac=new (window.AudioContext||window.webkitAudioContext)();music()}
  if(ac.state==='suspended')ac.resume();
  try{const b=ac.createBuffer(1,1,22050),s=ac.createBufferSource(); // classic iOS unlock: silent buffer inside the gesture
    s.buffer=b;s.connect(ac.destination);s.start(0)}catch(e){}
}
function begin(){if(mode==='assault')return;
  document.getElementById('start').style.display='none';
  audioUp();
  mode='assault';phase=0;ms0=performance.now();pT=0;
  note(98,'sawtooth',.05,1.2)}
document.getElementById('start').onclick=begin;cv.onclick=begin;
// iOS starts ?auto=1 runs with a suspended context (no gesture yet) —
// the first tap anywhere resumes it; harmless everywhere else
addEventListener('touchend',()=>{if(mode==='assault')audioUp()},{passive:true});
addEventListener('pointerup',()=>{if(mode==='assault')audioUp()});
if(location.search.indexOf('auto=1')>-1)setTimeout(begin,700);
draw();
</script></body></html>"""
