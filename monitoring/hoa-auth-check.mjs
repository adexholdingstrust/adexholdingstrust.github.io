/* Read-only portal sign-in verification. No browser state or page contents are persisted. */
import {chromium} from 'playwright';
const portals=[
 {id:'aurora-oxford-co',name:'LCM',prefix:'LCM',url:'https://lcmpropertymanagement.com/AccountStatus/40583~10533163/?type=Account&active=0',hosts:['lcmpropertymanagement.com'],user:'#user_name',password:'#password',submit:'form#form1'},
 {id:'aurora-hoye-co',name:'TownSq',prefix:'TOWNSQ',url:'https://app.townsq.io/w/672048ef610bb549fcae2a41/user-accounts',hosts:['app.townsq.io','api.townsq.io'],user:'input[formcontrolname="username"], input[name="email"], input[type="email"]',password:'input[type="password"]'},
 {id:'fallbrook-ca',name:'FrontSteps',prefix:'FRONTSTEPS',url:'https://horsecreekridge.frontsteps.com/dashboard',hosts:['horsecreekridge.frontsteps.com'],user:'#login-email',password:'#login-password',submit:'#login-btn'}
];
const safePath=url=>{const u=new URL(url);return u.hostname+u.pathname.split('/').map(p=>p.length>36||/\d{5}/.test(p)?':id':p).join('/');};
const browser=await chromium.launch({headless:true});
let failures=0;
try {for(const portal of portals){
 const username=process.env[`ADEX_MONITOR_${portal.prefix}_USERNAME`];
 const password=process.env[`ADEX_MONITOR_${portal.prefix}_PASSWORD`];
 if(!username||!password){console.log(JSON.stringify({propertyId:portal.id,status:'credentials_missing'}));failures++;continue;}
 const context=await browser.newContext({acceptDownloads:false});
 const page=await context.newPage(); page.setDefaultTimeout(20000);
 const schemas=[];const denied=new Set();
 // Do not permit application writes. Authentication is the only allowed mutation.
 await context.route('**/*',async route=>{const q=route.request(),u=new URL(q.url());
  if(!['GET','HEAD','OPTIONS'].includes(q.method()) && (!portal.hosts.includes(u.hostname)||!/(auth|login|session|token|sign_in)/i.test(u.pathname))){denied.add(safePath(q.url()));return route.abort();}
  return route.continue();
 });
 page.on('response',async response=>{try{
  const req=response.request();const u=new URL(response.url());
  if(!portal.hosts.includes(u.hostname)||req.method()!=='GET'||!response.ok()||!response.headers()['content-type']?.includes('application/json'))return;
  const data=await response.json();
  const sample=Array.isArray(data)?data[0]:data;
  if(sample && typeof sample==='object' && schemas.length<30)schemas.push({endpoint:safePath(response.url()),keys:Object.keys(sample).filter(k=>/^[A-Za-z_][A-Za-z_0-9]{0,45}$/.test(k)).slice(0,35)});
 }catch{/* Never log raw provider errors. */}});
 try{
  await page.goto(portal.url,{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator(portal.user).filter({visible:true}).first().fill(username);
  if(!await page.locator(portal.password).filter({visible:true}).count()) {
   await page.getByRole('button',{name:/^(continue|next)$/i}).first().click();
  }
  await page.locator(portal.password).filter({visible:true}).first().fill(password);
  if(portal.name==='LCM')await page.locator(portal.submit).evaluate(form=>form.requestSubmit());
  else if(portal.submit)await page.locator(portal.submit).click();
  else await page.getByRole('button',{name:/^(log in|login|sign in|continue)$/i}).first().click();
  await page.waitForTimeout(10000);
  // Validate destination and signed-in controls. Absence of an error alone is not success.
  const host=new URL(page.url()).hostname;
  const text=await page.locator('body').innerText();
  const loginVisible=await page.locator('input[type="password"]').filter({visible:true}).count();
  const signedIn=portal.hosts.includes(host)&&!loginVisible&&/sign out|log out|logout|account status|account balance|my account|user accounts|dashboard/i.test(text);
  const challenge=/verification code|one.time code|two.factor|multi.factor|verify your identity|captcha/i.test(text);
  const rejected=/incorrect password|invalid password|invalid credentials|invalid username|unable to log|login failed|incorrect email/i.test(text);
  const status=signedIn?'authenticated':challenge?'interactive_verification_required':rejected?'credentials_rejected':'authentication_unverified';
  const headings=await page.locator('th').allTextContents();
  const labels=headings.map(x=>x.trim()).filter(x=>/^(date|description|charge|charges|credit|credits|balance|amount|payment|payments|status|reference|transaction|transaction date|due date|type)$/i.test(x));
  console.log(JSON.stringify({propertyId:portal.id,status,destination:safePath(page.url()),ledgerColumns:labels,apiSchemas:schemas,blockedWriteEndpoints:[...denied].slice(0,15)}));
  if(!signedIn)failures++;
 }catch(error){console.log(JSON.stringify({propertyId:portal.id,status:'check_failed',errorType:error.name,apiSchemas:schemas,blockedWriteEndpoints:[...denied].slice(0,15)}));failures++;}
 finally{await context.close();}
}}finally{await browser.close();}
if(failures)process.exitCode=1;
