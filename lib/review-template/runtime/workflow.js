function createReviewWorkflow(surface){
var workflowRailChanged=function(){},workflowMarkersChanged=function(){},
    workflowJourneyWired=function(){},workflowJourneyRevealed=function(){},
    workflowControlChanged=function(){};
var workflowControlSources=(function(){
  var node=document.getElementById('vx-control-sources');
  try{return JSON.parse(node&&node.textContent||'{}')}catch(e){return{}}
})();
function workflowActiveControlInfo(){
  return workflowControlSources[surface.experiment.control]||{};
}
function workflowControlPhrase(control){
  if(control.provenance==='verified-localized-capture')return 'localized control';
  if(control.provenance==='concept-reconstruction')return 'concept reconstruction';
  return 'control';
}
function workflowSurfaceChanged(change){
  if(change.type==='rail')workflowRailChanged(change.detail);
  else if(change.type==='markers')workflowMarkersChanged(change.detail);
  else if(change.type==='journey'){
    workflowJourneyWired(change.detail);workflowJourneyRevealed(change.detail);
  }else if(change.type==='experiment')workflowControlChanged(change.detail);
}
(function(){"use strict";
var landingNotes=surface.notesByVariant;

/* ---- shared editing core: state, comments, save, export ---- */
var vxComments=[];
var vxEmbeddedDocumentState=null;
var vxProjectMetadata=(function(){
  var node=document.getElementById('vx-project');
  try{return JSON.parse(node&&node.textContent||'{}')}catch(e){return{}}
})();
function vxEnsureNoteIds(collection,scope){
  if(!collection)return;
  if(Array.isArray(collection))collection.forEach(function(o,i){
    if(!o.vxid)o.vxid='note-'+vxHash(scope+'|'+String(o.step||'')+'|'+String(o.sel||o.n||i)+'|'+String(o.title||''));
  });
  else Object.keys(collection).forEach(function(k){vxEnsureNoteIds(collection[k],scope+':'+k)});
}
vxEnsureNoteIds(landingNotes,'landing');
if(surface.journey)vxEnsureNoteIds(surface.journey.notes,'journey');
var vxPristine=JSON.parse(JSON.stringify(landingNotes));
var vxJPristine=surface.journey?JSON.parse(JSON.stringify(surface.journey.notes)):null;
/* The experiment origin survives every saved generation. The opened-file
   baseline is tracked separately below, so recovery can revert only this
   session while AI handoffs still contain the complete change history. */
var vxOriginNotes=JSON.parse(JSON.stringify(vxPristine));
var vxOriginJNotes=vxJPristine?JSON.parse(JSON.stringify(vxJPristine)):null;
function vxDirty(on){document.body.classList.toggle('vx-dirty',on!==false)}
var vxActivityDock=document.createElement('div');vxActivityDock.id='vxActivityDock';
document.body.appendChild(vxActivityDock);
var vxHint=document.createElement('div');vxHint.id='vxHint';vxActivityDock.appendChild(vxHint);
var vxDirtyBar=document.createElement('div');vxDirtyBar.id='vxDirty';
vxDirtyBar.innerHTML='<span class="vx-recovery-copy"><i class="vx-recovery-dot"></i>'+
  '<span class="vx-recovery-text"><span class="vx-recovery-title">Unsaved in this browser</span>'+
  '<span class="vx-recovery-sub">Recovery copy updated just now</span></span></span>'+
  '<button id="vxSaveBtn">Save copy</button><button id="vxRecoveryMore" aria-label="More recovery actions" '+
  'aria-haspopup="menu" aria-expanded="false" aria-controls="vxRecoveryMenu">&#8230;</button>'+
  '<div id="vxRecoveryMenu" role="menu"><button id="vxClearBtn" role="menuitem">Clear edits</button>'+
  '<button id="vxClearCBtn" role="menuitem" hidden>Clear comments</button></div>';
vxActivityDock.appendChild(vxDirtyBar);
var vxRecoveryMore=document.getElementById('vxRecoveryMore'),
    vxRecoveryMenu=document.getElementById('vxRecoveryMenu');
function vxRecoveryMenuOpen(on){
  var wasOpen=vxRecoveryMenu.classList.contains('on');
  vxRecoveryMenu.classList.toggle('on',!!on);
  vxRecoveryMore.setAttribute('aria-expanded',String(!!on));
  if(on){requestAnimationFrame(function(){
    var first=vxRecoveryMenu.querySelector('button:not([hidden])');if(first)first.focus()})}
  else if(wasOpen&&vxRecoveryMenu.contains(document.activeElement))vxRecoveryMore.focus();
}
vxRecoveryMore.addEventListener('click',function(e){e.stopPropagation();
  vxRecoveryMenuOpen(!vxRecoveryMenu.classList.contains('on'))});
document.addEventListener('click',function(e){
  if(!e.target.closest('#vxRecoveryMenu,#vxRecoveryMore'))vxRecoveryMenuOpen(false)});
document.addEventListener('keydown',function(e){
  if(e.key==='Escape'&&vxRecoveryMenu.classList.contains('on')){
    e.preventDefault();e.stopImmediatePropagation();vxRecoveryMenuOpen(false)}
});
document.getElementById('vxSaveBtn').textContent='Save working HTML';
document.getElementById('vxSaveBtn').title='Download one self-contained HTML file with every prototype, edit, note, and comment baked in';
document.getElementById('vxSaveBtn').addEventListener('click',function(){vxSave()});
document.getElementById('vxClearBtn').addEventListener('click',function(){
  vxRecoveryMenuOpen(false);
  vxConfirm('Revert all note edits? Comments are kept.',function(){
    Object.keys(vxPristine).forEach(function(k){landingNotes[k].length=0;
      vxPristine[k].forEach(function(o){landingNotes[k].push(JSON.parse(JSON.stringify(o)))})});
    if(vxJPristine&&surface.journey){surface.journey.notes.length=0;
      vxJPristine.forEach(function(o){surface.journey.notes.push(JSON.parse(JSON.stringify(o)))});
      surface.journey.refresh();}
    surface.setCurrentNotes(surface.current);surface.renderRail();surface.buildMarkers();if(surface.active)surface.select(surface.active);
    vxDirty(typeof vxActivityHasWork==='function'?vxActivityHasWork():false);
  });
});
document.getElementById('vxClearCBtn').addEventListener('click',function(){
  vxRecoveryMenuOpen(false);
  vxConfirm('Discard all '+vxComments.length+' comments?',function(){
    vxComments=[];vxCSync();
    vxDirty(typeof vxActivityHasWork==='function'?vxActivityHasWork():false);
  });
});
var vxCBadge=document.createElement('button');vxCBadge.id='vxCBadge';
vxCBadge.textContent='Comments · 0';
vxCBadge.title='Prepare the pending comments for AI';
(document.getElementById('vxPresWrap')||document.querySelector('header.top')).appendChild(vxCBadge);
vxCBadge.addEventListener('click',vxSendToAI);
function vxCSync(){
  vxCBadge.textContent='Comments · '+vxComments.length;
  vxCBadge.classList.toggle('has',vxComments.length>0);
  /* corner badge + contextual export button, when the layer provides them */
  var cb=document.getElementById('vxCornerBadge');
  if(cb){cb.textContent=vxComments.length;
    document.body.classList.toggle('vx-hasComments',vxComments.length>0);}
  var cc=document.getElementById('vxClearCBtn');
  if(cc)cc.hidden=!vxComments.length;
  vxSchedulePins();
}
function vxPath(el,root){
  var seg=[];
  while(el&&el!==root&&el.nodeType===1){
    var s=el,i=1;
    while(s.previousElementSibling){s=s.previousElementSibling;i++}
    seg.unshift(el.tagName.toLowerCase()+':nth-child('+i+')');
    el=el.parentElement;
  }
  return seg.length?':scope>'+seg.join('>'):null;
}
function vxLocator(target){
  var card=target.closest('#railList .note');
  if(card){var n=Number(card.dataset.n),o=surface.notes.filter(function(x){return x.n===n})[0];
    return {kind:'note',id:o&&o.vxid||null,n:n}}
  var pane=target.closest('.pane--control')?'control':target.closest('.pane--variant')?'variant':null;
  if(pane){
    var scroll=target.closest('.pane__scroll');
    var root=scroll&&scroll.querySelector('.phone:not([hidden]),.dpage:not([hidden])');
    var named=target.closest('[data-a],[data-cro]'),sel=null,anchor=null;
    if(root&&named&&root.contains(named)){
      var attr=named.hasAttribute('data-a')?'data-a':'data-cro',val=named.getAttribute(attr);
      anchor={attribute:attr,value:val};
      sel='['+attr+'="'+String(val).replace(/"/g,'\\"')+'"]';
    }else sel=root?vxPath(target,root):null;
    if(sel)return {kind:'lp',pane:pane,variant:surface.current,view:surface.mode,anchor:anchor,sel:sel};
  }
  return {kind:'misc'};
}
function vxDescribe(el){
  var a=el.closest('[data-a]');if(a)return'element "'+a.getAttribute('data-a')+'"';
  var card=el.closest('.note');if(card)return'note '+card.dataset.n+' card';
  var t=(el.textContent||'').trim().slice(0,40);
  return el.tagName.toLowerCase()+(t?' "'+t+'…"':'');
}
var vxPop=null;
function vxOpenPop(x,y,target,ctxOverride,locator){
  vxClosePop();
  vxPop=document.createElement('div');vxPop.id='vxCPop';
  var pane=target.closest('.pane--control')?'control':target.closest('.pane--variant')?('variant '+surface.current):
    target.closest('.j-stage,.j-npanel')?'journey':'rail';
  var ctx=ctxOverride||(pane+' · '+vxDescribe(target));
  vxPop.innerHTML='<p class="ctx">'+ctx+'</p><textarea placeholder="What should change here? This is a request for the agent, not an edit."></textarea>'+
    '<div class="row"><button id="vxCCancel">Cancel</button><button class="pri" id="vxCSave">Add comment</button></div>';
  document.body.appendChild(vxPop);
  vxPop.style.left=Math.max(8,Math.min(x,innerWidth-290))+'px';
  vxPop.style.top=Math.max(8,Math.min(y,innerHeight-190))+'px';
  vxPop.querySelector('textarea').focus();
  vxPop.querySelector('#vxCCancel').addEventListener('click',vxClosePop);
  vxPop.querySelector('#vxCSave').addEventListener('click',function(){
    var txt=vxPop.querySelector('textarea').value.trim();
    if(txt){
      var when=new Date().toISOString();
      vxComments.push({id:'comment-'+when.replace(/\D/g,'')+'-'+vxComments.length,
        ctx:ctx,text:txt,variant:surface.current,when:when,
        loc:locator||vxLocator(target)});
      if(typeof vxRecordWork==='function')vxRecordWork('comment');
      vxCSync();vxDirty();
      vxToast('Comment added — '+vxComments.length+' pending. Send it to AI when ready.');}
    vxClosePop();
  });
}
function vxClosePop(){if(vxPop){vxPop.remove();vxPop=null}}
/* GOTCHA: the published-artifact sandbox has no allow-modals — alert(),
   confirm() and prompt() all silently no-op there. Every dialog below is
   in-page. Clipboard writes may also be denied; the copy sheet's visible
   textarea is the always-works path. */
function vxConfirm(msg,onYes){
  vxToast(msg,'Yes, do it',function(){onYes();vxToastEl.classList.remove('on')});
}
var vxSheetEl=null,vxSheetReturn=null;
function vxCopySheetClose(){
  if(!vxSheetEl)return;
  vxSheetEl.classList.remove('on');
  if(vxSheetReturn&&vxSheetReturn.isConnected)vxSheetReturn.focus();
  vxSheetReturn=null;
}
function vxCopySheet(title,text,kind){
  if(!vxSheetEl){
    vxSheetEl=document.createElement('div');vxSheetEl.id='vxCopySheet';
    vxSheetEl.setAttribute('role','dialog');vxSheetEl.setAttribute('aria-modal','true');
    vxSheetEl.setAttribute('aria-labelledby','vxCopyTitle');vxSheetEl.dataset.vxRuntime='ai-handoff';
    vxSheetEl.innerHTML='<div class="box"><b id="vxCopyTitle"></b>'+
      '<div class="scope" role="group" aria-label="Choose what to send" hidden>'+
      '<button data-scope="edits" aria-pressed="false">Edits</button>'+
      '<button data-scope="comments" aria-pressed="false">Comments</button>'+
      '<button data-scope="combined" aria-pressed="false">Everything</button></div>'+
      '<textarea readonly spellcheck="false"></textarea>'+
      '<div class="row"><span class="st"></span><button data-t="copy">Copy to clipboard</button>'+
      '<button data-t="close">Close</button></div></div>';
    document.body.appendChild(vxSheetEl);
    vxSheetEl.addEventListener('click',function(e){
      var b=e.target.closest('button');
      if(e.target===vxSheetEl||b&&b.dataset.t==='close'){vxCopySheetClose();return}
      if(b&&b.dataset.scope){vxSendToAI(b.dataset.scope);return}
      if(b&&b.dataset.t==='copy'){
        var ta=vxSheetEl.querySelector('textarea');ta.focus();ta.select();
        var done=function(){vxSheetEl.querySelector('.st').textContent='Copied ✓'};
        (navigator.clipboard?navigator.clipboard.writeText(ta.value):Promise.reject())
          .then(done,function(){try{
            if(document.execCommand('copy')===true)done();
            else vxSheetEl.querySelector('.st').textContent='Selected — press ⌘C or Ctrl+C to copy';
          }catch(e){vxSheetEl.querySelector('.st').textContent='Selected — press ⌘C or Ctrl+C to copy'}});
      }
    });
    vxSheetEl.addEventListener('keydown',function(e){
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();vxCopySheetClose();return}
      if(e.key!=='Tab')return;
      var f=Array.prototype.filter.call(vxSheetEl.querySelectorAll('button,textarea,[tabindex]:not([tabindex="-1"])'),
        function(el){return !el.hidden&&el.offsetParent!==null});
      if(!f.length)return;var first=f[0],last=f[f.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
    });
  }
  vxSheetReturn=document.activeElement;
  vxSheetEl.querySelector('b').textContent=title;
  vxSheetEl.querySelector('textarea').value=text;
  vxSheetEl.querySelector('.st').textContent='';
  var scope=vxSheetEl.querySelector('.scope');
  if(scope){
    var changes=typeof vxAIChangeList==='function'?vxAIChangeList().length:0;
    scope.hidden=!(kind&&changes&&vxComments.length);
    scope.querySelectorAll('button[data-scope]').forEach(function(b){
      b.setAttribute('aria-pressed',String(b.dataset.scope===kind));
    });
  }
  vxSheetEl.classList.add('on');
  var ta=vxSheetEl.querySelector('textarea');ta.focus();ta.select();
}
function vxPaintPins(){
  document.querySelectorAll('.vx-cdot').forEach(function(n){n.remove()});
  var fd=null,lpfd=null;
  try{fd=surface.journey&&surface.journey.frameDoc();
    if(fd)fd.querySelectorAll('.vx-cdot').forEach(function(n){n.remove()})}catch(e){}
  try{lpfd=surface.prototypeFrame&&surface.prototypeFrame.contentDocument;
    if(lpfd)lpfd.querySelectorAll('.vx-cdot').forEach(function(n){n.remove()})}catch(e){}
  vxComments.forEach(function(c,i){
    var L=c.loc||{},el=null,doc=document;
    if(L.kind==='note'){
      var note=L.id&&surface.notes.filter(function(o){return o.vxid===L.id})[0];
      el=document.querySelector('#railList .note[data-n="'+(note?note.n:L.n)+'"]');
    }else if(L.kind==='lp'){
      if(L.pane==='variant'&&L.variant!==surface.current)return;
      if(L.view&&L.view!==surface.mode)return;
      if(L.pane==='variant'){
        el=L.sel?surface.prototypeTarget(L.sel):null;doc=lpfd||document;
      }else{
        var scroll=document.getElementById('scrollC');
        var root=scroll&&scroll.querySelector('.phone:not([hidden]),.dpage:not([hidden])');
        try{el=root&&L.sel?root.querySelector(L.sel):null}catch(e){}
      }
    }else if(L.kind==='frame'){
      if(!fd||!surface.journey||surface.journey.cur.v!==L.step)return;
      try{el=fd.querySelector(L.sel);doc=fd}catch(e){}
    }else return;
    if(!el)return;
    if(getComputedStyle(el).position==='static')el.style.position='relative';
    var dot=doc.createElement('span');dot.className='vx-cdot';
    dot.textContent=i+1;dot.title=c.text;dot.setAttribute('data-ci',i);
    el.appendChild(dot);
  });
}
var vxPinT=0;
function vxSchedulePins(){clearTimeout(vxPinT);vxPinT=setTimeout(vxPaintPins,180)}
function vxShowComment(i){
  var c=vxComments[i];if(!c)return;
  vxClosePop();
  vxPop=document.createElement('div');vxPop.id='vxCPop';
  vxPop.innerHTML='<p class="ctx"></p><p class="ctext"></p>'+
    '<div class="row"><button id="vxCDel" style="margin-right:auto;color:var(--danger)">Delete</button>'+
    '<button id="vxCCancel">Close</button></div>';
  vxPop.querySelector('.ctx').textContent=(i+1)+' · '+c.ctx;
  vxPop.querySelector('.ctext').textContent=c.text;
  document.body.appendChild(vxPop);
  vxPop.style.left=Math.max(8,(innerWidth-290)/2)+'px';
  vxPop.style.top=Math.max(8,innerHeight/2-120)+'px';
  vxPop.querySelector('#vxCCancel').addEventListener('click',vxClosePop);
  vxPop.querySelector('#vxCDel').addEventListener('click',function(){
    vxComments.splice(i,1);vxCSync();
    vxDirty(typeof vxActivityHasWork==='function'?vxActivityHasWork():vxComments.length>0);
    vxClosePop();
  });
}
function vxPinClick(e){
  var d=e.target.closest?e.target.closest('.vx-cdot'):null;
  if(!d)return;
  e.preventDefault();e.stopPropagation();
  vxShowComment(Number(d.getAttribute('data-ci')));
}
document.addEventListener('click',vxPinClick,true);
function vxAIChangeList(){
  var out=[];
  function canon(o){var x={};['kind','tag','title','body','before','after','control','variant','step','sel']
    .forEach(function(k){if(o&&o[k]!=null)x[k]=o[k]});return JSON.stringify(x)}
  function key(o,scope){return scope+'|'+String(o&&(o.vxid||o.id)||'')+'|'+String(o&&o.step||'')+'|'+String(o&&(o.variant||o.control||o.sel)||'')}
  function changeId(o,scope){return 'change-'+vxHash(String(o&&(o.vxid||o.id)||key(o,scope)))}
  function diff(cur,base,scope){
    var pools={};(base||[]).forEach(function(o){var k=key(o,scope);(pools[k]||(pools[k]=[])).push({o:o,used:false})});
    (cur||[]).forEach(function(o){
      var a=pools[key(o,scope)]||[],m=null,c=canon(o);
      for(var i=0;i<a.length;i++)if(!a[i].used&&canon(a[i].o)===c){m=a[i];break}
      if(!m)for(var j=0;j<a.length;j++)if(!a[j].used){m=a[j];break}
      if(!m)out.push({id:changeId(o,scope),status:'pending',operation:'add',scope:scope,after:o});
      else{m.used=true;if(canon(m.o)!==c)out.push({id:changeId(o,scope),status:'pending',operation:'update',scope:scope,before:m.o,after:o})}
    });
    Object.keys(pools).forEach(function(k){pools[k].forEach(function(m){
      if(!m.used)out.push({id:changeId(m.o,scope),status:'pending',operation:'delete',scope:scope,before:m.o})})});
  }
  var keys={};Object.keys(vxOriginNotes||{}).forEach(function(k){keys[k]=1});
  Object.keys(landingNotes||{}).forEach(function(k){keys[k]=1});
  Object.keys(keys).forEach(function(k){diff(landingNotes[k]||[],(vxOriginNotes&&vxOriginNotes[k])||[],'landing:'+k)});
  if(surface.journey)diff(surface.journey.notes||[],vxOriginJNotes||[],'journey');
  return out;
}
function vxAIHandoff(kind){
  var changes=vxAIChangeList(),comments=vxComments.map(function(c,i){
    var x=JSON.parse(JSON.stringify(c));x.id=x.id||('comment-'+vxHash((x.when||'')+'|'+(x.ctx||'')+'|'+x.text+'|'+i));
    x.status='pending';return x});
  if(kind==='edits')comments=[];
  if(kind==='comments')changes=[];
  var sourceLinks=Array.prototype.map.call(document.querySelectorAll('.vx-control-live[href]'),function(a){return a.href});
  var payload={schema:'cro-notes.ai-handoff.v1',artifactVersion:'1.0',createdAt:new Date().toISOString(),
    artifact:{name:(location.pathname.split('/').pop()||document.title),title:document.title,
      href:location.href,baselineId:typeof vxBaseSignature==='string'?vxBaseSignature:null},
    experiment:{id:surface.experiment.id,name:surface.experiment.name},
    controlUrls:Array.from(new Set(sourceLinks)),
    role:window.vxStakeholder?'stakeholder':'strategist',kind:kind,
    instructions:[
      'Apply these requests to the editable CRO deck source, not only to this saved review copy.',
      'Preserve all unrelated content and existing interactions.',
      'Resolve the listed changes and comments, then verify Landing Page and Journey views at desktop, tablet, and phone widths.',
      'Return one local self-contained HTML file, open it for review, and summarize what changed. Do not deploy it or claim to provide a hosted link.'
    ],changes:changes,comments:comments,
    counts:{changes:changes.length,comments:comments.length,total:changes.length+comments.length}};
  return '# CRO Notes — AI handoff\n\nCopy this entire request into Codex, Claude, or your team AI. The deck keeps your work locally; sending does not clear it.\n\n```json\n'+JSON.stringify(payload,null,2)+'\n```';
}
function vxSendToAI(kind){
  var changes=vxAIChangeList().length,comments=vxComments.length;
  if(typeof kind!=='string')kind=(changes&&comments)?'combined':changes?'edits':'comments';
  if(kind==='edits'&&!changes)return vxToast('No saved edits yet. Make an edit or add a note first.');
  if(kind==='comments'&&!comments)return vxToast('No comments yet. Choose Comment, then click a target.');
  if(!changes&&!comments)return vxToast('Nothing to send yet. Add an edit, note, or comment first.');
  vxCopySheet(kind==='combined'?'Send edits + comments to AI':kind==='edits'?'Send edits to AI':'Send comments to AI',vxAIHandoff(kind),kind);
  if(vxSheetEl){vxSheetEl.setAttribute('data-vx-region','ai-handoff');
    vxSheetEl.setAttribute('data-vx-handoff-kind',kind);
    var payloadField=vxSheetEl.querySelector('textarea');
    if(payloadField)payloadField.setAttribute('data-vx-ai-payload',kind)}
}
function vxFlushTransientState(){
  var ae=document.activeElement;
  if(ae&&ae.isContentEditable)ae.blur();
  if(vxPop){
    var ta=vxPop.querySelector('textarea'),add=vxPop.querySelector('#vxCSave');
    if(ta&&ta.value.trim()&&add)add.click();else vxClosePop();
  }
  if(document.body.classList.contains('vx-drawer')){
    var save=document.getElementById('vxDSave');if(save)save.click();
  }
  if(typeof vxRecoveryMenuOpen==='function')vxRecoveryMenuOpen(false);
  if(typeof vxSetMode==='function')vxSetMode('view');
}
function vxDownloadBlob(blob,name){
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;
  a.hidden=true;document.body.appendChild(a);a.click();a.remove();
  setTimeout(function(){URL.revokeObjectURL(a.href)},4000);
}
function vxSafeFilePart(value,fallback){
  var out=String(value||'').trim().replace(/[^A-Za-z0-9._-]+/g,'-')
    .replace(/^[-.]+|[-.]+$/g,'').replace(/\.{2,}/g,'.').slice(0,100);
  return out||fallback;
}
function vxPrototypeLibraryForDownload(){
  var el=document.getElementById('vx-prototype-sources');
  try{return el?JSON.parse(el.textContent):{}}catch(e){return {}}
}
function vxCurrentPrototypeKey(){
  return reviewSurface&&typeof reviewSurface.prototypeSourceKey==='function'
    ?reviewSurface.prototypeSourceKey():'';
}
function vxDownloadCurrentPrototype(){
  var library=vxPrototypeLibraryForDownload(),key=vxCurrentPrototypeKey(),entry=library[key];
  if(!entry||entry.downloadable===false||typeof entry.html!=='string')return vxToast('No standalone source is available for the current variant.');
  var slug=vxSafeFilePart(vxProjectMetadata.projectSlug,'cro-review');
  var name=slug+'-'+vxSafeFilePart(key,'variant')+'.html';
  vxDownloadBlob(new Blob([entry.html],{type:'text/html'}),name);
  vxToast('Current variant HTML download started: '+name+'.');
}
function vxZipU16(view,offset,value){view.setUint16(offset,value,true)}
function vxZipU32(view,offset,value){view.setUint32(offset,value>>>0,true)}
function vxZipCRC32(bytes){
  var crc=0xffffffff;
  for(var i=0;i<bytes.length;i++){
    crc^=bytes[i];
    for(var bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function vxZipJoin(parts){
  var size=parts.reduce(function(total,part){return total+part.length},0),out=new Uint8Array(size),offset=0;
  parts.forEach(function(part){out.set(part,offset);offset+=part.length});return out;
}
function vxZipStore(entries){
  var encoder=new TextEncoder(),locals=[],centrals=[],offset=0;
  entries.forEach(function(entry){
    var name=encoder.encode(entry.name),bytes=encoder.encode(entry.html),crc=vxZipCRC32(bytes);
    var local=new Uint8Array(30),lv=new DataView(local.buffer);
    vxZipU32(lv,0,0x04034b50);vxZipU16(lv,4,20);vxZipU16(lv,6,0x0800);
    vxZipU16(lv,8,0);vxZipU16(lv,10,0);vxZipU16(lv,12,0);vxZipU32(lv,14,crc);
    vxZipU32(lv,18,bytes.length);vxZipU32(lv,22,bytes.length);vxZipU16(lv,26,name.length);vxZipU16(lv,28,0);
    locals.push(local,name,bytes);

    var central=new Uint8Array(46),cv=new DataView(central.buffer);
    vxZipU32(cv,0,0x02014b50);vxZipU16(cv,4,20);vxZipU16(cv,6,20);vxZipU16(cv,8,0x0800);
    vxZipU16(cv,10,0);vxZipU16(cv,12,0);vxZipU16(cv,14,0);vxZipU32(cv,16,crc);
    vxZipU32(cv,20,bytes.length);vxZipU32(cv,24,bytes.length);vxZipU16(cv,28,name.length);
    vxZipU16(cv,30,0);vxZipU16(cv,32,0);vxZipU16(cv,34,0);vxZipU16(cv,36,0);
    vxZipU32(cv,38,0);vxZipU32(cv,42,offset);centrals.push(central,name);
    offset+=local.length+name.length+bytes.length;
  });
  var centralBytes=vxZipJoin(centrals),end=new Uint8Array(22),ev=new DataView(end.buffer);
  vxZipU32(ev,0,0x06054b50);vxZipU16(ev,4,0);vxZipU16(ev,6,0);
  vxZipU16(ev,8,entries.length);vxZipU16(ev,10,entries.length);
  vxZipU32(ev,12,centralBytes.length);vxZipU32(ev,16,offset);vxZipU16(ev,20,0);
  return vxZipJoin(locals.concat([centralBytes,end]));
}
function vxDownloadAllPrototypes(){
  var library=vxPrototypeLibraryForDownload();
  var entries=Object.keys(library).sort().filter(function(key){
    return library[key].downloadable!==false&&typeof library[key].html==='string'
  }).map(function(key){
    return {name:vxSafeFilePart(key,'variant')+'.html',html:library[key].html};
  });
  if(!entries.length)return vxToast('No standalone variant sources are available.');
  var name=vxSafeFilePart(vxProjectMetadata.projectSlug,'cro-review')+'-variant-htmls.zip';
  vxDownloadBlob(new Blob([vxZipStore(entries)],{type:'application/zip'}),name);
  vxToast('All variant HTML downloads are ready in '+name+'.');
}
function vxSave(opts){
  opts=opts||{};
  vxFlushTransientState();
  var saveStakeholder=!!(opts.stakeholder||window.vxStakeholder);
  var clone=document.documentElement.cloneNode(true);
  /* Overflow controls are real deck controls temporarily reparented into the
     sheet. Return them to their marked header slots in the clone before any
     runtime chrome is removed, so saving at 390/820px cannot amputate them. */
  var ctop=clone.querySelector('header.top'),csheet=clone.querySelector('#vxSheet');
  if(ctop&&csheet)Array.prototype.slice.call(csheet.children).forEach(function(el){
    if(el.id==='vxSheetClose')return;
    var key=el.id||String(el.className).split(' ')[0]||'';
    var slot=key&&ctop.querySelector('.vx-slot[data-vx-for="'+key+'"]');
    if(slot)ctop.insertBefore(el,slot);
  });
  /* The Annotations toggle is moved into the active notes filter row at runtime.
     Put the real source control back in its original group before removing UI. */
  var cann=clone.querySelector('#tNotes'),ctog=clone.querySelector('.legend .tog');
  if(cann&&ctog)ctog.insertBefore(cann,ctog.firstChild);
  ['vxPane','vxWalk','vxSheet','vxMore','vxCopyLink','vxRailOpen','vxPresWrap','vxActivityDock','vxHint','vxDirty','vxCPop',
   'vxRailBtn','vxJRailBtn','vxDrawer','vxCBadge','vxHelp','vxTour','vxCorners','vxExport','vxCopySheet',
   'vxToast','vxMobileNoteBackdrop','vxMobileNoteSheet','tAuto'].forEach(function(id){
    var n=clone.querySelector('#'+id);if(n)n.remove()});
  clone.querySelectorAll('.vx-cdot,.vx-tools,.mk__tools,.vx-legend,.vx-control-live,.vx-hdiv,.vx-slot,[data-vx-runtime]').forEach(function(n){n.remove()});
  clone.querySelectorAll('[data-vx-tab]').forEach(function(n){
    var old=n.getAttribute('data-vx-tab');
    if(old==='')n.removeAttribute('tabindex');else n.setAttribute('tabindex',old);
    n.removeAttribute('data-vx-tab');
  });
  ['jrailc','jrailv'].forEach(function(id){var n=clone.querySelector('#'+id);if(n)n.innerHTML=''});
  var jsvg=clone.querySelector('#jmapsvg');if(jsvg)jsvg.innerHTML='';
  clone.querySelectorAll('.j-gcall').forEach(function(n){n.remove()});
  var jnsvg=clone.querySelector('#jnsvg');if(jnsvg)jnsvg.innerHTML='';
  clone.querySelectorAll('.vx-control-source').forEach(function(n){n.classList.remove('vx-control-source')});
  clone.querySelectorAll('.vx-preview-hover').forEach(function(n){n.classList.remove('vx-preview-hover')});
  clone.querySelectorAll('.vx-notes-rail,.vx-notes-head,.vx-notes-filters,.vx-notes-list').forEach(function(n){
    n.classList.remove('vx-notes-rail','vx-notes-head','vx-notes-filters','vx-notes-list')});
  var lpRail=clone.querySelector('#vxLpRail');if(lpRail)lpRail.removeAttribute('id');
  var bd=clone.querySelector('body');
  if(bd)['vx-edit','vx-comment','vx-add','vx-drawer','vx-dirty','vx-sheet','vx-tour','vx-present',
    'vx-walkIdle','vx-hasComments','vx-hasEdits','vx-preview-interactive','vx-railHide','vx-jrailHide','vx-journey-notes',
    'vx-mobile-note-open','vx-c','vx-v'].forEach(function(c){bd.classList.remove(c)});
  var fr=clone.querySelector('#jf1frame');if(fr)fr.removeAttribute('srcdoc');
  var old=clone.querySelector('#vx-state');if(old)old.remove();
  var st=document.createElement('script');st.id='vx-state';st.type='application/json';
  var experimentPayload=vxExperimentPayload();
  st.textContent=JSON.stringify({schema:'cro-notes.saved-state.v3',
    activeExperimentId:surface.experiment.id,experiments:experimentPayload,
    notes:landingNotes,
    jnotes:surface.journey?surface.journey.notes:null,
    originNotes:vxOriginNotes,originJNotes:vxOriginJNotes,
    comments:vxComments,
    annotationsOn:document.body.classList.contains('notes-on'),
    mode:saveStakeholder?'stakeholder':'author',savedAt:Date.now()}).replace(/<\//g,'<\\/');
  var firstVx=clone.querySelector('script[data-vx-owner]');
  if(firstVx)firstVx.parentNode.insertBefore(st,firstVx);else clone.appendChild(st);
  var html='<!DOCTYPE html>\n'+clone.outerHTML;
  var role=saveStakeholder?'stakeholder':'working';
  var now=new Date(),date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),
    String(now.getDate()).padStart(2,'0')].join('-');
  var version=String(vxProjectMetadata.version||'unknown').replace(/^v/i,'');
  var slug=String(vxProjectMetadata.projectSlug||'cro-review');
  var name=slug+'-'+date+'-v'+version+'-'+role+'.html';
  var blob=new Blob([html],{type:'text/html'});
  vxDownloadBlob(blob,name);
  /* GOTCHA: the published-artifact iframe sandbox has no allow-downloads, so
     the anchor click silently does nothing there. Offer the clipboard path. */
  vxToast((saveStakeholder?'Stakeholder':'Working')+' HTML download started: '+name+'.',
    'Get the file another way',function(){
      vxCopySheet('Paste this into a new '+name,html);
    });
  /* the draft is NOT cleared here: the sandbox can eat the download, and a
     cleared autosave after a failed save loses real work. The banner stays
     until edits change again or the user clears them deliberately. */
}
var vxToastEl=null,vxToastT=0;
function vxToast(msg,btnLabel,btnFn){
  if(!vxToastEl){vxToastEl=document.createElement('div');vxToastEl.id='vxToast';
    document.body.appendChild(vxToastEl)}
  vxToastEl.innerHTML='<span></span>';
  vxToastEl.firstChild.textContent=msg;
  if(btnLabel){var b=document.createElement('button');b.textContent=btnLabel;
    b.addEventListener('click',function(){btnFn&&btnFn()});vxToastEl.appendChild(b)}
  vxToastEl.classList.add('on');
  vxScheduleRestack();
  clearTimeout(vxToastT);vxToastT=setTimeout(function(){vxToastEl.classList.remove('on');vxScheduleRestack()},9000);
}
function vxChoice(msg,yesLabel,onYes,noLabel,onNo){
  if(!vxToastEl){vxToastEl=document.createElement('div');vxToastEl.id='vxToast';document.body.appendChild(vxToastEl)}
  clearTimeout(vxToastT);vxToastEl.innerHTML='<span></span>';vxToastEl.firstChild.textContent=msg;
  [[yesLabel,onYes,'pri'],[noLabel,onNo,'']].forEach(function(x){
    var b=document.createElement('button');b.textContent=x[0];if(x[2])b.className=x[2];
    b.setAttribute('data-vx-choice',String(x[0]).toLowerCase());
    b.addEventListener('click',function(){vxToastEl.classList.remove('on');x[1]&&x[1]();vxScheduleRestack()});
    vxToastEl.appendChild(b);
  });
  vxToastEl.classList.add('on');vxScheduleRestack();
}
/* Stakeholder copy: same deck, editing stripped, comments kept. The recipient
   can click anything, leave requests, and export them back — but cannot change
   the notes themselves. */
window.vxStakeholder=window.vxStakeholder===true;
(function(){
  var st=document.getElementById('vx-state');
  if(st){try{window.vxStakeholder=window.vxStakeholder||JSON.parse(st.textContent).mode==='stakeholder'}catch(e){}}
  if(window.vxStakeholder)return;      /* recipients don't get strategist downloads */
  var wrap=document.createElement('div');wrap.id='vxDownloadWrap';
  var button=document.createElement('button');button.id='vxDownloadBtn';button.textContent='Download';
  button.title='Download the review or its standalone variant HTML';
  button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');
  button.setAttribute('aria-controls','vxDownloadMenu');
  var menu=document.createElement('div');menu.id='vxDownloadMenu';menu.hidden=true;menu.setAttribute('role','menu');
  var options=[
    ['vxShareBtn','stakeholder','Stakeholder review HTML',function(){vxSave({stakeholder:true})}],
    ['vxDownloadAll','all','All variant HTMLs (.zip)',vxDownloadAllPrototypes],
    ['vxDownloadCurrent','current','Current variant HTML',vxDownloadCurrentPrototype]
  ];
  options.forEach(function(option){
    var item=document.createElement('button');item.id=option[0];item.textContent=option[2];
    item.setAttribute('role','menuitem');item.setAttribute('data-vx-download',option[1]);
    item.addEventListener('click',function(){open(false);option[3]()});menu.appendChild(item);
  });
  function open(on){menu.hidden=!on;button.setAttribute('aria-expanded',String(on));wrap.classList.toggle('on',on)}
  button.addEventListener('click',function(e){e.stopPropagation();open(menu.hidden)});
  wrap.addEventListener('click',function(e){e.stopPropagation()});
  document.addEventListener('click',function(){open(false)});
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&!menu.hidden){open(false);button.focus()}
  });
  wrap.appendChild(button);wrap.appendChild(menu);
  (document.getElementById('vxPresWrap')||document.querySelector('header.top')).appendChild(wrap);
})();
if(window.vxStakeholder)document.getElementById('vxSaveBtn').textContent='Save review HTML';
addEventListener('keydown',function(e){
  if((e.metaKey||e.ctrlKey)&&(e.key==='s'||e.key==='S')){e.preventDefault();vxSave()}
});
/* one bottom-chrome layout manager: each fixed control gets a measured slot,
   so toasts, bars, pills and corners never overlap on any viewport */
function vxRestack(){
  [['vxActivityDock'],['vxHelp'],['vxPane','vxWalk','vxToast']]
  .forEach(function(col){
    var y=10;
    col.forEach(function(id){
      var el=document.getElementById(id);if(!el)return;
      if(el.hidden||getComputedStyle(el).display==='none')return;
      el.style.bottom=y+'px';
      y+=el.offsetHeight+8;
    });
  });
}
var vxRestackT=0;
function vxScheduleRestack(){clearTimeout(vxRestackT);vxRestackT=setTimeout(vxRestack,120)}
addEventListener('resize',vxScheduleRestack);
new MutationObserver(vxScheduleRestack).observe(document.body,{attributes:true,attributeFilter:['class']});
setTimeout(vxRestack,400);
/* re-apply a saved state on load */
window.vxEmbeddedSavedAt=0;
(function(){
  var st=document.getElementById('vx-state');if(!st)return;
  try{
    var d=JSON.parse(st.textContent);
    vxEmbeddedDocumentState=d;
    window.vxEmbeddedSavedAt=Number(d.savedAt||0);
    /* The surface reads saved experiment sessions before the Journey runtime
       exists. Re-apply them now so the active Journey receives its saved notes
       instead of the source-file defaults. */
    if(d.experiments)surface.restoreExperiments(d.experiments,d.activeExperimentId);
    var scoped=d.experiments&&d.experiments[surface.experiment.id];
    if(scoped){
      if(scoped.originNotes)vxOriginNotes=scoped.originNotes;
      if(scoped.originJNotes)vxOriginJNotes=scoped.originJNotes;
      vxComments=scoped.comments||[];
    }else{
      if(d.originNotes)vxOriginNotes=d.originNotes;
      if(d.originJNotes)vxOriginJNotes=d.originJNotes;
      if(d.notes)Object.keys(d.notes).forEach(function(k){landingNotes[k]=d.notes[k]});
      if(d.jnotes&&surface.journey){surface.journey.notes.length=0;
        d.jnotes.forEach(function(o){surface.journey.notes.push(o)});surface.journey.refresh();}
      vxComments=d.comments||[];
    }
    vxEnsureNoteIds(landingNotes,'landing');vxEnsureNoteIds(vxOriginNotes,'landing');
    if(surface.journey){vxEnsureNoteIds(surface.journey.notes,'journey');vxEnsureNoteIds(vxOriginJNotes,'journey')}
    surface.setCurrentNotes(surface.current);
    vxCSync();
    /* The base artifact enables annotations during startup. Saved files must
       restore the user's explicit choice after that startup script has run. */
    if(typeof d.annotationsOn==='boolean'){
      var restoreAnnotations=function(){
        surface.setAnnotations(d.annotationsOn);
      };
      restoreAnnotations();
      /* The source deck's original default-on listener runs at DOMContentLoaded.
         Register after it so an explicit saved-off choice wins there too. */
      if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',restoreAnnotations,{once:true});
    }
    surface.renderRail();surface.buildMarkers();surface.select(1);
  }catch(e){}
})();
if(window.vxStakeholder)document.body.classList.add('vx-stakeholder');

/* The opened file is the activity baseline. Embedded saved state is applied
   above, so a downloaded copy starts a fresh working session; autosave is
   restored below and is therefore measured against this file baseline. Clear
   edits also returns to this exact opened-file state. */
var vxFilePristine=JSON.parse(JSON.stringify(landingNotes));
var vxJFilePristine=surface.journey?JSON.parse(JSON.stringify(surface.journey.notes)):null;
var vxFilePristineComments=JSON.parse(JSON.stringify(vxComments));
vxPristine=JSON.parse(JSON.stringify(vxFilePristine));
vxJPristine=vxJFilePristine?JSON.parse(JSON.stringify(vxJFilePristine)):null;

/* Every experiment owns a complete review workspace. Surface state (variant,
   viewport, zoom, deck) lives in the surface layer; editable notes, comments,
   origins, and opened-file baselines live here. */
var vxExperimentScopes={};
var vxSurfaceSnapshot=surface.serializeExperiments();
surface.experiments.forEach(function(exp){
  var saved=vxEmbeddedDocumentState&&vxEmbeddedDocumentState.experiments&&
    vxEmbeddedDocumentState.experiments[exp.id]||{};
  var view=vxSurfaceSnapshot[exp.id]||{};
  if(exp.id===surface.experiment.id){
    vxExperimentScopes[exp.id]={
      comments:vxComments,originNotes:vxOriginNotes,originJNotes:vxOriginJNotes,
      pristine:vxPristine,jPristine:vxJPristine,
      filePristine:vxFilePristine,jFilePristine:vxJFilePristine,
      filePristineComments:vxFilePristineComments
    };
  }else{
    var baseNotes=view.notes||{},baseJ=view.jnotes||[];
    /* Non-active experiment snapshots have not passed through the workflow's
       ID normalizer yet. Normalize their baselines now so the later, matching
       IDs are not misreported as hundreds of user edits on first switch. */
    vxEnsureNoteIds(baseNotes,'landing');
    vxEnsureNoteIds(baseJ,'journey');
    vxExperimentScopes[exp.id]={
      comments:vxCloneWorkflow(saved.comments||[]),
      originNotes:vxCloneWorkflow(saved.originNotes||baseNotes),
      originJNotes:vxCloneWorkflow(saved.originJNotes||baseJ),
      pristine:vxCloneWorkflow(baseNotes),jPristine:vxCloneWorkflow(baseJ),
      filePristine:vxCloneWorkflow(baseNotes),jFilePristine:vxCloneWorkflow(baseJ),
      filePristineComments:vxCloneWorkflow(saved.comments||[])
    };
  }
});
function vxCloneWorkflow(value){return JSON.parse(JSON.stringify(value==null?null:value))}
function vxStoreCurrentScope(){
  var scope=vxExperimentScopes[surface.experiment.id]||(vxExperimentScopes[surface.experiment.id]={});
  scope.comments=vxComments;scope.originNotes=vxOriginNotes;scope.originJNotes=vxOriginJNotes;
  scope.pristine=vxPristine;scope.jPristine=vxJPristine;
  scope.filePristine=vxFilePristine;scope.jFilePristine=vxJFilePristine;
  scope.filePristineComments=vxFilePristineComments;
}
function vxLoadCurrentScope(){
  var scope=vxExperimentScopes[surface.experiment.id];
  landingNotes=surface.notesByVariant;
  if(!scope){
    var j=surface.journey?vxCloneWorkflow(surface.journey.notes):null;
    scope=vxExperimentScopes[surface.experiment.id]={
      comments:[],originNotes:vxCloneWorkflow(landingNotes),originJNotes:vxCloneWorkflow(j),
      pristine:vxCloneWorkflow(landingNotes),jPristine:vxCloneWorkflow(j),
      filePristine:vxCloneWorkflow(landingNotes),jFilePristine:vxCloneWorkflow(j),
      filePristineComments:[]
    };
  }
  vxComments=scope.comments||[];vxOriginNotes=scope.originNotes||{};
  vxOriginJNotes=scope.originJNotes||null;vxPristine=scope.pristine||{};
  vxJPristine=scope.jPristine||null;vxFilePristine=scope.filePristine||{};
  vxJFilePristine=scope.jFilePristine||null;vxFilePristineComments=scope.filePristineComments||[];
}
function vxExperimentPayload(){
  vxStoreCurrentScope();
  var out=surface.serializeExperiments();
  Object.keys(out).forEach(function(id){
    var scope=vxExperimentScopes[id]||{};
    out[id].comments=vxCloneWorkflow(scope.comments||[]);
    out[id].originNotes=vxCloneWorkflow(scope.originNotes||out[id].notes||{});
    out[id].originJNotes=vxCloneWorkflow(scope.originJNotes||out[id].jnotes||[]);
  });
  return out;
}
function vxRestoreExperimentPayload(payload,activeId){
  Object.keys(payload||{}).forEach(function(id){
    var saved=payload[id];if(!vxExperimentScopes[id])return;
    var scope=vxExperimentScopes[id];
    scope.comments=vxCloneWorkflow(saved.comments||[]);
    scope.originNotes=vxCloneWorkflow(saved.originNotes||saved.notes||{});
    scope.originJNotes=vxCloneWorkflow(saved.originJNotes||saved.jnotes||[]);
  });
  surface.restoreExperiments(payload,activeId);
  vxLoadCurrentScope();vxEnsureNoteIds(landingNotes,'landing');
  if(surface.journey)vxEnsureNoteIds(surface.journey.notes,'journey');
  vxCSync();surface.renderRail();surface.buildMarkers();
  if(surface.active)surface.select(surface.active,{scroll:false});
}
function vxSwitchExperiment(id,opts){
  if(!id||id===surface.experiment.id)return;
  var preserveEdit=vxMode==='edit';
  vxFlushTransientState();vxStoreCurrentScope();
  if(!surface.activateExperiment(id,opts||{}))return;
  vxLoadCurrentScope();vxEnsureNoteIds(landingNotes,'landing');
  if(surface.journey)vxEnsureNoteIds(surface.journey.notes,'journey');
  if(preserveEdit)vxSetMode('edit');
  vxSync();vxCSync();vxSchedulePins();
  if(typeof window.vxCapabilitySync==='function')window.vxCapabilitySync();
  vxDirty(typeof vxActivityHasWork==='function'?vxActivityHasWork():false);
}
var vxExperimentFileBaseline=vxExperimentPayload();

/* ---- autosave: edits mirror to localStorage; ⌘S stays the durable handoff ---- */
function vxHash(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);
  h+=(h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24)}return (h>>>0).toString(36)}
var vxBaseSignature=vxHash(JSON.stringify({experiments:vxExperimentFileBaseline,
  role:window.vxStakeholder?'stakeholder':'author'}));
var VX_AKEY='vxAutosave.v2.'+vxBaseSignature;
var vxDirtyOrig=vxDirty;
vxDirty=function(on){
  vxDirtyOrig(on);
  try{
    if(on===false)localStorage.removeItem(VX_AKEY);
    else localStorage.setItem(VX_AKEY,JSON.stringify({activeExperimentId:surface.experiment.id,
      experiments:vxExperimentPayload(),notes:landingNotes,
      jnotes:surface.journey?surface.journey.notes:null,comments:vxComments,t:Date.now()}));
  }catch(e){}
};
/* Refresh/close commits any visible text, comment, or full-form draft into the
   recovery record. Work leaves the browser only through explicit delete,
   clear, or Discard actions. */
var vxLeaving=false;
function vxPersistBeforeLeave(){
  if(vxLeaving)return;vxLeaving=true;
  try{vxFlushTransientState()}catch(e){}
}
addEventListener('pagehide',vxPersistBeforeLeave,{capture:true});
addEventListener('beforeunload',vxPersistBeforeLeave,{capture:true});
(function(){
  try{
    var raw=localStorage.getItem(VX_AKEY);if(!raw)return;
    var d=JSON.parse(raw);
    /* Embedded state is the opened-file baseline. A newer browser draft layers
       on top of it; an older draft is stale and cannot override a re-saved file. */
    if(Number(d.t||0)<=Number(window.vxEmbeddedSavedAt||0)){
      localStorage.removeItem(VX_AKEY);return;
    }
    function latestRecovery(){
      try{var now=JSON.parse(localStorage.getItem(VX_AKEY)||'null');
        return now&&Number(now.t||0)>Number(d.t||0)?now:d}catch(e){return d}
    }
    setTimeout(function(){vxChoice('Unsaved work from this browser was found.', 'Restore', function(){
      var restore=latestRecovery();
      if(restore.experiments)vxRestoreExperimentPayload(restore.experiments,restore.activeExperimentId);
      else{
        if(restore.notes)Object.keys(restore.notes).forEach(function(k){landingNotes[k]=restore.notes[k]});
        if(restore.jnotes&&surface.journey){surface.journey.notes.length=0;
          restore.jnotes.forEach(function(o){surface.journey.notes.push(o)});surface.journey.refresh();}
        surface.setCurrentNotes(surface.current);vxComments=restore.comments||[];vxCSync();
        surface.renderRail();surface.buildMarkers();surface.select(1);
      }
      document.body.classList.add('vx-dirty');
      vxToast('Unsaved browser work restored.');
    }, 'Discard', function(){try{
      var now=JSON.parse(localStorage.getItem(VX_AKEY)||'null');
      if(!now||Number(now.t||0)<=Number(d.t||0))localStorage.removeItem(VX_AKEY);
      else vxToast('Older recovery dismissed. Your newer browser work is still saved.');
    }catch(e){}})},350);
  }catch(e){}
})();

/* ---- first-run help: remember displayed steps per review in this browser.
        Progress is never embedded in shared HTML; ? always replays manually. ---- */
(function(){
  var help=document.createElement('button');help.id='vxHelp';help.textContent='?';
  help.title='How this deck works';help.setAttribute('aria-label','Open help tour');
  help.setAttribute('data-vx-action','help');
  help.dataset.vxRuntime='tour';document.body.appendChild(help);
  var tour=document.createElement('div');tour.id='vxTour';
  tour.setAttribute('data-vx-region','tour');
  tour.setAttribute('role','dialog');tour.setAttribute('aria-modal','true');
  tour.setAttribute('aria-labelledby','vxTourTitle');tour.setAttribute('aria-describedby','vxTourBody');
  tour.dataset.vxRuntime='tour';
  tour.innerHTML='<div class="dim"></div><div class="spot"></div><div class="card">'+
    '<b id="vxTourTitle"></b><p id="vxTourBody"></p><div class="row"><span class="n"></span>'+
    '<button id="vxTSkip">Not now</button><button class="pri" id="vxTNext">Next</button></div></div>';
  document.body.appendChild(tour);
  function visible(sel){
    var el=document.querySelector(sel);
    return el&&el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0;
  }
  function journeyView(){
    return document.body.classList.contains('deck-journey')||
      document.body.classList.contains('deck-generic-journey');
  }
  function journeyNavigationStep(){
    return {id:'journey-navigate',sel:'.j-map',t:'Click a step to navigate',p:'Every control and variant step is clickable. Choose any step card to open that exact screen comparison and its CRO notes.'};
  }
  function hasJourneyGuide(){
    var map=document.querySelector('.j-map');
    return journeyView()&&visible('.j-map')&&!!(map&&map.querySelector('button'));
  }
  function steps(){
    var j=journeyView(),generic=document.body.classList.contains('deck-generic-journey');
    var control=workflowActiveControlInfo(),controlPhrase=workflowControlPhrase(control);
    var s=j?[
      {id:'journey-map',sel:'.j-map',t:'The flow map',p:'Two journeys, step by step: the '+controlPhrase+' and the proposed variant. Crossing lines mean a step moved; a dashed drop marks a variant-only step.'},
      journeyNavigationStep(),
      {id:'journey-screens',sel:generic?'#deck-lp':'#jstage',t:'The screens',p:'The selected control and variant screens appear together. The variant stays interactive, so you can use it like a visitor.'},
      {id:'journey-notes',sel:generic?'.rail':'.j-npanel',t:'The CRO notes',p:'Notes are scoped to the selected step. Click one and the callout points at the exact element inside the funnel. Arrow keys step through.'}
    ]:[
      {id:'page-comparison',sel:'.pane--control',t:'Control vs. Variant',p:'The '+controlPhrase+' sits on the left and the proposed variant on the right. Both are self-contained HTML pages that you can scroll.'},
      {id:'page-notes',sel:'.rail',t:'The CRO notes',p:'Every numbered card is one deliberate change. Click a note: both pages jump to it and a callout points at the exact element. Arrow keys step through.'},
      {id:'viewport',sel:'#segMode',t:'Mobile & Desktop',p:'The same comparison in both frames. Zoom is shared — Fit keeps everything in view; ctrl/⌘ + scroll zooms in.'}
    ];
    if(window.vxStakeholder){
      s.push({id:'stakeholder-feedback',sel:'#vxHint',t:'Leave feedback',p:'Press C, then click the exact element your request is about. Your feedback stays in this review copy until you prepare it for the team’s AI workflow.'});
      s.push({id:'stakeholder-ai',sel:'#vxSendAI,#vxExport',t:'Send feedback to AI',p:'Review the requests first, then copy or download the guided handoff. Nothing is transmitted silently from this file.'});
    }else{
      s.push({id:'strategist-edit',sel:'#vxHint',t:'Work on the deck',p:'Press E to edit CRO notes. Press N, then click a page element to attach a new rationale. Press C, then click the exact element you want to comment on. The pointer label shows exactly what your next click will do.'});
      s.push({id:'strategist-ai',sel:'#vxSendAI,#vxExport',t:'Continue with AI',p:'Send edits, comments, or both as one reviewed handoff. The sheet explains exactly what to copy or attach in Codex or Claude.'});
      s.push({id:'downloads',sel:'#vxDownloadBtn,#vxPresWrap',t:'Choose the right file',p:'Save working HTML keeps strategist editing. Download provides a comment-only stakeholder review or standalone variant source files for developers.'});
    }
    s.push({id:'mobile-views',sel:'#vxPane',t:'Switch between Control, Variant and Notes',p:'Tap a view to explore it. In Notes, expand a note, then tap it again to see the change in the variant.'});
    return s.filter(function(x){return visible(x.sel)});
  }
  // Exclude version, role, query, and saved filename: these are copies/views
  // of the same review. Stable step IDs let future additions appear naturally.
  var key='croNotes.tour.2.'+encodeURIComponent(vxProjectMetadata.projectSlug||location.pathname);
  var seen=new Set(),idx=-1,cur=[],returnFocus=null,manualReplay=false,journeyPending=0;
  function readSeen(){try{
    var stored=JSON.parse(localStorage.getItem(key)||'[]');
    if(Array.isArray(stored))stored.forEach(function(id){if(typeof id==='string')seen.add(id)});
  }catch(e){}return seen}
  function markSeen(id){
    readSeen().add(id);
    try{localStorage.setItem(key,JSON.stringify(Array.from(seen)))}catch(e){}
  }
  function show(i,reposition){
    readSeen();
    while(i<cur.length&&(!visible(cur[i].sel)||(!reposition&&!manualReplay&&seen.has(cur[i].id))))i++;
    idx=i;var st=cur[i];if(!st)return end();
    var el=document.querySelector(st.sel);
    var r=el.getBoundingClientRect();
    var spot=tour.querySelector('.spot'),card=tour.querySelector('.card');
    spot.style.left=(r.left-6)+'px';spot.style.top=(r.top-6)+'px';
    spot.style.width=(r.width+12)+'px';spot.style.height=(r.height+12)+'px';
    card.querySelector('b').textContent=st.t;
    card.querySelector('p').textContent=st.p;
    card.querySelector('.n').textContent=(i+1)+' of '+cur.length;
    document.getElementById('vxTNext').textContent=i===cur.length-1?'Done':'Next';
    var cx=Math.min(Math.max(r.left,14),Math.max(14,innerWidth-card.offsetWidth-14));
    var cy=r.bottom+14+card.offsetHeight<innerHeight?r.bottom+14:Math.max(14,r.top-card.offsetHeight-14);
    card.style.left=cx+'px';card.style.top=cy+'px';
    markSeen(st.id);
  }
  function end(){document.body.classList.remove('vx-tour');
    if(returnFocus&&returnFocus.focus)returnFocus.focus();returnFocus=null;
  }
  function start(manual,only){
    if(document.body.classList.contains('vx-tour'))return;
    readSeen();manualReplay=manual;
    cur=(only||steps()).filter(function(st){return manual||!seen.has(st.id)});if(!cur.length)return;
    returnFocus=manual?help:document.activeElement;
    document.body.classList.add('vx-tour');show(0);
    /* Focus synchronously so callers cannot observe the dialog open while
       focus is still behind it; repeat next frame for slow first layout. */
    document.getElementById('vxTNext').focus();
    requestAnimationFrame(function(){if(document.body.classList.contains('vx-tour'))document.getElementById('vxTNext').focus()});
  }
  help.addEventListener('click',function(){start(true)});
  document.getElementById('vxTSkip').addEventListener('click',end);
  document.getElementById('vxTNext').addEventListener('click',function(){
    idx+1>=cur.length?end():show(idx+1);
  });
  tour.querySelector('.dim').addEventListener('click',end);
  tour.addEventListener('keydown',function(e){
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();end();return}
    if(e.key!=='Tab')return;
    var f=Array.prototype.filter.call(tour.querySelectorAll('button,[href],[tabindex]:not([tabindex="-1"])'),
      function(el){return !el.hidden&&el.offsetParent!==null});
    if(!f.length)return;var first=f[0],last=f[f.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  });
  addEventListener('resize',function(){if(document.body.classList.contains('vx-tour'))show(idx,true)});
  function maybeStartJourney(){
    if(readSeen().has('journey-navigate')||journeyPending||document.body.classList.contains('vx-tour')||!hasJourneyGuide())return;
    journeyPending=setTimeout(function(){journeyPending=0;
      if(hasJourneyGuide())start(false,[journeyNavigationStep()]);
    },250);
  }
  var wasJourney=journeyView();
  new MutationObserver(function(){
    var now=journeyView();if(now&&!wasJourney)maybeStartJourney();wasJourney=now;
  }).observe(document.body,{attributes:true,attributeFilter:['class']});
  setTimeout(function(){start(false)},250);
})();

/* comment mode (C) */
var vxMode='view';
function vxSetMode(m){
  vxMode=m;
  document.body.classList.toggle('vx-comment',m==='comment');
  document.body.classList.toggle('vx-edit',m==='edit');
  document.body.classList.toggle('vx-add',m==='add');
  vxHintSync();
}
function vxTyping(e){
  return e.target.closest&&e.target.closest('input,textarea,surface.select,[contenteditable="true"]')}
addEventListener('keydown',function(e){
  if(vxTyping(e))return;
  if(e.key==='c'||e.key==='C'){vxSetMode(vxMode==='comment'?'view':'comment')}
  if(e.key==='Escape'&&vxMode!=='view'){vxSetMode('view');vxClosePop()}
});
document.addEventListener('click',function(e){
  if(vxMode!=='comment')return;
  var t=e.target;
  if(t.closest('#vxCPop,header.top,#vxWalk,#vxPane,#vxSheet,#vxDirty,#vxHint'))return;
  if(!t.closest('.pane__scroll,.rail__list,.j-stage,.j-npanel'))return;
  e.preventDefault();e.stopPropagation();
  vxOpenPop(e.clientX+8,e.clientY+8,t);
},true);

/* ---- H Final: one editing model ----
   Text is directly editable wherever you read it; ✎ opens the full form;
   💬 comments anywhere; N adds a note by pointing at the thing it describes. */
(function(){
  /* Keyboard shortcuts remain the compact E/N/C authoring controls. The
     elements stay in the DOM for shared mode plumbing, but are visually hidden
     so the bottom activity strip is the single source of truth. */
  var c=document.createElement('div');c.id='vxCorners';
  c.innerHTML=(window.vxStakeholder?'':
    '<button id="vxBtnE" aria-pressed="false" title="Edit note text in place (E)">E</button>'+
    '<button id="vxAddBtn" aria-pressed="false" title="Add a note — then click the element it describes (N)">N</button>')+
    '<button id="vxBtnC" aria-pressed="false" title="Comment mode — leave requests for the agent (C)">C'+
    '<span class="corner-badge" id="vxCornerBadge"></span></button>';
  document.body.appendChild(c);
  /* Comment export appears inside the recovery half of the unified dock. */
  var ex=document.createElement('button');ex.id='vxExport';
  ex.setAttribute('data-vx-action','send-ai');
  ex.textContent='Send to AI';
  ex.title='Prepare your current edits and comments for Codex, Claude, or another AI';
  ex.addEventListener('click',function(){
    vxSendToAI(vxMode==='comment'?'comments':(vxMode==='edit'||vxMode==='add')?'edits':undefined)
  });
  vxDirtyBar.insertBefore(ex,document.getElementById('vxSaveBtn'));
  vxCSync();
})();
var vxBtnE=document.getElementById('vxBtnE'),vxBtnC=document.getElementById('vxBtnC'),
    vxAdd=document.getElementById('vxAddBtn');
function vxSync(){
  if(vxBtnE)vxBtnE.setAttribute('aria-pressed',String(vxMode==='edit'));
  vxBtnC.setAttribute('aria-pressed',String(vxMode==='comment'));
  if(vxAdd)vxAdd.setAttribute('aria-pressed',String(vxMode==='add'));
  var stakeholderComment=document.getElementById('vxStakeholderComment');
  if(stakeholderComment)stakeholderComment.setAttribute('aria-pressed',String(vxMode==='comment'));
}
function vxGo(m){if(window.vxStakeholder&&m!=='comment'&&m!=='view')return;
  vxSetMode(vxMode===m?'view':m);vxSync()}
if(vxBtnE)vxBtnE.addEventListener('click',function(){vxGo('edit')});
vxBtnC.addEventListener('click',function(){vxGo('comment')});
if(vxAdd)vxAdd.addEventListener('click',function(){vxGo('add')});
if(window.vxStakeholder){
  var stakeholderComment=document.createElement('button');
  stakeholderComment.id='vxStakeholderComment';stakeholderComment.textContent='Comment';
  stakeholderComment.title='Leave a request for the strategist (C)';
  stakeholderComment.setAttribute('aria-pressed','false');
  stakeholderComment.setAttribute('data-vx-runtime','stakeholder-comment');
  stakeholderComment.addEventListener('click',function(){vxGo('comment')});
  var stakeholderSlot=document.getElementById('vxPresWrap')||document.querySelector('header.top');
  stakeholderSlot.insertBefore(stakeholderComment,stakeholderSlot.firstChild);
}
addEventListener('keydown',function(e){
  if(vxTyping(e))return;
  if(e.key==='e'||e.key==='E')vxGo('edit');
  if(e.key==='n'||e.key==='N')vxGo('add');
});

/* Derive compact E/N/C totals from the opened-file baseline.
   Anchor-based matching survives display renumbering and ordinary reordering;
   exact canonical matches are paired first when an anchor is shared. */
var vxActivityFlash=null,vxActivityPending=null,vxActivityTimer=0;
function vxActivityKey(o,scope){
  return scope+'|'+String(o&&o.step||'')+'|'+String(o&&(o.variant||o.control||o.sel)||'');
}
function vxActivityCanon(o){
  var x={};['kind','tag','title','body','before','after','control','variant','step','sel']
    .forEach(function(k){if(o&&o[k]!=null)x[k]=o[k]});
  return JSON.stringify(x);
}
function vxActivityPair(cur,base,scope){
  var pools={},e=0,n=0;
  (base||[]).forEach(function(o){
    var k=vxActivityKey(o,scope);(pools[k]||(pools[k]=[])).push({o:o,used:false});
  });
  (cur||[]).forEach(function(o){
    var k=vxActivityKey(o,scope),a=pools[k]||[],canon=vxActivityCanon(o),m=null;
    for(var i=0;i<a.length;i++)if(!a[i].used&&vxActivityCanon(a[i].o)===canon){m=a[i];break}
    if(!m)for(var j=0;j<a.length;j++)if(!a[j].used){m=a[j];break}
    if(!m){n++;return}
    m.used=true;if(vxActivityCanon(m.o)!==canon)e++;
  });
  Object.keys(pools).forEach(function(k){pools[k].forEach(function(m){if(!m.used)e++})});
  return {e:e,n:n};
}
function vxActivityCounts(){
  var out={e:0,n:0,c:vxComments.length},keys={};
  Object.keys(vxOriginNotes||{}).forEach(function(k){keys[k]=1});
  Object.keys(landingNotes||{}).forEach(function(k){keys[k]=1});
  Object.keys(keys).forEach(function(k){
    var p=vxActivityPair(landingNotes[k]||[],(vxOriginNotes&&vxOriginNotes[k])||[],'lp:'+k);
    out.e+=p.e;out.n+=p.n;
  });
  if(surface.journey){
    var jp=vxActivityPair(surface.journey.notes||[],vxOriginJNotes||[],'journey');
    out.e+=jp.e;out.n+=jp.n;
  }
  return out;
}
function vxHasUnsavedEdits(){
  if(JSON.stringify(landingNotes)!==JSON.stringify(vxFilePristine))return true;
  return !!(surface.journey&&JSON.stringify(surface.journey.notes||[])!==JSON.stringify(vxJFilePristine||[]));
}
function vxActivityComparable(value){
  return JSON.stringify(value==null?null:value,function(key,item){
    return key==='vxid'?undefined:item;
  });
}
function vxActivityHasWork(){
  vxStoreCurrentScope();
  var states=surface.serializeExperiments();
  return Object.keys(vxExperimentScopes).some(function(id){
    var scope=vxExperimentScopes[id]||{},state=states[id]||{};
    /* Stable note IDs are added lazily when an experiment is first opened.
       They are runtime bookkeeping, not user work. */
    return vxActivityComparable(state.notes||{})!==vxActivityComparable(scope.filePristine||{})||
      vxActivityComparable(state.jnotes||[])!==vxActivityComparable(scope.jFilePristine||[])||
      JSON.stringify(scope.comments||[])!==JSON.stringify(scope.filePristineComments||[]);
  });
}
function vxActivityKeyHTML(letter,label,count,kind){
  var changed=vxActivityFlash&&vxActivityFlash.kind===kind?' vx-'+kind+'-change':'';
  return '<span class="vx-hkey"><b>'+letter+'</b>'+
    (count?'<sup class="vx-hcount'+changed+'">'+count+'</sup>':'')+'</span> '+label;
}
function vxActivityRecentHTML(){
  if(!vxActivityFlash)return '';
  var msg=vxActivityFlash.kind==='comment'?'Comment added':
    vxActivityFlash.kind==='new'?'Note added':'Edit saved locally';
  return '<span class="vx-hrecent">✓ '+msg+'</span> · ';
}
function vxActivityShow(kind){
  clearTimeout(vxActivityTimer);vxActivityFlash={kind:kind};vxActivityPending=null;
  vxHintSync();
  vxActivityTimer=setTimeout(function(){vxActivityFlash=null;vxHintSync()},1800);
}
function vxRecordWork(kind){
  vxActivityPending=kind;
  if(vxMode==='view')vxActivityShow(kind);else vxHintSync();
}
var vxSetModeActivityBase=vxSetMode;
vxSetMode=function(m){
  var prev=vxMode,r=vxSetModeActivityBase(m);
  if(m==='view'&&prev!=='view'&&vxActivityPending)vxActivityShow(vxActivityPending);
  return r;
};
var vxDirtyActivityBase=vxDirty;
vxDirty=function(on){
  var effective=on===false?false:vxActivityHasWork();
  var r=vxDirtyActivityBase(effective);vxHintSync();return r;
};
window.vxHintSync=function(){
  var j=document.body.classList.contains('deck-journey');
  var save=/Mac/.test(navigator.platform)?'⌘S':'Ctrl+S';
  var counts=vxActivityCounts(),recent=vxActivityRecentHTML();
  document.body.classList.toggle('vx-hasEdits',counts.e+counts.n>0);
  var clearEdits=document.getElementById('vxClearBtn'),
      clearComments=document.getElementById('vxClearCBtn');
  if(clearEdits)clearEdits.hidden=!vxHasUnsavedEdits();
  if(clearComments)clearComments.hidden=counts.c===0;
  if(vxRecoveryMore){
    vxRecoveryMore.hidden=(!clearEdits||clearEdits.hidden)&&(!clearComments||clearComments.hidden);
    if(vxRecoveryMore.hidden)vxRecoveryMenuOpen(false);
  }
  var send=document.getElementById('vxExport'),total=counts.e+counts.n+counts.c;
  if(send){
    send.textContent=vxMode==='comment'?'Send comments to AI':
      (vxMode==='edit'||vxMode==='add')?'Send edits to AI':
      counts.c&&counts.e+counts.n?'Send all '+total+' to AI':
      counts.c?'Send '+counts.c+' comment'+(counts.c===1?'':'s')+' to AI':
      counts.e+counts.n?'Send '+(counts.e+counts.n)+' edit'+(counts.e+counts.n===1?'':'s')+' to AI':'Send to AI';
  }
  if(typeof vxFrameModeSync==='function')vxFrameModeSync();
  vxHint.className=vxActivityFlash?'vx-flash-'+vxActivityFlash.kind:'';
  vxHint.innerHTML=
    vxMode==='edit'?(j?'<b>Edit</b> — use ✎ on a note to open its form · <b>Esc</b> done'
                      :'<b>Edit</b> — click any note text to retype · ✎ opens the full form · <b>Esc</b> done'):
    vxMode==='comment'?'<b>Comment</b> — click anything, leave a request for the agent · <b>Esc</b> done':
    vxMode==='add'?(j?'<b>New note</b> — click an element in the live funnel (right pane) · <b>Esc</b> cancel'
                     :'<b>New note</b> — click the element the note describes (either page) · <b>Esc</b> cancel'):
    window.vxStakeholder?recent+vxActivityKeyHTML('C','comment',counts.c,'comment')+
      ' · <b>P</b> presenter · <b>← →</b> step · send comments when done':
    recent+vxActivityKeyHTML('E','edit',counts.e,'edit')+' · '+
      vxActivityKeyHTML('N','new note',counts.n,'new')+' · '+
      vxActivityKeyHTML('C','comment',counts.c,'comment')+
      ' · <b>P</b> presenter · <b>← →</b> step · <b>'+save+'</b> save';
  vxSync();
};
new MutationObserver(function(){vxHintSync()}).observe(document.body,
  {attributes:true,attributeFilter:['class']});
vxHintSync();

/* A small semantic label follows the pointer only over targets the active mode
   can actually use. This replaces the inherited magnifying-glass ambiguity. */
var vxPointerCue=document.createElement('div');vxPointerCue.id='vxPointerCue';
vxPointerCue.setAttribute('data-vx-runtime','pointer-cue');document.body.appendChild(vxPointerCue);
function vxCueShow(x,y,m,label){
  vxPointerCue.dataset.mode=m;vxPointerCue.textContent=label;
  vxPointerCue.style.left=Math.min(x,innerWidth-120)+'px';vxPointerCue.style.top=Math.min(y,innerHeight-42)+'px';
  vxPointerCue.classList.add('on');
}
function vxCueHide(){vxPointerCue.classList.remove('on')}
document.addEventListener('pointermove',function(e){
  if(vxMode==='view'||e.target.closest('#vxCPop,#vxDrawer,#vxTour,#vxSheet,header.top,#vxActivityDock,#vxHelp'))return vxCueHide();
  var valid=false,label='';
  if(vxMode==='comment'){
    valid=!!e.target.closest('.pane__scroll,.vx-prototype-blocker,.rail__list,#jnpanel,#jstage');label='Add comment';
  }else if(vxMode==='add'){
    valid=!!e.target.closest('.pane__scroll,.vx-prototype-blocker')&&!e.target.closest('body.deck-journey #jcscroll');label='Add CRO note';
  }else if(vxMode==='edit'){
    valid=!!e.target.closest('.vx-prototype-blocker,.note__title,.note__body,.b-before span,.b-after span,.mk__t,.mk__b,[data-a].is-anchor,.vx-tools button');
    label='Edit note';
  }
  if(valid)vxCueShow(e.clientX,e.clientY,vxMode,label);else vxCueHide();
},{passive:true});
document.addEventListener('pointerleave',vxCueHide);

/* --- inline editing, shared by rail cards and gutter callouts --- */
/* While a contenteditable has focus, the caret owns every key: the original
   deck's navigator only guards input/textarea/surface.select, so without this,
   arrow keys step notes mid-word and Esc resets the zoom instead of
   finishing the edit. Capture phase beats every other handler. */
addEventListener('keydown',function(e){
  var ae=document.activeElement;
  if(!ae||!ae.isContentEditable)return;
  if(e.key==='Escape'){e.preventDefault();ae.blur();}
  e.stopPropagation();
},true);
function vxCommit(n,field,value){
  var o=surface.notes.filter(function(x){return x.n===n})[0];
  if(!o||o[field]===(value||''))return;
  o[field]=value||'';
  vxRecordWork('edit');
  vxDirty();surface.buildMarkers();surface.renderRail();
  if(surface.active===n)surface.select(n,{scroll:false});
}
function vxInline(host,n,field){
  if(host.getAttribute('contenteditable')==='true')return;
  host.setAttribute('contenteditable','true');host.focus();
  host.addEventListener('blur',function done(){
    host.removeEventListener('blur',done);
    host.removeAttribute('contenteditable');
    vxCommit(n,field,host.textContent.trim());
  });
}
document.addEventListener('click',function(e){
  if(vxMode!=='edit')return;
  var host=e.target.closest('.note__title,.note__body,.b-before span,.b-after span,.mk__t,.mk__b');
  if(!host)return;
  var holder=host.closest('.note,.mk');if(!holder)return;
  e.preventDefault();e.stopPropagation();
  var n=Number(holder.dataset.n);
  var field=host.classList.contains('note__title')||host.classList.contains('mk__t')?'title':
            host.classList.contains('note__body')||host.classList.contains('mk__b')?'body':
            host.closest('.b-before')?'before':'after';
  vxInline(host,n,field);
},true);
/* clicking an annotated element on the page in edit mode opens its form */
document.addEventListener('click',function(e){
  if(vxMode!=='edit')return;
  var t=e.target.closest('[data-a].is-anchor');
  if(!t||!t.dataset.an||e.target.closest('.mk'))return;
  e.preventDefault();e.stopPropagation();
  var o=surface.notes.filter(function(x){return x.n===Number(t.dataset.an)})[0];
  if(o)vxOpenDrawer(o,'');
},true);

/* --- identical tool rows: rail cards AND gutter callouts --- */
function vxToolRow(n){
  var tools=document.createElement('div');
  tools.innerHTML='<button data-t="edit">✎ Edit</button><button data-t="cmt">💬 Comment</button>';
  tools.addEventListener('click',function(e){
    var b=e.target.closest('button');if(!b)return;
    e.stopPropagation();
    var o=surface.notes.filter(function(x){return x.n===n})[0];if(!o)return;
    if(b.dataset.t==='edit')vxOpenDrawer(o,'');
    else{var r=e.target.getBoundingClientRect();vxOpenPop(r.left,r.bottom+6,
      document.querySelector('.note[data-n="'+n+'"]')||e.target)}
  });
  return tools;
}
function vxDecorateRail(){
  document.querySelectorAll('#railList .note').forEach(function(card){
    var t=vxToolRow(Number(card.dataset.n));t.className='vx-tools';card.appendChild(t);
  });
  /* rebuilds drop the `hid` classes — reapply the active filter, falling back
     to All when the last matching note disappeared */
  if(surface.filterKind!=='all'){
    var btn=document.getElementById(surface.filterKind==='imp'?'fImp':'fNew');
    if(btn&&!btn.hidden)surface.applyFilter(surface.filterKind,btn);
    else surface.applyFilter('all',document.getElementById('fAll'));
  }
  vxSchedulePins();
}
function vxDecorateMarkers(){
  document.querySelectorAll('.anno .mk').forEach(function(mk){
    if(mk.querySelector('.mk__tools'))return;
    var t=vxToolRow(Number(mk.dataset.n));t.className='mk__tools';
    mk.querySelector('.mk__card').appendChild(t);
  });
}
workflowRailChanged=vxDecorateRail;
workflowMarkersChanged=vxDecorateMarkers;
surface.connectWorkflow({
  mode:function(){return vxMode},path:vxPath,describe:vxDescribe,
  openComment:vxOpenPop,openDrawer:vxOpenDrawer,toast:vxToast,copySheet:vxCopySheet,go:vxGo,setMode:vxSetMode,
  cueShow:vxCueShow,cueHide:vxCueHide,showComment:vxShowComment,
  switchExperiment:vxSwitchExperiment
},workflowSurfaceChanged);
surface.renderRail();surface.buildMarkers();if(surface.active)surface.select(surface.active,{scroll:false});

/* --- the full form (drawer): edit existing or create from a picked element --- */
var vxDraft=null,vxDrawerReturn=null;
var vxDrawer=document.createElement('div');vxDrawer.id='vxDrawer';
vxDrawer.innerHTML='<h3 id="vxDTitle">New review note</h3><p class="anchor" id="vxDAnchor"></p>'+
  '<label>Kind</label><div class="kseg" id="vxDKind">'+
  '<button data-k="imp" aria-pressed="true">Changed · control and variant</button>'+
  '<button data-k="new" aria-pressed="false">Added · variant only</button></div>'+
  '<label>What changed</label><input id="vxDT" placeholder="Describe the change in one line">'+
  '<label>Why we made this change</label><textarea id="vxDB" placeholder="Use the reason from the conversation and the outcome we expect."></textarea>'+
  '<label id="vxDBeL">What people see now</label><input id="vxDBe" placeholder="Describe the current experience">'+
  '<label>What changes in this version</label><input id="vxDAf" placeholder="Describe the proposed experience">'+
  '<div class="row"><button id="vxDDel" style="margin-right:auto;color:var(--danger)">Delete</button>'+
  '<button id="vxDCancel">Cancel</button><button class="pri" id="vxDSave">Save note</button></div>';
document.body.appendChild(vxDrawer);
function vxDKind(){
  return vxDrawer.querySelector('#vxDKind button[aria-pressed="true"]').dataset.k;
}
function vxDKindSet(k){
  vxDrawer.querySelectorAll('#vxDKind button').forEach(function(b){
    b.setAttribute('aria-pressed',String(b.dataset.k===k))});
  /* a NEW treatment has no control-side "before" — the field goes away */
  document.getElementById('vxDBeL').hidden=k==='new';
  document.getElementById('vxDBe').hidden=k==='new';
}
document.getElementById('vxDKind').addEventListener('click',function(e){
  var b=e.target.closest('button[data-k]');if(b)vxDKindSet(b.dataset.k);
});
function vxOpenDrawer(o,anchorDesc){
  vxDrawerReturn=document.activeElement;
  vxDraft=o;
  document.getElementById('vxDTitle').textContent=o.n?'Edit review note '+o.n:'New review note';
  document.getElementById('vxDAnchor').textContent=anchorDesc||'';
  vxDKindSet(o.kind||'imp');
  document.getElementById('vxDT').value=o.title||'';
  document.getElementById('vxDB').value=o.body||'';
  document.getElementById('vxDBe').value=o.before||'';
  document.getElementById('vxDAf').value=o.after||'';
  document.getElementById('vxDDel').style.display=o.n?'':'none';
  document.body.classList.add('vx-drawer');
  document.getElementById('vxDT').focus();
}
function vxCloseDrawer(restore){
  document.body.classList.remove('vx-drawer');vxDraft=null;
  if(restore!==false&&vxDrawerReturn&&vxDrawerReturn.isConnected)vxDrawerReturn.focus();
  vxDrawerReturn=null;
}
document.getElementById('vxDCancel').addEventListener('click',vxCloseDrawer);
addEventListener('keydown',function(e){
  if(e.key!=='Escape'||!document.body.classList.contains('vx-drawer'))return;
  e.preventDefault();e.stopImmediatePropagation();vxJMeta=null;vxCloseDrawer();
},true);
/* Never strand or silently discard a draft when the reviewer changes context. */
document.addEventListener('click',function(e){
  var switcher=e.target.closest('#segDeck button,#segMode button,.vtabs button,.j-chip');
  if(!switcher)return;
  if(document.body.classList.contains('vx-drawer')){
    e.preventDefault();e.stopImmediatePropagation();
    vxToast('Save or cancel the open note before changing views.');
    document.getElementById('vxDT').focus();return;
  }
  if(vxPop){
    var ta=vxPop.querySelector('textarea');
    if(ta&&ta.value.trim()){
      e.preventDefault();e.stopImmediatePropagation();
      vxToast('Add or cancel the open comment before changing views.');ta.focus();return;
    }
    vxClosePop();
  }
  var ae=document.activeElement;if(ae&&ae.isContentEditable)ae.blur();
  var preserveJourneyEdit=vxMode==='edit'&&switcher.matches('.j-chip');
  if(vxMode!=='view'&&!preserveJourneyEdit)vxGo('view');
},true);
document.getElementById('vxDDel').addEventListener('click',function(){
  if(!vxDraft||!vxDraft.n||vxJMeta)return;
  var d=vxDraft;
  vxConfirm('Delete note '+d.n+' — "'+(d.title||'untitled')+'"?',function(){
    var i=surface.notes.indexOf(d);if(i>=0)surface.notes.splice(i,1);
    surface.notes.forEach(function(o,j){o.n=j+1});
    vxRecordWork('edit');
    vxCloseDrawer();vxDirty();surface.renderRail();surface.buildMarkers();surface.deselect();vxSchedulePins();
  });
});
document.getElementById('vxDSave').addEventListener('click',function(){
  if(!vxDraft||vxJMeta)return;
  var wasNew=!vxDraft.n;
  vxDraft.kind=vxDKind();
  vxDraft.title=document.getElementById('vxDT').value.trim()||'Untitled change';
  vxDraft.body=document.getElementById('vxDB').value.trim();
  vxDraft.before=vxDraft.kind==='new'?'':document.getElementById('vxDBe').value.trim();
  vxDraft.after=document.getElementById('vxDAf').value.trim();
  if(vxDraft.kind==='new')delete vxDraft.control;
  if(!vxDraft.n){vxDraft.n=surface.notes.length+1;surface.notes.push(vxDraft)}
  vxEnsureNoteIds(surface.notes,'landing:'+String(surface.current||'default'));
  surface.notes.forEach(function(o,j){o.n=j+1});
  var nn=vxDraft.n;
  vxRecordWork(wasNew?'new':'edit');
  vxCloseDrawer();vxDirty();surface.renderRail();surface.buildMarkers();
  surface.select(nn);
});
document.addEventListener('click',function(e){
  if(vxMode!=='add')return;
  var t=e.target;
  if(t.closest('#vxDrawer,header.top,#vxWalk,#vxPane,#vxSheet,#vxDirty,#vxHint,.rail'))return;
  var scroll=t.closest('.pane__scroll');if(!scroll)return;
  e.preventDefault();e.stopPropagation();
  var isControl=!!t.closest('.pane--control');
  var root=scroll.querySelector('.phone:not([hidden]),.dpage:not([hidden])');
  if(!root)return;
  var path=vxPath(t,root);if(!path)return;
  var o={kind:isControl?'imp':'new'};
  o.variant=path;if(isControl)o.control=path;
  vxGo('view');
  vxOpenDrawer(o,'Anchored to '+(isControl?'control':'variant '+surface.current)+' · '+vxDescribe(t));
},true);

/* --- gutter marker click SELECTS; it never dismisses (that felt broken) --- */
document.addEventListener('click',function(e){
  var mk=e.target.closest('.mk');
  if(!mk||e.target.closest('.mk__tools'))return;
  e.stopPropagation();
  surface.select(Number(mk.dataset.n),{zoom:true});
},true);

/* ================= JOURNEY AUTHORING PARITY =================
   Same E / N / C vocabulary. Journey notes live inside the deck's sealed
   IIFE; everything below goes through the surface.journey handshake. Control-side
   journey screens are static captures, so new journey notes anchor the
   live variant funnel — the appropriate half of parity. */
var vxJMeta=null;   /* {idx:number|null} while the drawer edits a journey note */
function vxJKindOf(o){return o.tag==='new'?'new':'imp'}
function vxJOpenDrawer(idx,draft){
  vxJMeta={idx:idx};
  var o=idx!=null?surface.journey.notes[idx]:draft;
  vxOpenDrawer({n:idx!=null?idx+1:0,kind:vxJKindOf(o),title:o.title,body:o.body,
    before:o.before,after:o.after},
    idx!=null?'Journey note · step '+(surface.journey.stepname[o.step]||o.step)
             :'Anchored in the live funnel · step '+(surface.journey.stepname[draft.step]||draft.step));
  vxJMeta.draft=draft||null;
}
/* route the drawer's Save/Delete when a journey note is open */
(function(){
  var save=document.getElementById('vxDSave'),del=document.getElementById('vxDDel');
  save.addEventListener('click',function(){
    if(!vxJMeta)return;
    var wasNew=vxJMeta.idx==null;
    var o=vxJMeta.idx!=null?surface.journey.notes[vxJMeta.idx]:vxJMeta.draft;
    o.tag=vxDKind()==='new'?'new':'improved';
    o.title=document.getElementById('vxDT').value.trim()||'Untitled change';
    o.body=document.getElementById('vxDB').value.trim();
    o.before=o.tag==='new'?'':document.getElementById('vxDBe').value.trim();
    o.after=document.getElementById('vxDAf').value.trim();
    if(vxJMeta.idx==null)surface.journey.notes.push(o);
    vxEnsureNoteIds(surface.journey.notes,'journey');
    var i=surface.journey.notes.indexOf(o);
    vxRecordWork(wasNew?'new':'edit');
    vxJMeta=null;vxCloseDrawer();vxDirty();
    surface.journey.refresh();surface.journey.select(i);
  });
  del.addEventListener('click',function(e){
    if(!vxJMeta||vxJMeta.idx==null)return;
    var idx=vxJMeta.idx,o=surface.journey.notes[idx];
    vxConfirm('Delete journey note — "'+(o.title||'untitled')+'"?',function(){
      surface.journey.notes.splice(idx,1);
      vxRecordWork('edit');
      vxJMeta=null;vxCloseDrawer();vxDirty();
      surface.journey.refresh();surface.journey.reset();vxSchedulePins();
    });
  });
  var cancel=document.getElementById('vxDCancel');
  cancel.addEventListener('click',function(){vxJMeta=null});
})();
/* tools on journey note list items + the gutter callout (edit mode only) */
function vxJTools(idx){
  var t=document.createElement('div');t.className='vx-tools';
  t.innerHTML='<button data-t="edit">✎ Edit</button><button data-t="cmt">💬 Comment</button>';
  t.addEventListener('click',function(e){
    var b=e.target.closest('button');if(!b)return;
    e.stopPropagation();e.preventDefault();
    if(b.dataset.t==='edit')vxJOpenDrawer(idx);
    else{var r=b.getBoundingClientRect();
      vxOpenPop(r.left,r.bottom+6,document.querySelector('.j-np-item[data-i="'+idx+'"]')||b)}
  });
  return t;
}
var vxJourneyList=document.getElementById('jnplist');
if(vxJourneyList)new MutationObserver(function(){
  document.querySelectorAll('#jnplist li').forEach(function(li){
    if(li.querySelector('.vx-tools'))return;
    var item=li.querySelector('.j-np-item');if(!item)return;
    li.appendChild(vxJTools(Number(item.getAttribute('data-i'))));
  });
}).observe(vxJourneyList,{childList:true});
var vxJourneyStage=document.getElementById('jstage');
if(vxJourneyStage)new MutationObserver(function(){
  var g=document.querySelector('#jstage .j-gcall');
  if(!g||g.querySelector('.vx-tools'))return;
  var idx=surface.journey?surface.journey.selIdx():-1;
  if(idx>=0)g.appendChild(vxJTools(idx));
}).observe(vxJourneyStage,{childList:true});
/* N inside the journey: pick an element in the LIVE funnel iframe */
function vxJWireFrame(){
  var fd=surface.journey&&surface.journey.frameDoc();
  if(!fd||!fd.body||fd.body.dataset.vxWired)return;
  fd.body.dataset.vxWired='1';
  var st=fd.createElement('style');
  st.textContent='.vx-cdot{position:absolute;width:18px;height:18px;border-radius:50%;'+
    'background:#c89cff;color:#16071f;font:800 10px/18px sans-serif;text-align:center;'+
    'box-shadow:0 0 0 2px #fff,0 0 0 5px rgba(200,156,255,.3);z-index:99}'+
    'body.vx-mode-comment,body.vx-mode-comment *{cursor:crosshair!important}'+
    'body.vx-mode-add,body.vx-mode-add *{cursor:crosshair!important}';
  fd.head.appendChild(st);
  fd.addEventListener('click',vxPinClick,true);
  vxSchedulePins();
  fd.addEventListener('click',function(e){
    if(vxMode!=='add'&&vxMode!=='comment')return;
    e.preventDefault();e.stopPropagation();
    var t=e.target;
    var fr=surface.journey.frameEl().getBoundingClientRect();
    var seg=[],el=t;
    while(el&&el!==fd.body&&el.nodeType===1){
      var s=el,i=1;while(s.previousElementSibling){s=s.previousElementSibling;i++}
      seg.unshift(el.tagName.toLowerCase()+':nth-child('+i+')');el=el.parentElement;
    }
    var named=t.closest&&t.closest('[data-a],[data-cro]'),frameSel='body>'+seg.join('>'),frameAnchor=null;
    if(named){var fa=named.hasAttribute('data-a')?'data-a':'data-cro',fv=named.getAttribute(fa);
      frameSel='['+fa+'="'+String(fv).replace(/"/g,'\\"')+'"]';frameAnchor={attribute:fa,value:fv}}
    if(vxMode==='comment'){
      var x=fr.left+(e.clientX||40),y=fr.top+(e.clientY||40);
      vxOpenPop(Math.min(x,innerWidth-290),Math.min(y,innerHeight-190),t,
        'journey · step '+(surface.journey.stepname[surface.journey.cur.v]||surface.journey.cur.v)+' · '+vxDescribe(t),
        {kind:'frame',step:surface.journey.cur.v,anchor:frameAnchor,sel:frameSel});
      return;
    }
    vxGo('view');
    vxJOpenDrawer(null,{step:surface.journey.cur.v,tag:'new',sel:frameSel,
      title:'',body:'',before:'',after:''});
  },true);
  fd.addEventListener('mousemove',function(e){
    if(vxMode!=='add'&&vxMode!=='comment')return vxCueHide();
    var fr=surface.journey.frameEl().getBoundingClientRect();
    vxCueShow(fr.left+e.clientX,fr.top+e.clientY,vxMode,vxMode==='add'?'Add CRO note':'Add comment');
  },{passive:true});
  fd.addEventListener('mouseleave',vxCueHide);
  fd.addEventListener('keydown',function(e){
    if(window.vxForwardFrameKeydown){
      window.vxForwardFrameKeydown(e,/^(e|E|n|N|c|C|p|P|Escape)$/)
    }
  },true);
  vxFrameModeSync();
  vxPreviewApply();
}
function vxFrameModeSync(){
  var fd=surface.journey&&surface.journey.frameDoc();if(!fd||!fd.body)return;
  fd.body.classList.remove('vx-mode-add','vx-mode-comment');
  if(vxMode==='add'||vxMode==='comment')fd.body.classList.add('vx-mode-'+vxMode);
}
var vxJFrame=surface.journey&&surface.journey.frameEl();
if(vxJFrame)vxJFrame.addEventListener('load',function(){setTimeout(vxJWireFrame,0)});
vxJWireFrame();
workflowJourneyWired=function(){vxSchedulePins();vxJWireFrame()};
/* add-mode clicks on the static control capture get a gentle explanation */
document.addEventListener('click',function(e){
  if(vxMode!=='add'||!document.body.classList.contains('deck-journey'))return;
  if(!e.target.closest('#jcscroll'))return;
  e.preventDefault();e.stopPropagation();
  vxToast('The control side is a static capture — anchor journey notes on the live variant funnel (right pane).');
},true);

})();
(function(){"use strict";

/* ---- cross-deck control parity (see PARITY_CSS note) ---- */
var vxTogSync=document.getElementById('tSync'),
    vxTogAnn=document.getElementById('tNotes'),
    vxTAuto=document.getElementById('tAuto');
function vxOnJ(){return document.body.classList.contains('deck-journey')}
var vxJSync=true;                     /* journey pairing starts on (original behavior) */
try{if(localStorage.getItem('vxJSync')==='0')vxJSync=false}catch(e){}

/* At tablet and phone widths, Screens and CRO Notes are explicit peer views.
   This avoids a sidebar covering the very comparison it explains. */
(function(){
  var stage=document.getElementById('jstage');if(!stage)return;
  var sw=document.createElement('div');sw.id='vxJourneyView';sw.dataset.vxRuntime='journey-view';
  sw.setAttribute('role','group');sw.setAttribute('aria-label','Journey workspace view');
  sw.innerHTML='<button data-vx-view="screens" aria-pressed="true">Screens</button>'+
    '<button data-vx-view="notes" aria-pressed="false">CRO Notes</button>';
  stage.appendChild(sw);
  function setView(view,focus){
    var notes=view==='notes';document.body.classList.toggle('vx-journey-notes',notes);
    sw.querySelectorAll('button').forEach(function(b){b.setAttribute('aria-pressed',String((b.dataset.vxView==='notes')===notes))});
    if(notes&&window.vxNotesRail&&window.vxNotesRail.isHidden('journey'))window.vxNotesRail.setHidden('journey',false);
    if(focus){var target=notes?document.getElementById('jnpanel'):document.querySelector('#jstage .j-phone:not([style*="display: none"])');
      if(target){target.setAttribute('tabindex','-1');target.focus()}}
  }
  sw.addEventListener('click',function(e){var b=e.target.closest('button[data-vx-view]');if(b)setView(b.dataset.vxView,true)});
  var edge=document.getElementById('vxRailOpen');if(edge)edge.addEventListener('click',function(){
  if(vxOnJ()&&matchMedia('(max-width:1180px)').matches)setView('notes',false)
  },true);
  new MutationObserver(function(){
    /* Only write the view class when a transition is actually needed. A body
       class observer must never retrigger itself with an idempotent write. */
    if(document.body.classList.contains('vx-jrailHide')&&
       document.body.classList.contains('vx-journey-notes'))setView('screens',false);
    if(!vxOnJ()&&document.body.classList.contains('vx-journey-notes'))
      document.body.classList.remove('vx-journey-notes');
  }).observe(document.body,{attributes:true,attributeFilter:['class']});
  addEventListener('resize',function(){if(innerWidth>1180&&document.body.classList.contains('vx-journey-notes'))
    document.body.classList.remove('vx-journey-notes')});
})();

/* Source links are optional and provenance-aware. A local HTML review never
   pretends that it created a hosted link. */
function vxAttachControlLink(head,href,context,label){
  if(!head||!href||head.querySelector('.vx-control-live'))return;
  head.classList.add('vx-control-source');
  var a=document.createElement('a');
  a.className='vx-control-live';a.href=href;a.target='_blank';a.rel='noopener';
  a.textContent=label+' \u2197';
  a.setAttribute('aria-label',label+' for '+context+' in a new tab');
  head.appendChild(a);
}
function vxRefreshControlLanguage(){
  document.querySelectorAll('.vx-control-live').forEach(function(link){link.remove()});
  var control=workflowActiveControlInfo(),isConcept=control.provenance==='concept-reconstruction';
  var label='Open original page';
  if(!isConcept&&control.sourceUrl)vxAttachControlLink(
    document.querySelector('.pane--control .pane__head'),control.sourceUrl,
    'the landing page',label);
  var journeySource=document.querySelector('#jctl a[href]');
  if(journeySource){
    journeySource.hidden=true;
  }
}
workflowControlChanged=vxRefreshControlLanguage;
vxRefreshControlLanguage();

/* Sync + chip clicks: journey clicks never reach the LP handler (capture) */
document.addEventListener('click',function(e){
  if(!vxOnJ())return;
  if(vxTogSync&&(e.target===vxTogSync||vxTogSync.contains(e.target))){
    e.stopPropagation();
    vxJSync=!vxJSync;
    surface.setJourneySync(vxJSync);
    vxTogSync.setAttribute('aria-pressed',String(vxJSync));
    try{localStorage.setItem('vxJSync',vxJSync?'1':'0')}catch(x){}
    return;
  }
  if(!vxJSync&&surface.journey){
    var ch=e.target.closest&&e.target.closest('.j-chip');
    if(ch){
      e.stopPropagation();
      var id=ch.id.replace('jchip-','');
      var side=ch.closest('#jrailc')?'c':'v';
      surface.journey.selectPair(side==='c'?id:surface.journey.cur.c, side==='v'?id:surface.journey.cur.v, side==='v');
    }
  }
},true);
/* Funnel advance reads this surface-owned flag in its canonical handler. */
surface.setJourneySync(vxJSync);

/* Annotations on journey: clear the in-frame highlight when the layer goes off */
if(vxTogAnn)vxTogAnn.addEventListener('click',function(){
  if(!vxOnJ()||!surface.journey)return;
  if(!document.body.classList.contains('notes-on')){
    var fd=surface.journey.frameDoc();
    if(fd)fd.querySelectorAll('.cmp-focus').forEach(function(el){el.classList.remove('cmp-focus')});
  }else{surface.journey.refresh()}
});

function vxJourneyA11y(){
  document.querySelectorAll('#jrailc .j-chip,#jrailv .j-chip').forEach(function(b){
    var on=b.classList.contains('j-on');b.setAttribute('aria-pressed',String(on));
    if(on)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');
  });
  document.querySelectorAll('#jnpfilters button').forEach(function(b){
    b.setAttribute('aria-pressed',String(b.classList.contains('j-on')));
  });
  document.querySelectorAll('#jnplist .j-np-item').forEach(function(b){
    b.setAttribute('role','button');b.setAttribute('tabindex','0');
    b.setAttribute('aria-pressed',String(b.classList.contains('j-on')));
    if(!b.dataset.vxKey){b.dataset.vxKey='1';b.addEventListener('keydown',function(e){
      if(e.key==='Enter'||e.key===' '){e.preventDefault();b.click()}
    })}
  });
  document.querySelectorAll('.vxMap .mchip[data-v]').forEach(function(b){
    b.setAttribute('aria-pressed',String(b.classList.contains('on')));
  });
}
var vxJA11yHost=document.getElementById('deck-journey');
if(vxJA11yHost)new MutationObserver(vxJourneyA11y).observe(vxJA11yHost,
  {subtree:true,childList:true,attributes:true,attributeFilter:['class']});
vxJourneyA11y();

/* Reveal on load: each newly loaded journey screen may reveal its first note,
   including the initial screen. Manual deselection is respected until the next load. */
 (function(){
  var lastV=null,guard=false,first=true;
  workflowJourneyRevealed=function(d){
    var sel=d.sel,idxs=d.idxs,cur=d.current;
    vxJourneyA11y();
    var v=cur&&cur.v;
    if(!first&&v===lastV)return;
    first=false;
    lastV=v;
    if(guard||sel>=0||!idxs||!idxs.length)return;
    if(!vxTAuto||vxTAuto.getAttribute('aria-pressed')!=='true')return;
    guard=true;
    setTimeout(function(){
      try{if(surface.journey&&surface.journey.cur.v===v&&surface.journey.selIdx()<0)surface.journey.select(idxs[0])}
      finally{guard=false}
    },60);
  };
})();

/* Author tools sit beside the active notes rail, then return to the screen
   edge when that rail is closed. This is geometry-derived because the landing
   and journey rails use different layout systems. */
function vxPositionAuthorTools(){
  var j=vxOnJ(),hidden=document.body.classList.contains(j?'vx-jrailHide':'vx-railHide');
  var rail=document.querySelector(j?'#jnpanel':'#vxLpRail');
  var right=14;
  if(!hidden&&rail&&!rail.hidden){
    var r=rail.getBoundingClientRect();
    /* stacked full-width rails have no meaningful left gutter; keep the tools
       on the screen edge there instead of pushing them off-canvas */
    if(r.width>0&&r.left>50&&r.top<innerHeight&&r.bottom>0)
      right=Math.max(14,innerWidth-r.left+12);
  }
  document.documentElement.style.setProperty('--vx-author-tools-right',right+'px');
  surface.positionAnnotationTab();
}

window.vxScheduleAuthorTools=function(){
  vxPositionAuthorTools();
};
addEventListener('resize',window.vxScheduleAuthorTools);
var vxJourneyScroller=document.getElementById('deck-journey');
if(vxJourneyScroller)vxJourneyScroller.addEventListener('scroll',window.vxScheduleAuthorTools,{passive:true});
new MutationObserver(window.vxScheduleAuthorTools).observe(document.body,
  {attributes:true,attributeFilter:['class']});
['vxLpRail','jnpanel'].forEach(function(id){
  var el=document.getElementById(id);if(!el)return;
  new MutationObserver(window.vxScheduleAuthorTools).observe(el,
    {attributes:true,attributeFilter:['hidden','class','style']});
  if(window.ResizeObserver)new ResizeObserver(window.vxScheduleAuthorTools).observe(el);
});
vxPositionAuthorTools();

/* per-deck labels + button states without cross-talk */
function vxParitySync(){
  var j=vxOnJ();
  if(vxTogSync){
    vxTogSync.textContent=j?'Sync steps':'Sync scroll';
    vxTogSync.title=j?'Advance the control and variant funnels together'
                     :'Scroll both pages together';
  }
  if(vxTAuto){
    vxTAuto.textContent=j?'Reveal on load':'Reveal on scroll';
    vxTAuto.title=j?'Select the first CRO note when a journey screen loads'
                   :'Notes surface.select themselves as their elements scroll into view';
  }
}
(function(){
  var wasJ=vxOnJ(),lpSyncAria=vxTogSync?vxTogSync.getAttribute('aria-pressed'):'false';
  new MutationObserver(function(){
    var j=vxOnJ();
    if(j!==wasJ){
      if(j){lpSyncAria=vxTogSync?vxTogSync.getAttribute('aria-pressed'):'false';
        if(vxTogSync)vxTogSync.setAttribute('aria-pressed',String(vxJSync));
      }else if(vxTogSync)vxTogSync.setAttribute('aria-pressed',lpSyncAria);
      wasJ=j;
    }
    vxParitySync();
  }).observe(document.body,{attributes:true,attributeFilter:['class']});
  if(vxOnJ()&&vxTogSync)vxTogSync.setAttribute('aria-pressed',String(vxJSync));
  vxParitySync();
})();

})();
(function(){"use strict";

/* ---- P1 header assembly: dividers mark the groups and Presenter becomes a
        round play button. Live source actions stay with each CONTROL pane. ---- */
(function(){
  var top=document.querySelector('header.top');if(!top)return;
  /* every insertion anchors on the overflow-manager slot markers, which never
     leave the bar — the elements themselves may be inside the ··· sheet when
     this runs (narrow first paint), and insertBefore on an absent child throws */
  function slotFor(key){return top.querySelector('.vx-slot[data-vx-for="'+key+'"]')}
  function refFor(el,sl){return (el&&el.parentElement===top)?el:sl}
  var viewEl=document.getElementById('lpViewCtl'),
      legendEl=document.querySelector('.legend');
  var viewSlot=slotFor('lpViewCtl'),legendSlot=slotFor('legend');
  function hdiv(){var d=document.createElement('span');d.className='vx-hdiv';return d}
  var vRef=refFor(viewEl,viewSlot);if(vRef)top.insertBefore(hdiv(),vRef);
  var lRef=refFor(legendEl,legendSlot);if(lRef)top.insertBefore(hdiv(),lRef);
  var p=document.getElementById('vxPres');
  if(p){
    p.innerHTML='<svg width="11" height="12" viewBox="0 0 11 12" aria-hidden="true">'+
      '<path d="M1 1l9 5-9 5z" fill="currentColor"/></svg>';
    p.setAttribute('aria-label','Presenter');
    p.title='Presenter — step through the notes (P)';
  }
})();

/* Capability-aware chrome: generated artifacts declare their real surfaces on
   <html>. When a declaration is absent, infer from the shipped roots. A
   one-deck, one-viewport, one-variant, or static artifact never advertises a
   control that leads to an empty or inert state. */
(function(){
  function declared(name,inferred){
    var meta=document.querySelector('meta[name="vx-'+name+'"]');
    var raw=document.documentElement.getAttribute('data-vx-'+name)||(meta&&meta.content);
    if(raw==null)return inferred;
    return raw.split(',').map(function(x){return x.trim()}).filter(Boolean);
  }
  function prototypeKeys(){
    var data=document.getElementById('vx-prototype-sources');
    try{return Object.keys(data?JSON.parse(data.textContent):{})}catch(e){return []}
  }
  function click(el){if(el)el.click()}
  function sync(){
    var deckCtl=document.getElementById('segDeck'),lp=document.getElementById('deck-lp'),
        journey=document.getElementById('deck-journey');
    var inferredDecks=surface.experiments.reduce(function(out,experiment){
      (experiment.decks||[]).forEach(function(deck){if(out.indexOf(deck)<0)out.push(deck)});return out
    },[]);
    var decks=declared('decks',inferredDecks.length?inferredDecks:
      [lp?'landing':null,journey?'journey':null].filter(Boolean));
    var hasLp=decks.indexOf('landing')>=0&&!!lp,hasJourney=decks.indexOf('journey')>=0&&!!journey;
    if(deckCtl){
      var lpBtn=deckCtl.querySelector('[data-d="lp"]'),jBtn=deckCtl.querySelector('[data-d="journey"]');
      if(lpBtn)lpBtn.hidden=!hasLp;if(jBtn)jBtn.hidden=!hasJourney;
      deckCtl.hidden=(hasLp?1:0)+(hasJourney?1:0)<2;
      deckCtl.style.display=deckCtl.hidden?'none':'';
      var journeyActive=document.body.classList.contains('deck-journey')||
        document.body.classList.contains('deck-generic-journey');
      if(!hasLp&&hasJourney&&!journeyActive)click(jBtn);
      if(hasLp&&!hasJourney&&journeyActive)click(lpBtn);
    }
    var jview=document.getElementById('vxJourneyView');if(jview)jview.hidden=!hasJourney;

    var sourceKeys=prototypeKeys();
    var viewports=surface.experiment.viewports||declared('viewports',[
      document.querySelector('.pane--control .phone')||sourceKeys.some(function(k){return /-mobile$/.test(k)})?'mobile':null,
      document.querySelector('.pane--control .dpage')||sourceKeys.some(function(k){return /-desktop$/.test(k)})?'desktop':null
    ].filter(Boolean));
    var modeCtl=document.getElementById('lpViewCtl'),segMode=document.getElementById('segMode');
    if(segMode){
      var mobile=segMode.querySelector('[data-m="mobile"]'),desktop=segMode.querySelector('[data-m="desktop"]');
      var hasMobile=viewports.indexOf('mobile')>=0,hasDesktop=viewports.indexOf('desktop')>=0;
      if(mobile)mobile.hidden=!hasMobile;if(desktop)desktop.hidden=!hasDesktop;
      if(modeCtl){modeCtl.hidden=(hasMobile?1:0)+(hasDesktop?1:0)<2||
        (!hasLp&&!document.body.classList.contains('deck-generic-journey'));
        modeCtl.style.display=modeCtl.hidden?'none':''}
      if(!hasMobile&&hasDesktop&&document.body.classList.contains('mode-mobile'))click(desktop);
      if(hasMobile&&!hasDesktop&&document.body.classList.contains('mode-desktop'))click(mobile);
    }

    var variants=[];
    document.querySelectorAll('#seg button[data-v]').forEach(function(b){
      var key=b.dataset.v,exists=surface.experiment.variants.indexOf(key)>=0&&(
        sourceKeys.some(function(k){return k.indexOf(key+'-')===0})||
        (typeof landingNotes==='object'&&!!landingNotes[key]));
      b.hidden=!exists;if(exists)variants.push(b);
    });
    var variantCtl=document.getElementById('seg');if(variantCtl){variantCtl.hidden=variants.length<2;
      variantCtl.style.display=variantCtl.hidden?'none':''}
    if(variants.length&&!variants.some(function(b){return b.getAttribute('aria-pressed')==='true'}))click(variants[0]);
    if(!surface.preview.available()&&surface.preview.active())surface.preview.set(false);
    surface.preview.mount();
  }
  window.vxCapabilitySync=sync;
  document.addEventListener('click',function(e){
    if(e.target.closest&&e.target.closest('#segDeck,#segMode,#seg'))setTimeout(sync,0);
  },true);
  addEventListener('resize',sync);setTimeout(sync,0);
})();

})();
/* ---- refined mobile review ------------------------------------------
   Phones are intentionally review-only. Desktop authoring remains owned
   by the existing shared workflow above. */
(function(){'use strict';

  var mobile=matchMedia('(max-width:680px)');
  if(!surface)return;
  document.documentElement.dataset.mobileReview='refined-guided';
  var bar=document.getElementById('vxPane'),walk=document.getElementById('vxWalk'),
      label=document.getElementById('vxLabel'),overflowSheet=document.getElementById('vxSheet'),
      presWrap=document.getElementById('vxPresWrap');
  if(!bar||!walk||!label)return;


  var backdrop=document.createElement('div');backdrop.id='vxMobileNoteBackdrop';backdrop.hidden=true;
  var sheet=document.createElement('section');sheet.id='vxMobileNoteSheet';sheet.hidden=true;
  sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');
  sheet.setAttribute('aria-labelledby','vxMobileNoteTitle');
  sheet.innerHTML='<div class="vx-mns-handle" aria-hidden="true"></div>'+
    '<div class="vx-mns-head"><div class="vx-mns-meta">'+
      '<div class="vx-mns-eyebrow"><span id="vxMobileNoteKind"></span><span id="vxMobileNoteCount"></span></div>'+
      '<h2 id="vxMobileNoteTitle"></h2></div>'+
      '<button id="vxMobileNoteClose" type="button" aria-label="Close note">×</button></div>'+
    '<div class="vx-mns-scroll"><p id="vxMobileNoteBody"></p><div id="vxMobileNoteCompare">'+
      '<div class="vx-mns-change" id="vxMobileNoteBeforeWrap"><b>Before</b><span id="vxMobileNoteBefore"></span></div>'+
      '<div class="vx-mns-change vx-mns-change--after" id="vxMobileNoteAfterWrap"><b>After</b><span id="vxMobileNoteAfter"></span></div>'+
    '</div></div><div class="vx-mns-foot">'+
      '<button id="vxMobileNotePrev" type="button">← Previous note</button>'+
      '<button id="vxMobileNoteNext" type="button">Next note →</button></div>';
  document.body.appendChild(backdrop);document.body.appendChild(sheet);

  var closeBtn=document.getElementById('vxMobileNoteClose'),kindEl=document.getElementById('vxMobileNoteKind'),
      countEl=document.getElementById('vxMobileNoteCount'),titleEl=document.getElementById('vxMobileNoteTitle'),
      bodyEl=document.getElementById('vxMobileNoteBody'),beforeWrap=document.getElementById('vxMobileNoteBeforeWrap'),
      afterWrap=document.getElementById('vxMobileNoteAfterWrap'),beforeEl=document.getElementById('vxMobileNoteBefore'),
      afterEl=document.getElementById('vxMobileNoteAfter');
  var returnFocus=null;

  function isJourney(){return document.body.classList.contains('deck-journey')&&surface.journey}
  function noteInfo(){
    if(isJourney()){
      var j=surface.journey,all=j.notes||[],idx=typeof j.selIdx==='function'?j.selIdx():-1;
      var step=idx>=0&&all[idx]?all[idx].step:(j.cur&&j.cur.v),group=[];
      all.forEach(function(note,i){if(!step||note.step===step)group.push({note:note,index:i})});
      if(!group.length&&all.length)group=all.map(function(note,i){return {note:note,index:i}});
      var pos=group.findIndex(function(item){return item.index===idx});if(pos<0)pos=0;
      var item=group[pos];if(!item)return null;
      return {note:item.note,pos:pos,total:group.length,
        step:j.stepname&&j.stepname[item.note.step]||item.note.step||''};
    }
    var notes=surface.notes||[],idx=notes.findIndex(function(note){return note.n===surface.active});
    if(idx<0)idx=0;if(!notes[idx])return null;
    return {note:notes[idx],pos:idx,total:notes.length,step:''};
  }
  function render(){
    var info=noteInfo();if(!info)return false;var note=info.note,
        kind=(note.kind==='new'||note.tag==='new')?'new':'improved';
    kindEl.dataset.kind=kind;kindEl.textContent=kind==='new'?'New':'Improved';
    countEl.textContent='Note '+(info.pos+1)+' of '+info.total+(info.step?' · '+info.step:'');
    titleEl.textContent=note.title||'Untitled change';bodyEl.textContent=note.body||'';
    beforeEl.textContent=note.before||'';afterEl.textContent=note.after||'';
    beforeWrap.hidden=!note.before;afterWrap.hidden=!note.after;
    document.getElementById('vxMobileNoteCompare').hidden=!note.before&&!note.after;
    return true;
  }
  function open(trigger){
    if(!mobile.matches||!render())return;
    returnFocus=trigger&&trigger.focus?trigger:document.activeElement;
    backdrop.hidden=false;sheet.hidden=false;document.body.classList.add('vx-mobile-note-open');
    requestAnimationFrame(function(){closeBtn.focus()});
  }
  function close(restore){
    if(!document.body.classList.contains('vx-mobile-note-open'))return;
    document.body.classList.remove('vx-mobile-note-open');
    setTimeout(function(){if(!document.body.classList.contains('vx-mobile-note-open')){
      backdrop.hidden=true;sheet.hidden=true;
    }},210);
    if(restore!==false&&returnFocus&&returnFocus.isConnected)returnFocus.focus();
  }
  function step(direction){
    var target=document.getElementById(direction<0?'vxPrev':'vxNext');if(target)target.click();
    setTimeout(function(){if(!render())close(false)},0);
  }

  label.setAttribute('role','button');label.setAttribute('tabindex','0');
  label.setAttribute('aria-haspopup','dialog');label.setAttribute('aria-controls','vxMobileNoteSheet');
  label.title='Open the full CRO note';
  label.addEventListener('click',function(){open(label)});
  label.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();open(label)}});
  closeBtn.addEventListener('click',function(){close(true)});backdrop.addEventListener('click',function(){close(true)});
  document.getElementById('vxMobileNotePrev').addEventListener('click',function(){step(-1)});
  document.getElementById('vxMobileNoteNext').addEventListener('click',function(){step(1)});

  /* Original marker selection still performs its scroll/zoom work. This later
     capture listener adds the missing mobile result: reveal the selected note. */
  document.addEventListener('click',function(e){
    if(!mobile.matches)return;
    var marker=e.target.closest&&e.target.closest('.mk,.j-gcall');
    if(!marker||e.target.closest('.vx-tools,.mk__tools'))return;
    setTimeout(function(){open(marker)},0);
  },true);

  function journeyNotes(on){
    var b=document.querySelector('#vxJourneyView [data-vx-view="'+(on?'notes':'screens')+'"]');
    if(b)b.click();else document.body.classList.toggle('vx-journey-notes',on);
  }
  function mountMenuActions(){
    if(mobile.matches&&document.body.classList.contains('vx-sheet')&&overflowSheet&&presWrap&&
       presWrap.parentElement!==overflowSheet)overflowSheet.appendChild(presWrap);
  }
  function expandedNoteFrom(target){
    if(!target||!target.closest)return null;
    var item=target.closest('.note.is-open,.j-np-item.j-on');
    if(!item)return null;
    if(item.matches('.note')&&document.body.classList.contains('vx-n')&&
       !document.body.classList.contains('deck-journey'))return item;
    if(item.matches('.j-np-item')&&document.body.classList.contains('deck-journey')&&
       document.body.classList.contains('vx-journey-notes'))return item;
    return null;
  }
  function openExpandedNoteInVariant(item){
    close(false);
    var pageNote=item.matches('.note'),index=Number(item.dataset[pageNote?'n':'i']),
        variant=bar.querySelector('button[data-p="v"]');
    if(variant)variant.click();
    requestAnimationFrame(function(){requestAnimationFrame(function(){
      if(pageNote&&typeof surface.select==='function')surface.select(index,{scroll:true});
      else if(!pageNote&&surface.journey&&typeof surface.journey.select==='function')surface.journey.select(index);
    })});
  }
  function routeExpandedNote(e){
    if(!mobile.matches)return;
    var item=expandedNoteFrom(e.target);if(!item)return;
    e.preventDefault();e.stopImmediatePropagation();openExpandedNoteInVariant(item);
  }
  document.addEventListener('click',routeExpandedNote,true);
  document.addEventListener('keydown',function(e){
    if(e.key==='Enter'||e.key===' ')routeExpandedNote(e);
  },true);
  bar.addEventListener('click',function(e){
    if(!mobile.matches)return;var b=e.target.closest('button[data-p]');if(!b)return;
    if(b.dataset.p==='n')close(false);
    if(!document.body.classList.contains('deck-journey'))return;
    setTimeout(function(){
      if(b.dataset.p==='n')journeyNotes(true);
      else if(document.body.classList.contains('vx-journey-notes'))journeyNotes(false);
    },0);
  });
  var wasJourney=false;
  function sync(){
    if(!mobile.matches){
      close(false);
      if(overflowSheet&&presWrap&&presWrap.parentElement===overflowSheet){
        var slot=document.querySelector('.vx-slot[data-vx-for="vxPresWrap"]'),top=document.querySelector('header.top');
        if(top)top.insertBefore(presWrap,slot&&slot.parentElement===top?slot:null);
      }
      wasJourney=false;return;
    }
    mountMenuActions();
    var journey=document.body.classList.contains('deck-journey');
    if(journey&&!wasJourney&&document.body.classList.contains('vx-n')&&
       !document.body.classList.contains('vx-journey-notes'))setTimeout(function(){journeyNotes(true)},0);
    if(journey){
      var notes=document.body.classList.contains('vx-journey-notes');
      bar.querySelectorAll('button[data-p]').forEach(function(b){
        var on=notes?b.dataset.p==='n':document.body.classList.contains('vx-'+b.dataset.p);
        b.setAttribute('aria-pressed',String(on));
      });
    }
    wasJourney=journey;
  }
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
  new MutationObserver(function(){if(document.body.classList.contains('vx-mobile-note-open'))render()})
    .observe(document.getElementById('vxTitle'),{subtree:true,childList:true,characterData:true});
  document.addEventListener('click',function(e){
    if(e.target.closest&&e.target.closest('#segDeck button,#vxMore'))close(false);
  },true);
  addEventListener('resize',sync);sync();

  /* Mobile is intentionally review-only. Desktop authoring remains untouched. */
  addEventListener('keydown',function(e){
    if(!mobile.matches)return;
    if(e.key==='Escape'&&document.body.classList.contains('vx-mobile-note-open')){
      e.preventDefault();e.stopImmediatePropagation();close(true);return;
    }
    if(!e.metaKey&&!e.ctrlKey&&/^[eEnNcC]$/.test(e.key)&&
       !(e.target.closest&&e.target.closest('input,textarea,select,[contenteditable="true"]'))){
      e.preventDefault();e.stopImmediatePropagation();
    }
  },true);
  sheet.addEventListener('keydown',function(e){
    if(e.key!=='Tab')return;
    var focusable=Array.prototype.filter.call(sheet.querySelectorAll('button,[href],[tabindex]:not([tabindex="-1"])'),
      function(el){return !el.hidden&&el.offsetParent!==null});
    if(!focusable.length)return;var first=focusable[0],last=focusable[focusable.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  });
})();
(function(){"use strict";
var owners={
  surface:['vxPane','vxWalk','vxCopyLink','vxCopyStakeholderLink','vxRailOpen','vxCorners'],
  workflow:['vxSheet','vxMore','vxPresWrap','vxActivityDock','vxHint','vxDirty',
    'vxHelp','vxTour','vxDrawer','vxCopySheet','vxToast','vxCPop','vxStakeholderComment',
    'vxMobileNoteBackdrop','vxMobileNoteSheet']
};
function mark(){Object.keys(owners).forEach(function(owner){
  owners[owner].forEach(function(id){var el=document.getElementById(id);
    if(el)el.setAttribute('data-vx-owner',owner);});
});
var hooks={
  vxBtnE:['data-vx-mode','edit'],vxAddBtn:['data-vx-mode','new'],
  vxBtnC:['data-vx-mode','comment'],vxStakeholderComment:['data-vx-mode','comment'],
  vxSendAI:['data-vx-action','send-ai'],vxSaveBtn:['data-vx-action','save-copy'],
  vxDownloadBtn:['data-vx-action','download-menu'],vxShareBtn:['data-vx-action','stakeholder-copy'],vxRailBtn:['data-vx-action','collapse-notes'],
  vxRailOpen:['data-vx-action','open-notes'],vxActivityDock:['data-vx-region','activity'],
  vxLpRail:['data-vx-region','notes'],vxEditBtns:['data-vx-region','mode-bar']
};
Object.keys(hooks).forEach(function(id){var el=document.getElementById(id),h=hooks[id];
  if(el)el.setAttribute(h[0],h[1]);});
}
mark();new MutationObserver(mark).observe(document.documentElement,{childList:true,subtree:true});
})();
}
createReviewWorkflow(reviewSurface);
