/* DUNGZAK CESTLAVIE LAB — 리포트 리더 (2026-11-22 lab-report1)
   dungzak.art reports/reader.html(DCAR 리더)과 같은 형식·같은 읽기 규칙.
   LAB 추가: DCAO(OCEAN ENERGY)·DCAP(ARCHIVE) 목록에서 열기, 이전·다음 리포트, 목록으로,
   LAB 공용 보기 설정(dz.support.a11y.v1 · dzlab_lang)과 글자 크기·고대비·언어를 주고받는다. */
(function(){
'use strict';
var PREF_KEY='dzlab-report-v1';
var LAB_KEY='dz.support.a11y.v1';
var LAB_LANG='dzlab_lang';
var SIZES=['1','1.5','2','3','4'];
var paper=document.getElementById('paper');
var status=document.getElementById('status');
var content=document.getElementById('report-text');
var prefs={lang:'both',size:'1',contrast:false};

function readJSON(k){try{return JSON.parse(localStorage.getItem(k)||'null');}catch(e){return null;}}
(function load(){
  var own=readJSON(PREF_KEY)||{};
  var lab=readJSON(LAB_KEY);
  var labLang=null;try{labLang=localStorage.getItem(LAB_LANG);}catch(e){}
  if(['both','ko','en'].indexOf(own.lang)!==-1)prefs.lang=own.lang;
  else if(labLang==='en')prefs.lang='en';
  // 글자 크기·고대비는 LAB 전체 보기 설정을 따른다(다른 LAB 화면에서 바꾼 값이 우선)
  if(lab&&typeof lab.scale==='number'){var s=String(lab.scale/100);if(SIZES.indexOf(s)!==-1)prefs.size=s;}
  else if(SIZES.indexOf(String(own.size))!==-1)prefs.size=String(own.size);
  if(lab&&typeof lab.contrast==='boolean')prefs.contrast=lab.contrast;
  else if(typeof own.contrast==='boolean')prefs.contrast=own.contrast;
})();
function save(){
  try{
    localStorage.setItem(PREF_KEY,JSON.stringify(prefs));
    localStorage.setItem(LAB_KEY,JSON.stringify({v:1,scale:Math.round(parseFloat(prefs.size)*100),contrast:prefs.contrast}));
    if(prefs.lang==='ko'||prefs.lang==='en')localStorage.setItem(LAB_LANG,prefs.lang);
  }catch(e){}
}
function apply(){
  paper.dataset.lang=prefs.lang;
  document.documentElement.style.setProperty('--scale',prefs.size);
  document.documentElement.lang=prefs.lang==='en'?'en':'ko';
  document.body.classList.toggle('contrast',prefs.contrast);
  document.querySelectorAll('[data-choose-lang]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.chooseLang===prefs.lang));});
  document.querySelectorAll('[data-size]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.size===prefs.size));});
  document.getElementById('contrast').setAttribute('aria-pressed',String(prefs.contrast));
}
document.querySelectorAll('[data-choose-lang]').forEach(function(b){b.addEventListener('click',function(){prefs.lang=b.dataset.chooseLang;apply();save();});});
document.querySelectorAll('[data-size]').forEach(function(b){b.addEventListener('click',function(){prefs.size=b.dataset.size;apply();save();});});
document.getElementById('contrast').addEventListener('click',function(){prefs.contrast=!prefs.contrast;apply();save();});
apply();

// 목록으로: LAB에서 들어왔으면 뒤로 가기(보던 목록·스크롤 그대로), 아니면 LAB 첫 화면
function backToList(e){
  var ref='';try{ref=document.referrer?new URL(document.referrer).origin:'';}catch(x){}
  if(ref===location.origin&&history.length>1){e.preventDefault();history.back();}
}
['lab-back','lab-back-top'].forEach(function(i){var a=document.getElementById(i);if(a)a.addEventListener('click',backToList);});

function languageOf(line){
  if(/[ᄀ-ᇿ㄰-㆏가-힣]/.test(line))return 'kr';
  if(/[A-Za-z]/.test(line))return 'en';
  return '';
}
function addTextLinks(node,text){
  var re=/https?:\/\/[^\s<>]+/g;
  var pos=0,match;
  while((match=re.exec(text))!==null){
    if(match.index>pos)node.appendChild(document.createTextNode(text.slice(pos,match.index)));
    var original=match[0],url=original.replace(/[.,;)\]]+$/,'');
    var trailing=original.slice(url.length);
    try{
      var parsed=new URL(url);
      if(parsed.protocol!=='https:'&&parsed.protocol!=='http:')throw Error('unsupported link');
      var a=document.createElement('a');
      a.href=parsed.href;
      a.target='_blank';a.rel='noopener noreferrer';a.textContent=url;
      node.appendChild(a);
    }catch(e){node.appendChild(document.createTextNode(url));}
    if(trailing)node.appendChild(document.createTextNode(trailing));
    pos=match.index+original.length;
  }
  if(pos<text.length)node.appendChild(document.createTextNode(text.slice(pos)));
}
// 문서 맨 앞의 번호·제목 줄은 위 머리글과 같으므로 한 번만 보이게 뺀다
function dropLeadingHead(lines,entry){
  var known=[entry.id,entry.title_kr,entry.title_ko,entry.title_en].filter(Boolean).map(function(s){return String(s).trim();});
  var i=0;
  while(i<lines.length){
    var t=lines[i].trim();
    if(!t||known.indexOf(t)!==-1){i++;continue;}
    break;
  }
  return lines.slice(i);
}
function renderMarkdown(raw,entry){
  content.replaceChildren();
  var lines=dropLeadingHead(raw.replace(/\r\n?/g,'\n').split('\n'),entry);
  var buffer=[],currentLang='',inReferences=false;
  function flush(){
    if(!buffer.length)return;
    var p=document.createElement('p');
    p.className='passage'+(currentLang?' '+currentLang:'');
    if(currentLang)p.lang=currentLang==='kr'?'ko':'en';
    addTextLinks(p,buffer.join('\n'));
    content.appendChild(p);
    buffer=[];
  }
  lines.forEach(function(line){
    var t=line.trim();
    if(!t){flush();return;}
    if(/^(?:⸻+|─{4,}|-{3,}|—{1,3})$/.test(t)){flush();var hr=document.createElement('hr');hr.className='separator';content.appendChild(hr);return;}
    if(!inReferences && t.length<100 && /^(?:참고문헌|References\b|Bibliography\b)/i.test(t)){
      flush();inReferences=true;currentLang='';
    }
    var detected=inReferences?'':languageOf(t);
    if(detected!==currentLang){flush();currentLang=detected;}
    if(/^\s*#{1,6}\s+/.test(line))line=line.replace(/^\s*#{1,6}\s+/,'');
    buffer.push(line.replace(/\s+$/,''));
  });
  flush();
}
function pnLinks(list,idx){
  var box=document.getElementById('lab-pn');box.replaceChildren();
  function mk(item,dir){
    var a=document.createElement('a');
    a.href='./reader.html?report='+encodeURIComponent(item.id);
    a.textContent=(dir<0?'← ':'')+item.id+(dir>0?' →':'');
    a.setAttribute('aria-label',(dir<0?'이전 리포트 / Previous report: ':'다음 리포트 / Next report: ')+item.id+' '+(item.title_kr||'')+' / '+(item.title_en||''));
    a.title=(item.title_kr||'')+' / '+(item.title_en||'');
    return a;
  }
  if(idx>0)box.appendChild(mk(list[idx-1],-1));
  if(idx<list.length-1)box.appendChild(mk(list[idx+1],1));
}
function error(message){
  status.textContent=message;
  paper.setAttribute('aria-busy','false');
}
var id=new URLSearchParams(location.search).get('report')||'';
var m=/^(DCAO|DCAP)-\d{2}$/.exec(id);
if(!m){error('리포트 주소가 올바르지 않습니다. / Invalid report address.');return;}
var series=m[1].toLowerCase();
var folder=series==='dcao'?'ocean':'archive';
var entry=null;
['lab-back','lab-back-top'].forEach(function(i){var a=document.getElementById(i);if(a)a.href='/?view='+(series==='dcao'?'ocean':'archive');});
var expectedPath=folder+'/'+id+'.md';
// Fetch both public resources now, then verify the exact listed path before rendering.
var textResult=fetch('../'+expectedPath,{cache:'no-cache'})
  .then(function(r){if(!r.ok)throw Error('Report text: HTTP '+r.status);return r.text();})
  .then(function(raw){return {raw:raw};},function(failure){return {failure:failure};});
fetch('../data/'+series+'.json',{cache:'no-cache'})
.then(function(r){if(!r.ok)throw Error('Report index: HTTP '+r.status);return r.json();})
.then(function(data){
  var all=Array.isArray(data[series])?data[series]:[];
  var local=all.filter(function(d){return typeof d.md_path==='string'&&new RegExp('^'+folder+'/'+m[1]+'-\\d{2}\\.md$').test(d.md_path);});
  var idx=-1;local.forEach(function(d,i){if(d.id===id)idx=i;});
  entry=local[idx];
  if(!entry||entry.md_path!==expectedPath)throw Error('Report not listed: '+id);
  document.getElementById('report-number').textContent=id+' · '+entry.year+' · '+(entry.category||'Research');
  document.getElementById('title-ko').textContent=entry.title_kr||entry.title_ko||id;
  document.getElementById('title-en').textContent=entry.title_en||id;
  document.title=id+' · '+(entry.title_kr||id)+' / '+(entry.title_en||'DUNGZAK CESTLAVIE LAB');
  var canonical=document.createElement('link');canonical.rel='canonical';canonical.href=location.origin+'/reports/reader.html?report='+encodeURIComponent(id);document.head.appendChild(canonical);
  pnLinks(local,idx);
  return textResult;
})
.then(function(result){if(result.failure)throw result.failure;return result.raw;})
.then(function(raw){if(!raw.trim())throw Error('Report text is empty');renderMarkdown(raw,entry);status.hidden=true;paper.setAttribute('aria-busy','false');})
.catch(function(e){console.error('LAB report reader',e);error('리포트를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요. / Unable to load this report. Please try again.');});
})();
