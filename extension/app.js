import { getActivePullRequest, getPullRequestContext, onActivePullRequestChange, readSettings, saveSettings, requestBackendPermission, parsePullRequestUrl } from './lib/browser.js';
import { reviewPullRequest, DEFAULT_API_ENDPOINT, validateEndpoint } from './lib/api.js';
import { DEFAULT_GUIDELINES } from './lib/standards.js';
import { DEMO_REVIEW, CLEAN_DEMO_REVIEW } from './lib/demo.js';
import { buildRepairPrompt } from './lib/repair.js';

const paths = {
  branch: '<circle cx="7" cy="5" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="7" cy="19" r="2.5"/><path d="M7 7.5v9M17 8.5c0 5-10 3-10 8"/>',
  scan: '<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3M7 12l3 3 7-7"/>',
  sliders: '<path d="M4 7h7m4 0h5M4 17h3m4 0h9"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  settings: '<path d="m9 3-1 3-3 1v4l2 1v2l-2 1v4l3 1 1 2h6l1-2 3-1v-4l-2-1v-2l2-1V7l-3-1-1-3Z" transform="translate(0 -1) scale(1 .98)"/><circle cx="12" cy="12" r="3"/>',
  expand: '<path d="M14 3h7v7m0-7-8 8M10 21H3v-7m0 7 8-8"/>',
  play: '<path d="m9 5 11 7-11 7Z"/>',
  github: '<path d="M9 19c-4 1-4-2-6-2m12 4v-3.5c0-1-.3-1.7-.8-2 2.7-.3 5.5-1.3 5.5-6A4.7 4.7 0 0 0 18.5 6c.1-.5.5-1.8-.1-3.3 0 0-1-.3-3.4 1.3a11 11 0 0 0-6 0C6.6 2.4 5.6 2.7 5.6 2.7 5 4.2 5.4 5.5 5.5 6a4.7 4.7 0 0 0-1.2 3.5c0 4.7 2.8 5.7 5.5 6-.4.3-.8.9-.8 2V21"/>',
  link: '<path d="m10 13 4-4M8 16l-2 2a3.5 3.5 0 0 1-5-5l5-5a3.5 3.5 0 0 1 5 0m2 8a3.5 3.5 0 0 0 5 0l5-5a3.5 3.5 0 0 0-5-5l-2 2" transform="translate(1 -1) scale(.92)"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Zm0 0v6h6M8 13h8m-8 4h5"/>',
  book: '<path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15"/>',
  'check-square': '<path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8M8 10l4 4L22 4"/>',
  shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Z"/><path d="M12 7v6m0 4h.01"/>',
  key: '<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-3-3 3-3m-6 0 3-3M6.5 6.5h.01"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  flask: '<path d="M9 3h6m-5 0v7l-6 9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2l-6-9V3M7 15h10"/>',
  external: '<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  server: '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  alert: '<path d="m12 3 10 18H2Zm0 6v5m0 3h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4"/>',
  flag: '<path d="M4 22V3m0 0c6-5 10 5 16 0v12c-6 5-10-5-16 0"/>',
};
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.file}</svg>`;
const categoryIcon = { clarity:'file', documentation:'book', tests:'check-square', risk:'shield', secrets:'key' };
const statusNames = { pass:'Passed', warn:'Attention', fail:'Action needed', unknown:'No evidence', not_applicable:'Not applicable' };
let settings = { endpoint: DEFAULT_API_ENDPOINT, guidelines: DEFAULT_GUIDELINES };
let currentContext = null;
let review = null;
let isSample = false;
let cleanSample = false;
let filter = 'all';
let activeController = null;
let loadingInterval;
let requestGeneration = 0;
let toastTimer;
let concerns=[];
let permissionPending=false;
let editorUrl='';
let editorDirty=false;

function fillIcons(root=document) { root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);}); }
function showToast(message) { clearTimeout(toastTimer); $('toast').textContent=message; $('toast').hidden=false; toastTimer=setTimeout(()=>$('toast').hidden=true,3500); }
function showView(name) {
  document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==`view-${name}`);
  document.querySelectorAll('.nav-item').forEach(el=>{const active=el.dataset.view===name;el.classList.toggle('active',active);if(active)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  $('breadcrumb-view').textContent={review:'PR review',standards:'Your standards',settings:'Connection'}[name];
  window.scrollTo({top:0,behavior:'instant'});
}
function setError(message) { $('error-banner').textContent=message; $('error-banner').hidden=!message; }
function updateGuidelinesCount() { $('guidelines-count').textContent=`${$('guidelines').value.length.toLocaleString()} / 16,000`; }
function updateSettingsUI() {
  $('backend-endpoint').value=settings.endpoint;
  $('guidelines').value=settings.guidelines;
  $('standards-label').textContent=settings.guidelines===DEFAULT_GUIDELINES?'Default standards':'Custom standards';
  $('nav-connection').classList.toggle('configured',Boolean(settings.connectionSaved));
  updateGuidelinesCount();
}
function setLoading(loading) {
  document.body.classList.toggle('has-review',Boolean(review));
  $('loading-panel').hidden=!loading;
  $('analyze-button').disabled=loading;
  $('pr-url').disabled=loading;
  $('pr-title-input').disabled=loading;$('pr-body-input').disabled=loading;
  $('demo-button').disabled=loading;
  $('empty-demo-button').disabled=loading;
  $('use-current-button').disabled=loading;
  $('review-results').hidden=loading||!review;
  $('empty-state').hidden=loading||Boolean(review);
  clearInterval(loadingInterval);
  if(loading){const started=Date.now();$('loading-time').textContent='0s elapsed';loadingInterval=setInterval(()=>$('loading-time').textContent=`${Math.floor((Date.now()-started)/1000)}s elapsed`,1000);}
}
function captureContext(context, force=false) {
  const previous=currentContext;
  currentContext=context;
  if(context && (force || !$('pr-url').value || $('pr-url').value===previous?.url)) {
    $('pr-url').value=context.url;
    $('pr-help').textContent=`Detected ${context.owner}/${context.repo} #${context.number}`;
  } else if(!context) $('pr-help').textContent='Open a GitHub pull request or paste its link.';
  if(context&&typeof context.title==='string'&&typeof context.body==='string'&&(force||!editorDirty||editorUrl!==context.url))fillContextEditor(context);
  const changed=review&&!isSample&&context&&review.pr.url!==context.url;
  $('context-notice').hidden=!changed;
  if(changed)$('context-notice').textContent='You are viewing a different PR. The review below belongs to the linked PR shown in its heading. Run a new review for this tab.';
}
function fillContextEditor(context){editorUrl=context.url;editorDirty=false;$('pr-title-input').value=context.title||'';$('pr-body-input').value=context.body||'';$('context-status').textContent='Captured from GitHub';}
function validEvidenceUrl(value) {
  try { const url=new URL(value);return url.protocol==='https:'&&url.hostname==='github.com'&&!url.username&&!url.password?url.href:null; }catch{return null;}
}
function renderResults() {
  if(!review)return;
  const {pr,checks,coverage,metrics}=review;
  document.body.classList.add('has-review');
  const prRef=parsePullRequestUrl(pr.url);
  $('sample-banner').hidden=!isSample;
  $('toggle-sample-button').innerHTML=(cleanSample?'Show original sample':'Show after fixes')+icon('arrow');
  $('repo-line').innerHTML=`${icon('github')} ${escape(prRef?`${prRef.owner} / ${prRef.repo}`:pr.repository||'Sample workspace')} <span>· #${escape(prRef?.number||pr.number||'—')}</span>`;
  $('pr-title').textContent=pr.title||'Pull request review';
  const meta=[];
  if(pr.author)meta.push(`<span>by ${escape(pr.author)}</span>`);
  if(pr.head)meta.push(`<span class="branch-tag">${escape(pr.head)}</span>`);
  if(pr.base)meta.push(`<span>→</span><span class="branch-tag">${escape(pr.base)}</span>`);
  if(Number.isFinite(pr.filesChanged))meta.push(`<span>${pr.filesChanged} files</span>`);
  if(Number.isFinite(pr.additions))meta.push(`<span class="addition">+${pr.additions}</span>`);
  if(Number.isFinite(pr.deletions))meta.push(`<span class="deletion">−${pr.deletions}</span>`);
  $('pr-meta').innerHTML=meta.join('');
  $('github-link').hidden=isSample||!prRef;
  if(prRef)$('github-link').href=prRef.url;else $('github-link').removeAttribute('href');
  const attention=checks.filter(c=>['fail','warn'].includes(c.status));
  const passed=checks.filter(c=>c.status==='pass');
  const unknown=checks.filter(c=>c.status==='unknown');
  const findings=checks.flatMap(c=>c.findings||[]);
  const verdicts={ready:['Ready for human review','A clearer path to merge.','check'],needs_attention:['Needs attention','A few things to tighten up.','alert'],blocked:['Changes required','Resolve the blockers first.','shield'],insufficient_evidence:['More evidence needed','Let’s fill in the gaps.','eye']};
  const verdict=verdicts[review.verdict]||verdicts.insufficient_evidence;
  $('verdict-card').className=`verdict-card ${review.verdict}`;
  $('verdict-pill').innerHTML=icon(verdict[2])+escape(verdict[0]);
  $('verdict-title').textContent=verdict[1];
  $('review-summary').textContent=review.summary;
  $('risk-pill').innerHTML=review.assessmentScope==='description'?icon('file')+'Description assessment':icon('shield')+escape(`${review.risk==='unknown'?'Unassessed':review.risk.charAt(0).toUpperCase()+review.risk.slice(1)} change risk`);
  const coverageText=Number.isFinite(coverage?.filesAnalyzed)&&Number.isFinite(coverage?.totalFiles)?`${coverage.filesAnalyzed} of ${coverage.totalFiles} files assessed${coverage.truncated?' · partial diff':''}`:coverage?.truncated?'Partial diff assessed':'Coverage not reported';
  $('coverage-label').textContent=review.assessmentScope==='description'?'Code & secrets not scanned':coverageText;
  $('score-label').textContent=review.scoreLabel||'Review score';
  $('review-score').textContent=review.score===null||review.score===undefined?'—':Math.round(review.score);
  $('score-meter-fill').style.width=`${review.score??0}%`;
  $('score-caption').textContent=review.score==null?'No rubric score returned.':isSample?'Illustrative rubric score.':review.verdict==='ready'?'Standards met in the available evidence.':'A rubric score, not a merge approval.';
  $('summary-stats').innerHTML=`<div class="summary-stat"><span class="stat-icon">${icon('check')}</span><div><strong>${passed.length}</strong><small>checks passed</small></div></div><div class="summary-stat warn"><span class="stat-icon">${icon('alert')}</span><div><strong>${attention.length}</strong><small>need attention</small></div></div><div class="summary-stat unknown"><span class="stat-icon">${icon('eye')}</span><div><strong>${unknown.length}</strong><small>missing evidence</small></div></div>`;
  $('checks-caption').textContent=findings.length?`${findings.length} finding${findings.length===1?'':'s'} with practical next steps.`:'Evidence and next steps for every check.';
  $('all-count').textContent=checks.length;$('attention-count').textContent=attention.length+unknown.length;$('passed-count').textContent=passed.length;
  const metricParts=[];
  if(isSample)metricParts.push('Sample data');
  else {
    if(metrics?.model)metricParts.push(metrics.model);
    if(Number.isFinite(metrics?.durationMs))metricParts.push(`${(metrics.durationMs/1000).toFixed(2)}s`);
    if(Number.isFinite(metrics?.questions))metricParts.push(`${metrics.questions} questions`);
  }
  $('review-metrics').textContent=metricParts.join(' · ');
  renderChecks();renderConcerns();
  $('review-results').hidden=false;$('empty-state').hidden=true;
}
function renderChecks() {
  if(!review)return;
  document.querySelectorAll('[data-filter]').forEach(el=>{const active=el.dataset.filter===filter;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});
  const checks=review.checks.filter(c=>filter==='all'||(filter==='attention'&&['fail','warn','unknown'].includes(c.status))||(filter==='passed'&&c.status==='pass'));
  $('no-checks').hidden=checks.length>0;
  $('checks-list').innerHTML=checks.map(check=>{
    const findings=check.findings||[];
    const body=findings.length?findings.map(f=>{
      const evidenceUrl=!isSample&&validEvidenceUrl(f.url);
      const fileLabel=f.file?`${f.file}${f.line?`:${f.line}`:''}`:'';
      const file=fileLabel?`<${evidenceUrl?'a':'span'} class="file-reference"${evidenceUrl?` href="${escape(evidenceUrl)}" target="_blank" rel="noopener noreferrer"`:''}>${icon('file')}${escape(fileLabel)}</${evidenceUrl?'a':'span'}>`:'';
      return `<article class="finding"><div class="finding-top"><span class="severity-dot ${escape(f.severity)}" title="${escape(f.severity)} severity"></span><h4>${escape(f.title)}</h4></div><p class="finding-description">${escape(f.description)}</p>${file}${f.suggestion?`<div class="suggestion"><strong>SUGGESTED NEXT STEP</strong>${escape(f.suggestion)}</div>`:''}<button class="text-button finding-repair" data-repair-check="${escape(check.id)}" data-repair-finding="${findings.indexOf(f)}">${icon('sparkles')} Fix this with ChatGPT ${icon('arrow')}</button></article>`;
    }).join(''):`<p class="pass-detail">${escape(check.summary)}</p>`;
    const confidence=Number.isFinite(check.confidence)?`<div class="check-confidence" title="Model confidence describes concentration of the answer distribution, not overall correctness.">Model confidence · ${Math.round(check.confidence*100)}%</div>`:'';
    return `<details class="check-card"${['warn','fail','unknown'].includes(check.status)?' open':''}><summary class="check-summary"><span class="check-category-icon">${icon(categoryIcon[check.id]||'file')}</span><span class="check-summary-text"><h3>${escape(check.label)}${Number.isFinite(check.score)?` <small class="section-score">${Math.round(check.score)}/100</small>`:''}</h3><p>${escape(check.summary)}</p></span><span class="check-status ${escape(check.status)}">${icon(check.status==='pass'?'check':check.status==='unknown'?'eye':check.status==='not_applicable'?'minus':'alert')}${escape(statusNames[check.status]||check.status)}</span><span class="chevron">${icon('chevron')}</span></summary><div class="check-body">${body}${confidence}</div></details>`;
  }).join('');
  $('checks-list').querySelectorAll('[data-repair-check]').forEach(button=>button.addEventListener('click',()=>{
    const check=review.checks.find(c=>c.id===button.dataset.repairCheck);
    const finding=check?.findings[Number(button.dataset.repairFinding)];
    if(finding)openRepair([{...finding,checkId:check.id,checkLabel:check.label}]);
  }));
}
function renderConcerns(){
  $('concerns-list').innerHTML=concerns.map((concern,index)=>`<div class="human-concern"><span>${icon('flag')}</span><p>${escape(concern)}</p><button class="icon-button" data-remove-concern="${index}" aria-label="Remove concern ${index+1}">${icon('close')}</button></div>`).join('');
  $('concerns-list').querySelectorAll('[data-remove-concern]').forEach(button=>button.addEventListener('click',()=>{concerns.splice(Number(button.dataset.removeConcern),1);renderConcerns();}));
}
function openRepair(findings){
  if(!review)return;
  $('repair-prompt').value=buildRepairPrompt({review,...(findings?{findings}:{}),concerns,isSample});
  $('repair-status').textContent='Review the prompt before sharing. After applying a fix, run Check my PR again.';
  $('repair-dialog').showModal();
}
function loadSample(clean=false) {
  if(activeController){activeController.abort();requestGeneration++;activeController=null;}
  if(!isSample)concerns=[];
  isSample=true;cleanSample=clean;review=structuredClone(clean?CLEAN_DEMO_REVIEW:DEMO_REVIEW);filter='all';
  setLoading(false);setError('');$('context-notice').hidden=true;showView('review');renderResults();
}
async function performReview(event) {
  event.preventDefault();if(permissionPending||activeController)return;setError('');
  const parsed=parsePullRequestUrl($('pr-url').value);
  if(!parsed){setError('Paste a GitHub pull request link, such as https://github.com/owner/repo/pull/123.');return;}
  let context=currentContext?.url===parsed.url?currentContext:parsed;
  const generation=++requestGeneration;
  permissionPending=true;setLoading(true);
  let allowed;
  try { allowed=await requestBackendPermission(settings.endpoint); }catch(error){setError(error.message);setLoading(false);return;}finally{permissionPending=false;}
  if(generation!==requestGeneration){setLoading(false);return;}
  if(!allowed){setError('Backend access was not granted. Open Connection and save the endpoint to allow access.');setLoading(false);return;}
  activeController=new AbortController();
  if(isSample||review?.pr?.url!==parsed.url)concerns=[];
  review=null;isSample=false;filter='all';setLoading(true);$('context-notice').hidden=true;
  try {
    if(editorUrl===parsed.url&&$('pr-title-input').value.trim())context={...context,title:$('pr-title-input').value.trim(),body:$('pr-body-input').value};
    else if(typeof context.title!=='string'||typeof context.body!=='string'){
      context=await getPullRequestContext(parsed.url,{signal:activeController.signal});fillContextEditor(context);
    }
    if(generation!==requestGeneration)return;
    const result=await reviewPullRequest({endpoint:settings.endpoint,prUrl:parsed.url,guidelines:settings.guidelines,context,signal:activeController.signal});
    if(generation!==requestGeneration)return;
    review=result;renderResults();captureContext(currentContext);
  }catch(error){
    if(generation!==requestGeneration)return;
    if(error.code==='ABORTED')showToast('Review cancelled.');else {setError(error.message||'The review could not be completed.');if(error.code?.startsWith('GITHUB')||error.code==='INVALID_CONTEXT')$('pr-context-editor').open=true;}
  }finally{if(generation===requestGeneration){activeController=null;setLoading(false);}}
}
function summaryMarkdown() {
  const lines=[`# Check My PR${isSample?' — SAMPLE REVIEW':''}`,``,review.pr.title];
  if(!isSample&&review.pr.url)lines.push(review.pr.url);
  if(isSample)lines.push('Illustrative sample. No GitHub or Jev API call was made.');
  lines.push('',`Verdict: ${review.verdict.replaceAll('_',' ')}`,`Change risk: ${review.risk}`,`Score: ${review.score??'Not reported'}`,review.summary,'');
  for(const check of review.checks){lines.push(`## ${check.label}: ${statusNames[check.status]}`,check.summary);for(const finding of check.findings||[]){lines.push(`- ${finding.title}${finding.file?` (${finding.file}${finding.line?`:${finding.line}`:''})`:''}: ${finding.description}`);if(finding.suggestion)lines.push(`  Next step: ${finding.suggestion}`);}lines.push('');}
  lines.push('Assessment of available evidence; human review is still required.');return lines.join('\n');
}

fillIcons();
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.view)));
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.filter;renderChecks();}));
['demo-button','empty-demo-button','settings-demo-button'].forEach(id=>$(id).addEventListener('click',()=>loadSample()));
$('toggle-sample-button').addEventListener('click',()=>loadSample(!cleanSample));
$('review-form').addEventListener('submit',performReview);
$('pr-url').addEventListener('change',()=>{const parsed=parsePullRequestUrl($('pr-url').value);if(parsed&&parsed.url!==editorUrl){editorUrl=parsed.url;editorDirty=false;$('pr-title-input').value='';$('pr-body-input').value='';$('context-status').textContent='Fetched when you review';}});
['pr-title-input','pr-body-input'].forEach(id=>$(id).addEventListener('input',()=>{editorDirty=true;editorUrl=parsePullRequestUrl($('pr-url').value)?.url||'';$('context-status').textContent='Your edited draft';}));
$('cancel-button').addEventListener('click',()=>activeController?.abort());
$('use-current-button').addEventListener('click',async()=>{const context=await getActivePullRequest();if(context){captureContext(context,true);setError('');showToast('Current pull request selected.');}else showToast('Open a GitHub pull request in the active tab first.');});
$('guidelines').maxLength=16000;
$('guidelines').addEventListener('input',updateGuidelinesCount);
$('save-standards').addEventListener('click',async()=>{
  const guidelines=$('guidelines').value.trim();
  if(!guidelines){showToast('Add a review standard before saving.');return;}
  try{settings=await saveSettings({...settings,guidelines});updateSettingsUI();showToast('Your review standards are saved.');}catch{showToast('Could not save standards. Please try again.');}
});
$('reset-standards').addEventListener('click',()=>{$('guidelines').value=DEFAULT_GUIDELINES;updateGuidelinesCount();showToast('Defaults restored in the editor. Save to apply them.');});
$('settings-form').addEventListener('submit',async event=>{
  event.preventDefault();const status=$('settings-status');status.textContent='';status.className='';
  try{
    const endpoint=validateEndpoint($('backend-endpoint').value.trim());
    const allowed=await requestBackendPermission(endpoint);
    if(!allowed)throw new Error('Allow access to this backend to save the connection.');
    settings=await saveSettings({...settings,endpoint,connectionSaved:true});updateSettingsUI();status.textContent='Endpoint saved. Ready for a live review.';showToast('Connection saved.');
  }catch(error){status.textContent=error.message;status.className='error';}
});
$('copy-button').addEventListener('click',async()=>{if(!review)return;try{await navigator.clipboard.writeText(summaryMarkdown());showToast('Review summary copied.');}catch{showToast('Clipboard unavailable. Select the review text to copy it.');}});
$('concern-form').addEventListener('submit',event=>{event.preventDefault();const value=$('reviewer-concern').value.trim();if(!value){$('reviewer-concern').focus();return;}if(concerns.length>=10){showToast('You can add up to 10 concerns per review.');return;}concerns.push(value);$('reviewer-concern').value='';renderConcerns();showToast('Concern added to the repair context.');});
$('repair-all-button').addEventListener('click',()=>openRepair());
$('close-repair').addEventListener('click',()=>$('repair-dialog').close());
$('repair-dialog').addEventListener('click',event=>{if(event.target===$('repair-dialog')){const rect=event.target.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)event.target.close();}});
$('copy-repair').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('repair-prompt').value);$('repair-status').textContent='Copied. Open ChatGPT, paste the prompt, and attach the relevant code.';showToast('Repair prompt copied.');}catch{$('repair-prompt').focus();$('repair-prompt').select();$('repair-status').textContent='Select and copy the prompt manually, then open ChatGPT.';}});
$('expand-button').addEventListener('click',async()=>{
  if(globalThis.chrome?.runtime?.getURL&&globalThis.chrome?.tabs?.create){
    try{
      const handoff=`review-${crypto.randomUUID()}`;
      await chrome.storage.session.set({[handoff]:{review,isSample,cleanSample,concerns,context:currentContext,prUrl:$('pr-url').value}});
      await chrome.tabs.create({url:`${chrome.runtime.getURL('sidepanel.html')}?handoff=${encodeURIComponent(handoff)}`});
    }catch{showToast('Could not open a full tab. Continue reviewing here.');}
  }else{
    const target=new URL(location.href);if(isSample)target.searchParams.set('sample',cleanSample?'after':'before');
    else if(parsePullRequestUrl($('pr-url').value))target.searchParams.set('pr',$('pr-url').value);
    window.open(target.href,'_blank','noopener');
  }
});
try {
  const stored=await readSettings();settings={...settings,...stored};if(typeof settings.guidelines!=='string'||!settings.guidelines.trim())settings.guidelines=DEFAULT_GUIDELINES;try{settings.endpoint=validateEndpoint(settings.endpoint);}catch{settings.endpoint=DEFAULT_API_ENDPOINT;}updateSettingsUI();
  const params=new URLSearchParams(location.search);
  const handoff=params.get('handoff');
  if(handoff&&/^review-[\da-f-]{36}$/.test(handoff)&&globalThis.chrome?.storage?.session){
    const saved=(await chrome.storage.session.get(handoff))[handoff];
    if(saved){review=saved.review;isSample=saved.isSample;cleanSample=saved.cleanSample;concerns=Array.isArray(saved.concerns)?saved.concerns.filter(x=>typeof x==='string'):[];currentContext=saved.context;$('pr-url').value=saved.prUrl||'';if(review)renderResults();await chrome.storage.session.remove(handoff);history.replaceState(null,'',location.pathname);}
  }else if(params.has('sample'))loadSample(params.get('sample')==='after');
  else if(params.has('pr'))captureContext(parsePullRequestUrl(params.get('pr')),true);
  const active=await getActivePullRequest();if(active)captureContext(active);onActivePullRequestChange(captureContext);
}catch{updateSettingsUI();showToast('Using default settings.');}
