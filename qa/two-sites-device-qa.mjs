/* Dungzak two-site simulated viewport audit.
   Viewport/touch/DPR ≠ real phone, OS, VoiceOver or TalkBack. */
import fs from 'node:fs';
import { chromium, webkit, firefox } from 'playwright';
const engineName=process.env.QA_ENGINE||'chromium';
const browserType={chromium,webkit,firefox}[engineName];
if(!browserType)throw Error('Unsupported browser '+engineName);
const matrix=[
['iPhone-SE-old',320,568,2,1],['iPhone-8-old',375,667,2,1],
['iPhone-X-old',375,812,3,1],['iPhone-12-mini',375,812,3,1],
['iPhone-13-14',390,844,3,1],['iPhone-16-Pro',402,874,3,1],
['iPhone-new-large-class',440,956,3,1],['iPhone-landscape',874,402,3,1],
/* iPhone Duo 2026: Safari 27.1 WebKit viewport range, representative poses. */
['iPhone-Duo-outer-Safari',382,678,3,1],['iPhone-Duo-outer-app',466,678,3,1],
['iPhone-Duo-inner-portrait',669,869,3,1],['iPhone-Duo-inner-landscape',951,669,3,1],
['iPhone-Duo-inner-split',445,626,3,1],
['Galaxy-S8-old',360,740,3,1],['Galaxy-S21',360,800,3,1],
['Android-small-old',320,640,2,1],['Galaxy-new',384,854,3,1],
['Pixel-6',412,915,2.6,1],['Android-large',480,1040,3,1],
['Galaxy-Flip-open',360,748,3,1],
['Galaxy-Fold-closed',344,882,3,1],['Galaxy-Fold-open',884,1104,2.5,1],
['Galaxy-Fold-landscape',1104,884,2.5,1],
['Pixel-Fold-closed',412,915,3,1],['Pixel-Fold-open',842,841,2.5,1],
['iPad-mini-portrait',744,1133,2,1],['iPad-mini-landscape',1133,744,2,1],
['iPad-old',810,1080,2,1],['iPad-Air-11',820,1180,2,1],
['iPad-Pro-13',1032,1376,2,1],['iPad-Pro-landscape',1376,1032,2,1],
['iPad-Split-View',600,820,2,1],
['Android-Tab-portrait',800,1280,2,1],['Android-Tab-landscape',1280,800,2,1],
['Laptop-small',1024,768,1,0],['Laptop-HD',1366,768,1,0],
['MacBook-class',1440,900,2,0],['Desktop-FHD',1920,1080,1,0],
['Desktop-4K-class',2560,1440,1,0]
];
const deep=new Set(['iPhone-SE-old','iPhone-16-Pro','iPhone-new-large-class','iPhone-Duo-outer-Safari','iPhone-Duo-inner-portrait',
'Galaxy-S21','Galaxy-Fold-closed','Galaxy-Fold-open','iPad-mini-portrait',
'iPad-Split-View','Android-Tab-portrait','Laptop-small','Desktop-FHD']);
const sites=[['dungzak.art','https://dungzak.art/'],['dungzaklab.art','https://dungzaklab.art/']];
const outDir='qa-results/'+engineName;fs.mkdirSync(outDir,{recursive:true});
const results=[];
let snap=0;
function log(site,dev,check,status,info=''){
 const obj={site,device:dev,engine:engineName,check,status,info:String(info).slice(0,900)};
 results.push(obj);
 console.log(status+' | '+site+' | '+dev+' | '+check+' | '+String(info).slice(0,100));
}
function issue(e){return e&&e.message?e.message:String(e)}
function isBlocked(e){return /ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_SSL|NS_ERROR_UNKNOWN_HOST|net::ERR|ENOTFOUND/i.test(issue(e))}
function config(d){
 const c={viewport:{width:d[1],height:d[2]},deviceScaleFactor:d[3],hasTouch:!!d[4]};
 if(d[4]&&engineName!=='firefox')c.isMobile=true;
 return c;
}
async function snapFailure(page,site,dev){
 if(snap>=12)return;snap++;
 try{await page.screenshot({path:outDir+'/failure-'+snap+'-'+site.replace(/\W/g,'')+'-'+dev+'.png',timeout:6000});}catch{}
}
async function navigate(page,url){
 const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:22000});
 if(!response||response.status()>=400)throw Error('HTTP '+(response&&response.status())+' at '+url);
 await page.waitForTimeout(250);
}
async function overflow(page){
 return page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth);
}
async function art(page,tag){
 try{
  await page.locator('nav.primary button[data-target="reports"]').click({timeout:7000});
  const btn=page.locator('#reportsDisplaySettings');
  await btn.waitFor({state:'visible',timeout:7000});
  await btn.click();
  await page.locator('#reportsDisplayPanel').waitFor({state:'visible',timeout:6000});
  for(const scale of ['1','1.5','2','3','4']){
   await page.locator('#reportsDisplayPanel [data-dcar-size="'+scale+'"]').click({timeout:7000});
   const got=await page.locator('#reports').getAttribute('data-dcar-scale');
   if(got!==scale)throw Error('scale state '+got+' vs '+scale);
   log('dungzak.art',tag,'report-zoom-'+scale,'PASS');
   const px=await overflow(page);
   if(px>12)log('dungzak.art',tag,'horizontal-overflow-'+scale,'FAIL',px+'px');
  }
  await page.locator('#reportsDisplayPanel [data-dcar-contrast="on"]').click();
  await page.locator('#reportsDisplayReset').click();
  if(await page.locator('#reports').getAttribute('data-dcar-scale')!=='1')throw Error('reset failed');
  await page.locator('#reportsDisplayClose').click();
  if(await page.locator('#reportsDisplayPanel').isVisible())throw Error('close failed');
  log('dungzak.art',tag,'contrast-reset-close','PASS');
  await page.locator('#reportsToggle').click({timeout:7000});
  await page.locator('#reportGrid .r-item').first().waitFor({state:'visible',timeout:12000});
  log('dungzak.art',tag,'report-grid','PASS','count='+await page.locator('#reportGrid .r-item').count());
 }catch(e){log('dungzak.art',tag,'report-controls','FAIL',issue(e));await snapFailure(page,'art',tag)}
}
async function lab(page,tag){
 try{
  // The LAB homepage has its own prominent accessible entry.
  // Prefer that real visible control; the slide-menu entry may be offscreen.
  const homeEntry=page.locator('.dzds-home-entry');
  if(await homeEntry.count() && await homeEntry.isVisible()){
   await homeEntry.click({timeout:7000});
  }else{
   const menu=page.locator('#menuBtn');
   if(await menu.count())await menu.click({timeout:7000});
   const entry=page.locator('#dzDisplayBtn');
   await entry.waitFor({state:'visible',timeout:7000});
   await entry.click({timeout:7000});
  }
  await page.locator('#dzDisplayDialog').waitFor({state:'visible',timeout:7000});
  for(const scale of ['150','200','300','400']){
   await page.locator('#dzDisplayDialog [data-dzds="scale"][data-scale="'+scale+'"]').click({timeout:7000});
   const got=await page.locator('html').getAttribute('data-dz-scale');
   if(got!==scale)throw Error('scale state '+got+' vs '+scale);
   log('dungzaklab.art',tag,'display-zoom-'+scale,'PASS');
   const px=await overflow(page);
   if(px>12)log('dungzaklab.art',tag,'horizontal-overflow-'+scale,'FAIL',px+'px');
  }
  await page.locator('#dzDisplayDialog [data-dzds="contrast"][data-contrast="on"]').click();
  await page.locator('#dzDisplayDialog [data-dzds="reset"]').click();
  if(await page.locator('html').getAttribute('data-dz-scale')!=='100')throw Error('reset failed');
  await page.locator('#dzDisplayDialog [data-dzds="close"]').last().click();
  if(await page.locator('#dzDisplayDialog').isVisible())throw Error('close failed');
  log('dungzaklab.art',tag,'contrast-reset-close','PASS');
 }catch(e){log('dungzaklab.art',tag,'display-controls','FAIL',issue(e));await snapFailure(page,'lab',tag)}
}
const browser=await browserType.launch({headless:true});
for(const d of matrix){
 const tag=d[0],ctx=await browser.newContext(config(d)),page=await ctx.newPage();
 for(const [site,url] of sites){
  try{
   await navigate(page,url);
   const sel=site==='dungzak.art'?'nav.primary':'#menu';
   if(!await page.locator(sel).count())throw Error('Navigation element absent: '+sel);
   log(site,tag,'site-smoke','PASS',d[1]+'x'+d[2]);
   const px=await overflow(page);
   if(px>12)log(site,tag,'initial-horizontal-overflow','FAIL',px+'px');
   if(deep.has(tag)){if(site==='dungzak.art')await art(page,tag);else await lab(page,tag)}
  }catch(e){
   log(site,tag,'site-smoke',isBlocked(e)?'BLOCKED':'FAIL',issue(e));
   await snapFailure(page,site,tag);
  }
 }
 await ctx.close();
}
for(const tag of ['iPhone-SE-old','Galaxy-Fold-open','iPad-mini-portrait','Desktop-FHD']){
 const d=matrix.find(x=>x[0]===tag),ctx=await browser.newContext(config(d)),page=await ctx.newPage();
 for(const [label,url] of [
  ['reader-01','https://dungzak.art/reports/reader.html?report=DCAR-01-2025'],
  ['reader-33','https://dungzak.art/reports/DCAR-33-2026.html']]){
  try{
   await navigate(page,url);
   await page.locator('#paper').waitFor({state:'attached',timeout:8000});
   for(const s of ['1.5','2','3','4']){
    // Report reader remembers the previous 400% zoom and collapses its toolbar
    // on the next report; reveal controls through the accessible toggle.
    const sizeBtn=page.locator('[data-size="'+s+'"]');
    if(!await sizeBtn.isVisible()){
     const toggle=page.locator('.toolbar .dz-tb-toggle');
     if(!await toggle.count())throw Error('Hidden size control without accessible toolbar toggle');
     await toggle.click({timeout:7000});
     await sizeBtn.waitFor({state:'visible',timeout:7000});
    }
    await sizeBtn.click({timeout:7000});
    const cur=await page.locator('html').evaluate(e=>getComputedStyle(e).getPropertyValue('--scale').trim());
    if(cur!==s)throw Error('CSS scale not applied '+cur);
    log('dungzak.art',tag,label+'-scale-'+s,'PASS');
    const px=await overflow(page);
    if(px>12)log('dungzak.art',tag,label+'-overflow-'+s,'FAIL',px+'px');
   }
  }catch(e){log('dungzak.art',tag,label,'FAIL',issue(e));await snapFailure(page,'reader',tag)}
 }
 await ctx.close();
}
for(const tag of ['iPhone-16-Pro','Galaxy-Fold-open','Desktop-FHD']){
 const d=matrix.find(x=>x[0]===tag),ctx=await browser.newContext(config(d)),page=await ctx.newPage();
 for(const url of ['/archivepro/','/app/','/discover/','/support/']){
  try{await navigate(page,'https://dungzaklab.art'+url);log('dungzaklab.art',tag,'route-'+url,'PASS')}
  catch(e){log('dungzaklab.art',tag,'route-'+url,isBlocked(e)?'BLOCKED':'FAIL',issue(e))}
 }
 await ctx.close();
}
await browser.close();
const counts={};for(const r of results)counts[r.status]=(counts[r.status]||0)+1;
const info={engine:engineName,createdAt:new Date().toISOString(),
 profiles:matrix.length,counts,limitations:[
 'Viewport/DPR/touch emulation only; not physical-device testing.',
 'Ubuntu WebKit is not an iOS Safari device; old OS browser builds not exercised.',
 'VoiceOver/TalkBack manual testing not performed.'
],results};
fs.writeFileSync(outDir+'/results.json',JSON.stringify(info,null,2));
const lines=['# Two site simulated-device QA — '+engineName,'','Count: '+JSON.stringify(counts),
 'Profiles: '+matrix.length,'',...info.limitations,'','## FAIL / BLOCKED'];
for(const r of results.filter(x=>x.status==='FAIL'||x.status==='BLOCKED'))
 lines.push('- '+r.status+' '+r.site+' '+r.device+' '+r.check+': '+r.info);
fs.writeFileSync(outDir+'/summary.md',lines.join('\n')+'\n');
console.log('SUMMARY '+JSON.stringify(counts));
if(counts.FAIL)process.exitCode=1;
