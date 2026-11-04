/* Pinned public Treasurer retrieval. No arbitrary URLs, payment actions, or stored sessions. */
const HOST='valenciacountynm-treasurerweb.tylerhost.net';
const ORIGIN='https://'+HOST;
const accounts={'valencia-nm-rge-1':['R023098','1016026124054100690'],'valencia-nm-rancho-215':['R016363','1015029264264141100']};
const decode=s=>s.replace(/&(?:nbsp|#160);/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/g,"'");
const clean=s=>decode(s).replace(/\s+/g,' ').trim();
function page(html){
 const tables=[],stack=[],forms=[],text=[];let form=null,skip=0;
 for(const token of html.match(/<[^>]*>|[^<]+/g)||[]){
  if(token.startsWith('<')){
   const match=/^<\s*(\/?)\s*([a-z0-9]+)/i.exec(token);if(!match)continue;const closing=!!match[1],tag=match[2].toLowerCase();
   if(['script','style'].includes(tag)){skip=Math.max(0,skip+(closing?-1:1));continue;}
   if(skip)continue;
   if(closing){
    if(tag==='form')form=null;
    const t=stack.at(-1);if(!t)continue;
    if(['td','th'].includes(tag)&&t.cell!==null){t.row?.push(clean(t.cell.join('')));t.cell=null;}
    else if(tag==='tr'&&t.row!==null){t.rows.push(t.row);t.row=null;}
    else if(tag==='table')tables.push(stack.pop().rows);
   }else{
    const attrs=Object.create(null);for(const a of token.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))attrs[a[1].toLowerCase()]=decode(a[2]??a[3]);
    if(tag==='form'){form={action:attrs.action||'',fields:Object.create(null)};forms.push(form);}
    if(tag==='input'&&form&&attrs.name&&attrs.type?.toLowerCase()==='hidden')form.fields[attrs.name]=attrs.value||'';
    if(tag==='table')stack.push({rows:[],row:null,cell:null});
    else if(stack.length&&tag==='tr')stack.at(-1).row=[];
    else if(stack.length&&['td','th'].includes(tag))stack.at(-1).cell=[];
   }
  }else if(!skip){text.push(token);if(stack.at(-1)?.cell)stack.at(-1).cell.push(token);}
 }
 return {tables,forms,text:clean(text.join(' '))};
}
function cents(s,signed=false){
 if(typeof s!=='string')throw Error('Invalid county money');const negative=s.startsWith('(')&&s.endsWith(')');const raw=negative?s.slice(1,-1):s;
 if(negative&&!signed||!/^\$?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{2})?$/.test(raw))throw Error('Invalid county money');
 const n=Math.round(Number(raw.replace(/[$,]/g,''))*100);if(!Number.isSafeInteger(n)||n>10000000000)throw Error('County money out of range');return negative?-n:n;
}
export function parseValencia(propertyId,summaryHtml,ledgerHtml,year,now=new Date()){
 const identity=accounts[propertyId];if(!identity)throw Error('Unknown Valencia property');const [account,parcel]=identity;
 const summary=page(summaryHtml),ledger=page(ledgerHtml),fields=summary.forms.filter(f=>'account' in f.fields).map(f=>f.fields.account);
 if(fields.length!==1||fields[0]!==account||!new RegExp('(?<!\\d)'+parcel+'(?!\\d)').test(summary.text))throw Error('County property identity mismatch');
 for(const html of [summaryHtml,ledgerHtml]){const ids=new Set([...html.matchAll(/account\.jsp\?account=(R\d+)/g)].map(m=>m[1]));if(ids.size!==1||!ids.has(account))throw Error('County account identity mismatch');}
 const rows=summary.tables.flat(),totals=rows.filter(r=>r.length===3&&r[0]==='Total Billed').map(r=>cents(r.at(-1))),components=rows.filter(r=>r.length===3&&['Taxes','Special Assessment'].includes(r[0])).map(r=>cents(r.at(-1)));
 if(totals.length!==1||totals[0]<=0||!components.length||components.reduce((a,b)=>a+b,0)!==totals[0])throw Error('County billed components mismatch');
 const header=['Tax Year','Tax Due','Interest Due','Penalty Due','Misc Due','Lien Due','Lien Interest Due','Total Due'];
 const balances=ledger.tables.filter(t=>JSON.stringify(t[0])===JSON.stringify(header)),transactions=ledger.tables.filter(t=>JSON.stringify(t[0])===JSON.stringify(['Tax Year','Type','Effective Date','Amount','Balance']));
 if(balances.length!==1||transactions.length!==1)throw Error('County ledger unavailable');
 let balance=0;const years=[];
 for(const row of balances[0].slice(1)){if(row.length!==8||!/^20\d{2}$/.test(row[0]))throw Error('Invalid county balance');const parts=row.slice(1).map(x=>cents(x));if(parts.slice(0,-1).reduce((a,b)=>a+b,0)!==parts.at(-1))throw Error('County balance components mismatch');balance+=parts.at(-1);years.push(Number(row[0]));}
 const candidates=years.filter(y=>y>=year-1&&y<=year);if(new Set(years).size!==years.length||!candidates.length)throw Error('Recent county tax year unavailable');const selected=Math.max(...candidates);
 let charges=0,count=0;
 for(const row of transactions[0].slice(1)){if(row.length!==5||!/^20\d{2}$/.test(row[0])||!/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(row[2]))throw Error('Invalid county transaction');const [month,day,shortYear]=row[2].split('/').map(Number),date=new Date(Date.UTC(2000+shortYear,month-1,day));if(date.getUTCMonth()!==month-1||date.getUTCDate()!==day)throw Error('Invalid county date');const amount=cents(row[3],true);cents(row[4],true);if(Number(row[0])===selected&&['Tax','Tax Adjustment','Special Assessment','Miscellaneous'].includes(row[1])){charges+=amount;count++;}}
 if(!count||charges!==totals[0])throw Error('County assessment and ledger mismatch');
 return {kind:'tax',propertyId,provider:'Valencia County Treasurer',sourceUrl:ORIGIN+'/treasurer/treasurerweb/account.jsp?account='+account+'&action=tx',observedAt:now.toISOString(),taxYear:String(selected),annualAssessment:totals[0]/100,assessmentScope:'full_assessment',amountDue:totals[0]/100,balanceDue:balance/100,dueDate:null,payments:[]};
}
export async function fetchValencia(propertyId,now=new Date(),request=fetch){
 const identity=accounts[propertyId];if(!identity)throw Error('Unknown Valencia property');const cookies=new Map();
 const read=async(url,method='GET',body)=>{
  for(let redirect=0;redirect<6;redirect++){
   const target=new URL(url);if(target.hostname!==HOST||!['https:','http:'].includes(target.protocol)||target.port&&target.port!=='443'||target.username||target.password)throw Error('Unexpected county destination');target.protocol='https:';if(method==='POST'&&target.pathname.split(';')[0]!=='/treasurer/web/loginPOST.jsp')throw Error('County write rejected');
   const headers={'User-Agent':'AdexPropertyMonitor/2.0 (+https://adexholdings.com)'};
   if(cookies.size)headers.Cookie=[...cookies].map(([k,v])=>k+'='+v).join('; ');
   if(method==='POST')Object.assign(headers,{Origin:ORIGIN,Referer:ORIGIN+'/treasurer/web/','Content-Type':'application/x-www-form-urlencoded'});
   const response=await request(target.href,{method,body,headers,redirect:'manual',signal:AbortSignal.timeout(25000)});
   const set=response.headers.getSetCookie?.()||[response.headers.get('set-cookie')||''];for(const line of set)for(const entry of line.split(/,(?=\s*[\w-]+=)/)){const m=/^\s*([\w-]+)=([^;\r\n]*)/.exec(entry);if(m&&m[2].length<8192)cookies.set(m[1],m[2]);}
   if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');if(!location)throw Error('County redirect missing');url=new URL(location,target).href;await response.body?.cancel();if([301,302,303].includes(response.status)){method='GET';body=undefined;}continue;}
   if(!response.ok){const e=Error('County retrieval rejected');e.httpStatus=response.status;e.stage=method==='POST'?'public_guest_login':'public_county_retrieval';throw e;}
   const reader=response.body?.getReader();if(!reader)throw Error('County page unavailable');let size=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000){await reader.cancel();throw Error('County page too large');}chunks.push(value);}}finally{reader.releaseLock();}
   const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}return {url:target.href,html:new TextDecoder().decode(data)};
  }
  throw Error('Too many county redirects');
 };
 const initial=await read(ORIGIN+'/treasurer/web/'),guests=page(initial.html).forms.filter(f=>f.fields.guest==='true');if(guests.length!==1)throw Error('Public guest form unavailable');const action=new URL(guests[0].action,initial.url);if(action.pathname.split(';')[0]!=='/treasurer/web/loginPOST.jsp')throw Error('Unexpected guest form');await read(action.href,'POST',new URLSearchParams(guests[0].fields).toString());
 const url=ORIGIN+'/treasurer/treasurerweb/account.jsp?account='+identity[0],summary=await read(url),ledger=await read(url+'&action=tx');
 const year=Number(new Intl.DateTimeFormat('en',{timeZone:'America/Denver',year:'numeric'}).format(now));return parseValencia(propertyId,summary.html,ledger.html,year,now);
}
