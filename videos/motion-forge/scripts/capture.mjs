import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ForgePlayer, renderSVG } from '../../../packages/motion-forge/dist/core.js';
import { createPreset } from '../../../packages/motion-forge/dist/presets.js';
const root=fileURLToPath(new URL('../',import.meta.url));
await mkdir(root+'assets',{recursive:true});
function encoder(name,w,h){ const child=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','image2pipe','-vcodec','png','-framerate','30','-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',root+'assets/'+name+'.mp4'],{stdio:['pipe','inherit','inherit']});return child; }
async function push(enc,buf){if(!enc.stdin.write(buf))await once(enc.stdin,'drain');}
async function finish(enc){enc.stdin.end();const [code]=await once(enc,'close');if(code)throw Error('ffmpeg failed '+code);}
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:960,height:840}});
 await page.setContent('<canvas width="960" height="840"></canvas>');
 for(const [name,duration] of [['scout',14],['made-it',6],['signal',6]]){
  const doc=createPreset(name);const player=new ForgePlayer(doc,{autoplay:true});const enc=encoder(name,960,840);
  const poses=[];
  for(let i=0;i<duration*30;i++){
   if(name==='scout'&&(i===120||i===240))player.send('wave');
   if(name==='made-it'&&i===30)player.send('confirm');
   if(name==='signal') {const t=i/30;const v=t<1?10:t<3?10+(t-1)*40:t<4?90:t<5?90-(t-4)*25:65;player.setInput('intensity',v);}
   const snap=player.getSnapshot();if(i%30===0)poses.push({t:i/30,state:snap.state,inputs:snap.inputs});
   const svg=renderSVG(doc,{frame:snap.frame});
   const encoded=await page.evaluate(async svg=>{const img=new Image();img.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(svg)));await img.decode();const c=document.querySelector('canvas'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/png').split(',')[1]},svg);
   await push(enc,Buffer.from(encoded,'base64'));player.advance(1000/30);
  }
  await finish(enc);player.dispose();await writeFile(root+'assets/'+name+'-events.json',JSON.stringify(poses,null,2));console.log('Rendered actual preset:',name);
 }
 await page.close();
 const studio=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});const errors=[];studio.on('pageerror',e=>errors.push(e.message));
 await studio.goto(process.env.STUDIO_URL||'http://127.0.0.1:4176/studio/');await studio.getByRole('button',{name:'Play animation',exact:true}).waitFor();await studio.waitForTimeout(700);
 await studio.clock.install();
 await studio.evaluate(()=>{const p=document.createElement('div');p.id='demo-pointer';p.style.cssText='position:fixed;left:800px;top:500px;width:22px;height:22px;border:3px solid #ff825b;border-radius:50%;box-shadow:0 0 0 5px #ff825b33;pointer-events:none;z-index:99999';document.body.append(p)});
 const enc=encoder('studio',1600,1000);
 async function point(locator){await locator.scrollIntoViewIfNeeded();const b=await locator.boundingBox();await studio.evaluate(({x,y})=>{const p=document.getElementById('demo-pointer');p.style.left=x+'px';p.style.top=y+'px'}, {x:b.x+b.width/2-11,y:b.y+b.height/2-11});}
 async function click(locator){await point(locator);await locator.click();}
 for(let i=0;i<450;i++){
  if(i===30)await click(studio.getByRole('button',{name:'◇ Orange shell',exact:true}));
  if(i===75){const f=studio.getByRole('textbox',{name:'Fill',exact:true});await point(f);await f.fill('#97bfa8');await f.press('Enter');}
  if(i===135)await click(studio.getByRole('button',{name:'y keyframe at 1600 milliseconds',exact:true}));
  if(i===180){const f=studio.getByRole('spinbutton',{name:'Value',exact:true});await point(f);await f.fill('245');await f.press('Enter');}
  if(i===225)await click(studio.getByRole('button',{name:'Play animation',exact:true}));
  if(i===375){await click(studio.getByRole('button',{name:'Pause animation',exact:true}));await studio.getByRole('combobox',{name:'Export format'}).selectOption('json');const download=studio.waitForEvent('download');await click(studio.getByRole('button',{name:'Export',exact:true}));await (await download).saveAs(root+'assets/scout-edited.forge.json');}
  await studio.clock.runFor(1000/30);await push(enc,await studio.screenshot({animations:'allow'}));
 }
 await finish(enc);await studio.screenshot({path:root+'assets/studio-poster.png'});if(errors.length)throw Error(errors.join('\n'));await writeFile(root+'assets/capture-verification.json',JSON.stringify({errors,studioFrames:450,presetFrames:780,fps:30},null,2));console.log('Recorded real Studio; exported edited JSON.');
} finally {await browser.close();}
