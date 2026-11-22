import { chromium, webkit, firefox } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
const type=process.env.QA_ENGINE||'chromium', engine={chromium,webkit,firefox}[type];
const profiles=[['iPhone-small',320,568],['iPhone-Pro',402,874],['Galaxy-Fold-open',884,1104],['iPad',820,1180],['Desktop',1440,900]];
const rows=[],dir='qa-results/screenreader-'+type;
fs.mkdirSync(dir,{recursive:true});
function save(d,c,status,message=''){
 const r={engine:type,device:d,check:c,status,message:String(message).slice(0,900)};
 rows.push(r);console.log(status+' | '+d+' | '+c+' | '+r.message);
}
async function test(d,c,fn){try{await fn();save(d,c,'PASS')}catch(e){save(d,c,'FAIL',e.message)}}
async function attr(e,n,w){let got=await e.getAttribute(n);if(got!==w)throw Error(n+': expected '+w+' got '+got)}
const browser=await engine.launch({headless:true});
for(const [dev,width,height] of profiles){
 const ctx=await browser.newContext({viewport:{width,height},isMobile:dev!=='Desktop'&&type!=='firefox',hasTouch:dev!=='Desktop'});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await test(dev,'LAB-home-load',async()=>{
  const r=await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  if(!r||r.status()!==200)throw Error('HTTP '+r?.status());
  await page.locator('#dz-sr-skip').waitFor({timeout:8000});
  await attr(page.locator('#home'),'role','main');
 });
 await test(dev,'LAB-skip-main',async()=>{
  await page.keyboard.press('Tab');
  if(await page.evaluate(()=>document.activeElement.id)!=='dz-sr-skip')throw Error('skip not first focus');
  await page.keyboard.press('Enter');
  if(await page.evaluate(()=>document.activeElement.id)!=='home')throw Error('skip not focused on active view');
 });
 await test(dev,'LAB-language-and-menu',async()=>{
  await page.locator('.lang-global [data-lang="en"]').click();
  await page.waitForTimeout(160);
  await attr(page.locator('html'),'lang','en');
  await page.locator('#menuBtn').click();
  await attr(page.locator('#menuBtn'),'aria-expanded','true');
  await attr(page.locator('#menuBtn'),'aria-haspopup','dialog');
  await page.keyboard.press('Escape');
  await attr(page.locator('#menuBtn'),'aria-expanded','false');
 });
 await test(dev,'LAB-display-dialog',async()=>{
  await page.locator('.dzds-home-entry').click();
  await page.locator('#dzDisplayDialog').waitFor({state:'visible',timeout:7000});
  await page.locator('[data-dzds="scale"][data-scale="300"]').click();
  await attr(page.locator('html'),'data-dz-scale','300');
  await page.locator('[data-dzds="reset"]').click();
  await attr(page.locator('html'),'data-dz-scale','100');
  await page.locator('[data-dzds="close"]').last().click();
  await page.locator('#dzDisplayDialog').waitFor({state:'hidden',timeout:6000});
 });
 await test(dev,'LAB-axe-critical-serious',async()=>{
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
  fs.writeFileSync(dir+'/axe-home-'+dev+'.json',JSON.stringify({violations:axe.violations.map(x=>({id:x.id,impact:x.impact,count:x.nodes.length,targets:x.nodes.slice(0,8).map(n=>n.target)}))},null,2));
  const serious=axe.violations.filter(x=>['critical','serious'].includes(x.impact));
  if(serious.length)throw Error(serious.map(x=>x.id+'('+x.nodes.length+')').join(', '));
 });
 for(const p of ['/archivepro/index.html','/app/index.html']){
  await test(dev,p+'-load',async()=>{
   let r=await page.goto('http://127.0.0.1:8765'+p,{waitUntil:'domcontentloaded',timeout:25000});
   if(!r||r.status()!==200)throw Error('HTTP '+r?.status());
   await page.locator('#dz-sr-skip').waitFor({timeout:7000});
  });
  await test(dev,p+'-semantics',async()=>{
   await attr(page.locator('.lang-tabs'),'role','group');
   await attr(page.locator('#archiveMain'),'aria-live',null);
   await attr(page.locator('#statFiltered'),'role','status');
   const label=await page.locator('#sectionSelect').getAttribute('aria-label');
   if(label!==null)throw Error('select overrides visible label: '+label);
   await page.locator('#searchInput').focus();
   if(await page.evaluate(()=>document.activeElement.id)!=='searchInput')throw Error('search cannot focus');
  });
  await test(dev,p+'-axe-critical-serious',async()=>{
   const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
   fs.writeFileSync(dir+'/axe-'+p.replace(/\W/g,'')+'-'+dev+'.json',JSON.stringify({violations:axe.violations.map(x=>({id:x.id,impact:x.impact,count:x.nodes.length,targets:x.nodes.slice(0,8).map(n=>n.target)}))},null,2));
   const serious=axe.violations.filter(x=>['critical','serious'].includes(x.impact));
   if(serious.length)throw Error(serious.map(x=>x.id+'('+x.nodes.length+')').join(', '));
  });
 }
 if(errors.length)save(dev,'runtime-errors','FAIL',errors.slice(0,5).join('; '));
 await ctx.close();
}
await browser.close();
const fails=rows.filter(x=>x.status==='FAIL');
fs.writeFileSync(dir+'/results.json',JSON.stringify({engine:type,pass:rows.length-fails.length,fail:fails.length,rows,
 limits:'Browser DOM/keyboard/aXe only. Not real iOS/Android hardware VoiceOver/TalkBack speech testing.'},null,2));
console.log('SUMMARY '+type+' PASS '+(rows.length-fails.length)+' FAIL '+fails.length);
if(fails.length)process.exitCode=1;
