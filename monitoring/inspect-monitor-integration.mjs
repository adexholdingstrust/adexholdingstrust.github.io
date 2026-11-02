/* Read-only account-scoped integration inspection. Never output Worker source or secret values. */
const account='8956c5a630c91f81296ffb3e8f9a7532';
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!token)throw Error('Cloudflare token unavailable');
async function get(path){const r=await fetch('https://api.cloudflare.com/client/v4'+path,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(25000)});if(!r.ok)return {httpStatus:r.status};const d=await r.json();return d.success?d.result:{httpStatus:r.status,success:false};}
const settings=await get(`/accounts/${account}/workers/scripts/adex-trust-security/settings`);
console.log(JSON.stringify({productionBindings:Array.isArray(settings.bindings)?settings.bindings.map(b=>({name:b.name,type:b.type})):{httpStatus:settings.httpStatus||null}}));
const org=await get(`/accounts/${account}/access/organizations`);
console.log(JSON.stringify({accessOrganization:typeof org.auth_domain==='string'&&/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(org.auth_domain)?org.auth_domain:{httpStatus:org.httpStatus||null}}));
const apps=await get(`/accounts/${account}/access/apps?per_page=100`);
console.log(JSON.stringify({accessApps:Array.isArray(apps)?apps.filter(a=>String(a.domain||'').startsWith('adexholdings.com')||String(a.domain||'').startsWith('www.adexholdings.com')).map(a=>({id:a.id,domain:a.domain,aud:a.aud,type:a.type})):{httpStatus:apps.httpStatus||null}}));
const zones=await get('/zones?name=adexholdings.com&per_page=20');
const matching=Array.isArray(zones)?zones.filter(z=>z.account?.id===account&&z.name==='adexholdings.com'):[];
console.log(JSON.stringify({zoneAccess:matching.map(z=>({id:z.id,name:z.name})),zoneHttpStatus:zones.httpStatus||null}));
if(matching.length===1){const routes=await get(`/zones/${matching[0].id}/workers/routes`);console.log(JSON.stringify({routes:Array.isArray(routes)?routes.map(r=>({pattern:r.pattern,script:r.script})):{httpStatus:routes.httpStatus||null}}));}
