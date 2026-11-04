/* Read-only portal sign-in verification. No browser state or page contents are persisted. */
import {chromium} from 'playwright';
import {createHmac} from 'node:crypto';
import {lcmSnapshot,frontStepsSnapshot,lcmDashboardBalance,lcmBalancePairsFromText} from './hoa-ledger.js';
import {checkTownSq} from './townsq-readonly.mjs';
import {allowPortalWrite} from './hoa-request-policy.js';
async function ingest(snapshot) {
 const token=process.env.CLOUDFLARE_API_TOKEN;
 const secret=process.env.ADEX_MONITOR_INGEST_SECRET||(token?createHmac('sha256',token).update('adex-hoa-monitor-ingestion-v2').digest('hex'):null);
 if(!secret)throw Error('Ingestion signing unavailable');
 const body=JSON.stringify(snapshot),timestamp=String(Math.floor(Date.now()/1000));
 const signature=createHmac('sha256',secret).update(timestamp+'.'+body).digest('hex');
 const response=await fetch('https://adex-hoa-monitor.tenantservices.workers.dev/ingest',{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),body,headers:{'content-type':'application/json','X-Adex-Timestamp':timestamp,'X-Adex-Signature':'sha256='+signature}});
 if(!response.ok)throw Error('Ingestion rejected');
 const result=await response.json();
 return {status:result.result?.status||'stored',paymentConfirmed:result.result?.paymentConfirmed===true,delivery:result.delivery};
}
const portals=[
 {id:'aurora-oxford-co',name:'LCM',prefix:'LCM',url:'https://lcmpropertymanagement.com/AccountStatus/40583~10533163/?type=Account&active=0',hosts:['lcmpropertymanagement.com'],user:'#user_name',password:'#password',submit:'form#form1'},
 {id:'aurora-hoye-co',name:'TownSq',prefix:'TOWNSQ',url:'https://app.townsq.io/w/672048ef610bb549fcae2a41/user-accounts',hosts:['app.townsq.io','api.townsq.io'],user:'input[formcontrolname="username"], input[name="email"], input[type="email"]',password:'input[type="password"]'},
 {id:'fallbrook-ca',name:'FrontSteps',prefix:'FRONTSTEPS',url:'https://horsecreekridge.frontsteps.com/dashboard',hosts:['horsecreekridge.frontsteps.com','fspay.frontsteps.com'],user:'#login-email',password:'#login-password',submit:'#login-btn'}
];
const safePath=url=>{const u=new URL(url);return u.hostname+u.pathname.split('/').map(p=>p.length>36||/\d{5}/.test(p)?':id':p).join('/');};
const browser=process.env.HOA_PROVIDER==='TOWNSQ'?null:await chromium.launch({headless:true});
let failures=0;
try {for(const portal of portals.filter(p=>!process.env.HOA_PROVIDER||p.prefix===process.env.HOA_PROVIDER)){
 const username=process.env[`ADEX_MONITOR_${portal.prefix}_USERNAME`];
 const password=process.env[`ADEX_MONITOR_${portal.prefix}_PASSWORD`];
 if(!username||!password){console.log(JSON.stringify({propertyId:portal.id,status:'credentials_missing'}));failures++;continue;}
 if(portal.name==='TownSq'&&process.env.HOA_TOWNSQ_ATTEMPT==='false'){console.log(JSON.stringify({propertyId:portal.id,status:'access_blocked',reason:'previous_http_403_requires_resolution'}));failures++;continue;}
 if(portal.name==='TownSq'){try{const report=await checkTownSq(username,password,{inspectLedger:process.env.HOA_INSPECT_TOWNSQ_LEDGER==='true',onSnapshot:process.env.HOA_INGEST_ENABLED==='true'?ingest:undefined});console.log(JSON.stringify({propertyId:portal.id,...report}));if(report.status!=='authenticated')failures++;}catch(e){console.log(JSON.stringify({propertyId:portal.id,status:'api_check_failed',errorType:e.name,httpStatus:e.httpStatus||null,stage:e.stage||null,responseFormat:e.responseFormat||null,reason:e.reason||'request_failed'}));failures++;}continue;}
 const context=await browser.newContext({acceptDownloads:false});
 const page=await context.newPage(); page.setDefaultTimeout(20000);
 let expectedAccountNumber=null; let frontStepsData=null; let financialHistory={status:'not_checked'}; let financialUrl=null; const networkErrors=[]; const errorTags=new Set(); const paymentHosts=new Set(); const authResponses=[]; const schemas=[];const denied=new Set(); const pageErrors=new Set(); let stage='open';
 page.on('pageerror',e=>{for(const tag of (e.message.match(/NG\d+|(?:installations|remoteconfig|auth|messaging)\/[a-z-]+|FirebaseError|ChunkLoadError|SecurityError|ReferenceError|TypeError|CORS|CSP|ERR_[A-Z_]+/g)||[]))errorTags.add(tag);pageErrors.add(/firebase/i.test(e.message)?'firebase_initialization':/chunk|loading/i.test(e.message)?'application_bundle_load':e.name||'unclassified');});
 const shape=(v,depth=0)=>{if(v===null)return 'null';if(Array.isArray(v))return {type:'array',count:v.length,item:depth<5?shape(v[0],depth+1):typeof v[0]};if(typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>/^[A-Za-z_][A-Za-z_0-9]{0,45}$/.test(k)).slice(0,40).map(([k,x])=>[k,depth<5?shape(x,depth+1):typeof x]));return typeof v;};
 // Do not permit application writes. Authentication is the only allowed mutation.
 await context.route('**/*',async route=>{const q=route.request(),u=new URL(q.url());
  let payload;try{payload=q.postDataJSON();}catch{}
  if(!['GET','HEAD','OPTIONS'].includes(q.method())&&allowPortalWrite({provider:portal.name,url:q.url(),method:q.method(),payload,expectedAccountNumber,allowProfileInit:process.env.HOA_ALLOW_PROFILE_INIT==='true'}))return route.continue();
  if(portal.name==='FrontSteps'&&u.hostname==='fspay-api.frontsteps.com'&&u.pathname==='/api/v1/Payers'&&q.method()==='POST'){
   // The UI tries to create/update a payer profile. Keep it blocked; try the client's existing-payer GET instead.
   try{const payload=q.postDataJSON(),lookup=new URL('https://fspay-api.frontsteps.com/api/v1/Payers/external');
    for(const k of ['communityId','communityExternalIdentifier','externalForeignKey'])if(payload[k]!==undefined&&payload[k]!==null)lookup.searchParams.set(k,String(payload[k]));
    const h=await q.allHeaders();const headers={accept:'application/json',Authorization:h.authorization||'', 'X-FRONTSTEPS-Payments-UserType':h['x-frontsteps-payments-usertype']||''};
    const res=await context.request.get(lookup.href,{headers,maxRedirects:0,timeout:20000});financialHistory={status:'existing_payer_lookup',httpStatus:res.status()};
    if(res.ok()){const payer=await res.json();financialHistory.responseShape=shape(payer);
     if(typeof payer.id==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(payer.id)){const history=await context.request.get('https://fspay-api.frontsteps.com/api/v1/Payers/'+encodeURIComponent(payer.id)+'/payments?limit=5&offset=0',{headers,maxRedirects:0,timeout:20000});financialHistory.historyHttpStatus=history.status();if(history.ok())financialHistory.historyShape=shape(await history.json());}
    }
   }catch{financialHistory={status:'existing_payer_lookup_failed'};}
   denied.add(safePath(q.url()));return route.abort();
  }
  if(!['GET','HEAD','OPTIONS'].includes(q.method())){denied.add(safePath(q.url()));return route.abort();}
  return route.continue();
 });
 page.on('response',async response=>{try{
  const req=response.request();const u=new URL(response.url());
  if(response.status()>=400 && networkErrors.length<20)networkErrors.push({endpoint:safePath(response.url()),status:response.status(),resource:req.resourceType()});
  if(portal.hosts.includes(u.hostname)&&req.method()==='POST'&&/(auth|login|session|sign_in)/i.test(u.pathname)){const entry={endpoint:safePath(response.url()),status:response.status()};if(response.status()>=400){const body=await response.text();entry.reason=/captcha|challenge-platform|verify you are human|automated|bot detection/i.test(body)?'security_challenge':/too many|rate.limit|login attempts/i.test(body)?'rate_limited':/another session|already.logged|concurrent|session conflict/i.test(body)?'session_conflict':/invalid token|request expired|verification token/i.test(body)?'token_validation':'provider_rejected';}authResponses.push(entry);}
  if(!portal.hosts.includes(u.hostname)||req.method()!=='GET'||!response.ok()||!response.headers()['content-type']?.includes('application/json')||u.pathname.startsWith('/assets/'))return;
  const data=await response.json();
  if(portal.name==='FrontSteps'&&Array.isArray(data.payments)){frontStepsData=data;const units=data.payments.filter(p=>/464.*calabrese/i.test(p.unit_street_1));if(units.length===1){const accounts=units[0].accounts?.filter(a=>a.is_default);if(accounts?.length===1){expectedAccountNumber=accounts[0].account_number;try{const u=new URL(accounts[0].payment_url);if(u.protocol==='https:'&&u.hostname==='fspay.frontsteps.com')financialUrl=u.href;}catch{}}}}
  if(portal.name==='FrontSteps'&&Array.isArray(data.payments))for(const p of data.payments)for(const a of p.accounts||[])try{paymentHosts.add(new URL(a.payment_url).origin);}catch{}
  const sample=Array.isArray(data)?data[0]:data;
  if(sample && typeof sample==='object' && schemas.length<30)schemas.push({endpoint:safePath(response.url()),shape:shape(data)});
 }catch{/* Never log raw provider errors. */}});
 try{
  await page.goto(portal.url,{waitUntil:'domcontentloaded',timeout:45000});
  stage='username';
  await page.locator(portal.user).filter({visible:true}).first().fill(username);
  stage='email_step';
  if(!await page.locator(portal.password).filter({visible:true}).count()) {
   await page.getByRole('button',{name:/^(continue|next)$/i}).first().click();
  }
  stage='password';
  await page.locator(portal.password).filter({visible:true}).first().fill(password);
  stage='submit';
  if(portal.name==='LCM')await page.locator(portal.submit).evaluate(form=>form.requestSubmit());
  else if(portal.submit)await page.locator(portal.submit).click();
  else await page.getByRole('button',{name:/^(log in|login|sign in|continue)$/i}).first().click();
  await page.waitForTimeout(10000);
  let ledgerView=page;
  if(portal.name==='LCM'&&new URL(page.url()).pathname===new URL(portal.url).pathname){
   try{await page.waitForFunction(()=>[...document.querySelectorAll('table')].some(t=>[...t.rows].some(r=>[...r.cells].map(c=>c.textContent.trim()).join('|')==='Date|Description|Charge|Credit'))||document.querySelector('iframe'),null,{timeout:30000});}catch{}
   for(const frame of page.frames()){try{if(new URL(frame.url()).hostname===new URL(portal.url).hostname && await frame.locator('th').filter({hasText:/^Charge$/}).count()){ledgerView=frame;break;}}catch{}}
  }
  // Validate destination and signed-in controls. Absence of an error alone is not success.
  const host=new URL(page.url()).hostname;
  const text=await page.locator('body').innerText();
  const loginVisible=await page.locator('input[type="password"]').filter({visible:true}).count();
  const ledgerHeaders=await ledgerView.locator('th').allTextContents();
  const lcmLedger=portal.name==='LCM' && new URL(page.url()).pathname===new URL(portal.url).pathname && ['Date','Description','Charge','Credit'].every(x=>ledgerHeaders.some(h=>h.trim()===x));
  const signedIn=portal.hosts.includes(host)&&!loginVisible&&(/sign out|log out|logout|account status|account balance|my account|user accounts|dashboard/i.test(text)||lcmLedger);
  const challenge=/verification code|one.time code|two.factor|multi.factor|verify your identity|captcha/i.test(text);
  const rejected=/incorrect password|invalid password|invalid credentials|invalid username|unable to log|login failed|incorrect email/i.test(text);
  const status=signedIn?'authenticated':challenge?'interactive_verification_required':rejected?'credentials_rejected':'authentication_unverified';
  const headings=await ledgerView.locator('th').allTextContents();
  const labels=headings.map(x=>x.trim()).filter(x=>/^(date|description|charge|charges|credit|credits|balance|amount|payment|payments|status|reference|transaction|transaction date|due date|type)$/i.test(x));
  const readLinks=await page.locator('a[href]').evaluateAll(links=>links.filter(a=>/^(account status|account history|account ledger|my account|payments|payment history|financials|accounting|balance|transaction history)$/i.test(a.textContent.trim())).map(a=>({label:a.textContent.trim(),url:a.href})));
  const financialControls=await page.locator('a,button').allTextContents();
  const rowShapes=await page.locator('table').evaluateAll(tables=>tables.filter(t=>[...t.querySelectorAll('th')].some(h=>h.textContent.trim()==='Charge')).map(t=>({rows:t.rows.length,columns:[...t.rows].slice(0,3).map(r=>r.cells.length)})));
  let collection={status:'not_collected'};
  if(signedIn&&portal.name==='LCM'&&process.env.HOA_INGEST_ENABLED==='true') {
   try{const rows=await ledgerView.locator('table').evaluateAll(tables=>{const table=tables.find(t=>[...t.rows].some(r=>[...r.cells].map(c=>c.textContent.trim()).join('|')==='Date|Description|Charge|Credit'));return table?[...table.rows].map(r=>[...r.cells].map(c=>c.textContent.trim())):[];});
    const pairs=await ledgerView.locator('tr').evaluateAll(rs=>rs.flatMap(r=>{const cells=[...r.cells].map(c=>c.textContent.trim());return cells.flatMap((label,i)=>/^(?:(?:current|account|total)\s+)?balance(?:\s+due)?\s*:?$/i.test(label)&&cells[i+1]?[ [label,cells[i+1]] ]:[]);}));
    const snapshot=lcmSnapshot(rows,new Date(),lcmDashboardBalance([...pairs,...lcmBalancePairsFromText(await ledgerView.locator('body').innerText())]));collection={...await ingest(snapshot),balanceObserved:snapshot.balanceDue!==null,assessmentObserved:snapshot.monthlyAssessment!==undefined};
   }catch{collection={status:'collection_failed'};failures++;}
  }
  if(signedIn&&portal.name==='FrontSteps'&&process.env.HOA_INGEST_ENABLED==='true'){try{collection=await ingest(frontStepsSnapshot(frontStepsData));}catch{collection={status:'collection_failed'};failures++;}}
  let financialPortal=null;
  if(signedIn&&portal.name==='FrontSteps'&&financialUrl&&process.env.HOA_DISCOVER_FINANCE!=='false'){
   await page.goto(financialUrl,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForTimeout(10000);
   const body=await page.locator('body').innerText();
   financialPortal={destination:safePath(page.url()),hasPassword:await page.locator('input[type="password"]').filter({visible:true}).count()>0,hasLedger:/transaction history|account history|payment history|ledger/i.test(body),hasChallenge:/verification code|captcha|verify your identity/i.test(body),tableColumns:(await page.locator('th').allTextContents()).map(x=>x.trim()).filter(x=>/^(date|description|charge|charges|credit|credits|balance|amount|payment|payments|status|reference|transaction|transaction date|due date|type)$/i.test(x))};
  }
  console.log(JSON.stringify({propertyId:portal.id,status,collection,financialPortal,financialHistory,authResponses,paymentHosts:[...paymentHosts],financialControls:financialControls.map(x=>x.trim()).filter(x=>x.length<60&&/account|payment|ledger|history|statement|financial/i.test(x)).slice(0,25),rowShapes,readLinks:readLinks.map(l=>({label:l.label,path:safePath(l.url)})),destination:safePath(page.url()),ledgerColumns:labels,apiSchemas:schemas,blockedWriteEndpoints:[...denied].slice(0,15)}));
  if(!signedIn)failures++;
 }catch(error){const controls=await page.locator('input').evaluateAll(xs=>xs.map(x=>({id:x.id,name:x.name,type:x.type,visible:!!(x.offsetWidth||x.offsetHeight||x.getClientRects().length)}))).catch(()=>[]);console.log(JSON.stringify({propertyId:portal.id,status:'check_failed',stage,destination:safePath(page.url()),controls,authResponses,networkErrors,errorTags:[...errorTags],pageErrors:[...pageErrors],errorType:error.name,apiSchemas:schemas,blockedWriteEndpoints:[...denied].slice(0,15)}));failures++;}
 finally{await context.close();}
}}finally{await browser?.close();}
if(failures)process.exitCode=1;
