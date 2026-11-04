import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseValencia,fetchValencia} from './valencia.js';
const host='https://valenciacountynm-treasurerweb.tylerhost.net';
const table=rows=>'<table>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</table>';
const link='<a href="account.jsp?account=R023098">Summary</a>';
const summary='<form><input type="hidden" name="account" value="R023098"></form><p>Parcel 1016026124054100690</p>'+link+table([['Taxes','','$10.00'],['Special Assessment','District','$0.50'],['Special Assessment','Admin','$0.25'],['Total Billed','','$10.75']]);
const ledger=link+table([['Tax Year','Tax Due','Interest Due','Penalty Due','Misc Due','Lien Due','Lien Interest Due','Total Due'],['2026','$10.50','$0.00','$0.00','$0.25','$0.00','$0.00','$10.75']])+table([['Tax Year','Type','Effective Date','Amount','Balance'],['2026','Tax','10/5/26','$10.00','$10.00'],['2026','Special Assessment','10/5/26','$0.50','$0.50'],['2026','Miscellaneous','10/5/26','$0.25','$0.25'],['2025','Tax Payment','10/15/25','$9.00','$0.00']]);
export {summary,ledger};
test('Valencia Worker parser reconciles complete charges without inferring settlement or deadlines',()=>{
 const s=parseValencia('valencia-nm-rge-1',summary,ledger,2026,new Date('2026-11-04T19:00:00.000Z'));assert.equal(s.annualAssessment,10.75);assert.equal(s.balanceDue,10.75);assert.equal(s.assessmentScope,'full_assessment');assert.equal(s.dueDate,null);assert.deepEqual(s.payments,[]);
 assert.equal(parseValencia('valencia-nm-rge-1',summary,ledger,2027).taxYear,'2026');
 for(const [first,second] of [[summary.replace('1016026124054100690','other'),ledger],[summary,ledger.replaceAll('R023098','R016363')],[summary.replace('$0.25','$1.25'),ledger],[summary,ledger.replace('$10.75','$11.00')],[summary,ledger.replace('10/5/26','2/30/26')],[summary,ledger.replaceAll('2026','2024')]])assert.throws(()=>parseValencia('valencia-nm-rge-1',first,second,2026));
});
test('Valencia Worker uses only fresh public guest state and pinned read endpoints',async()=>{
 let calls=0;
 const snapshot=await fetchValencia('valencia-nm-rge-1',new Date('2026-11-04T19:00:00.000Z'),async(url,options)=>{
  calls++;const u=new URL(url);assert.equal(u.origin,host);assert.equal(options.redirect,'manual');
  if(calls===1)return new Response('<form action="../web/loginPOST.jsp;jsessionid=public-session"><input type="hidden" name="guest" value="true"></form>',{headers:{'set-cookie':'JSESSIONID=private-cookie; Secure; Path=/'}});
  assert.equal(options.headers.Cookie,'JSESSIONID=private-cookie');
  if(calls===2){assert.equal(options.method,'POST');assert.equal(u.pathname,'/treasurer/web/loginPOST.jsp;jsessionid=public-session');assert.equal(options.body,'guest=true');return new Response('',{status:302,headers:{location:'/treasurer/treasurerweb/search.jsp'}});}
  assert.equal(options.method,'GET');if(calls===3)return new Response('Public search');return new Response(calls===4?summary:ledger);
 });
 assert.equal(calls,5);assert.equal(snapshot.annualAssessment,10.75);assert.doesNotMatch(JSON.stringify(snapshot),/private-cookie|public-session/);
});
test('Valencia Worker rejects offsite redirects, unauthorized properties, and non-login writes',async()=>{
 let calls=0;await assert.rejects(fetchValencia('other',new Date(),async()=>{calls++;}));assert.equal(calls,0);
 await assert.rejects(fetchValencia('valencia-nm-rge-1',new Date(),async()=>{calls++;return new Response('',{status:302,headers:{location:'https://evil.example/'}});}));assert.equal(calls,1);
 calls=0;await assert.rejects(fetchValencia('valencia-nm-rge-1',new Date(),async()=>++calls===1?new Response('<form action="../web/loginPOST.jsp"><input type="hidden" name="guest" value="true"></form>'):new Response('',{status:307,headers:{location:'/Payment'}})));assert.equal(calls,2);
 await assert.rejects(fetchValencia('valencia-nm-rge-1',new Date(),async()=>new Response('',{status:403})),error=>error.httpStatus===403);
});
