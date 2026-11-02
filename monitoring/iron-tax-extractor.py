"""Read official public Iron County accounts. Zero balance is not payment proof."""
from datetime import datetime
from decimal import Decimal
import http.cookiejar
import importlib.util
from pathlib import Path
from urllib.parse import urlencode,urljoin,urlsplit,urlunsplit
from urllib.request import Request,build_opener,HTTPCookieProcessor,HTTPRedirectHandler
import re
spec=importlib.util.spec_from_file_location('iron_page',Path(__file__).with_name('valencia-tax-extractor.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
Page=m.Page
ORIGIN='https://eagleweb.ironcounty.net:8443'
ACCOUNTS={'iron-ut-113':('0503376','E-1699-0038-0000'),'modena-ut-112':('0331246','E-1695-0014-0008-05')}
def money(text):
    if not re.fullmatch(r'\$?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{2})?',text):raise ValueError('Invalid county amount')
    result=Decimal(text.replace('$','').replace(',',''))
    if result>100000000:raise ValueError('County amount out of range')
    return result
def parse(property_id,summary_html,transaction_html,year):
    account,parcel=ACCOUNTS[property_id];summary=Page.parse(summary_html);transactions=Page.parse(transaction_html)
    for page in [summary]:
        rows=[r for t in page.tables for r in t]
        for label,expected in [('Account Id',account),('Parcel Number',parcel)]:
            if [r[1] for r in rows if len(r)==2 and r[0]==label]!=[expected]:raise ValueError('County identity mismatch')
    linked_accounts=set(re.findall(r'account\.jsp\?account=(\d+)',transaction_html))
    if linked_accounts!={account}:raise ValueError('County transaction account mismatch')
    assessments=[money(r[-1]) for t in summary.tables for r in t if len(r)==3 and r[0]=='Taxes']
    if len(assessments)!=1 or assessments[0]<=0:raise ValueError('County assessment unavailable')
    headers=['Tax Year','Tax Due','Interest Due','Penalty Due','Misc Due','Lien Due','Lien Interest Due','Total Due']
    balances=[t for t in transactions.tables if t and t[0]==headers]
    ledger=[t for t in transactions.tables if t and t[0]==['Tax Year','Type','Effective Date','Amount','Balance']]
    if len(balances)!=1 or len(ledger)!=1:raise ValueError('County ledger unavailable')
    total=Decimal(0);years=[]
    for row in balances[0][1:]:
        if len(row)!=8 or not re.fullmatch(r'20\d{2}',row[0]):raise ValueError('Invalid county balance row')
        components=[money(x) for x in row[1:]]
        if sum(components[:-1],Decimal(0))!=components[-1]:raise ValueError('County balance components mismatch')
        total+=components[-1];years.append(int(row[0]))
    if len(years)!=len(set(years)) or year not in years:raise ValueError('Current county tax year unavailable')
    charges=[]
    for row in ledger[0][1:]:
        if len(row)!=5 or not re.fullmatch(r'20\d{2}',row[0]):raise ValueError('Invalid county transaction')
        datetime.strptime(row[2],'%m/%d/%y');money(row[3]);money(row[4])
        if row[0]==str(year) and row[1]=='Tax Charge':charges.append(money(row[3]))
    if not charges or sum(charges,Decimal(0))!=assessments[0]:raise ValueError('County assessment and charges disagree')
    return {'propertyId':property_id,'sourceUrl':ORIGIN+'/treasurer/treasurerweb/account.jsp?account='+account+'&action=tx','taxYear':str(year),'annualAssessment':float(assessments[0]),'accountBalance':float(total),'paymentStatus':'unverified'}
class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,url):
        u=urlsplit(url)
        if u.hostname!='eagleweb.ironcounty.net' or u.scheme not in ['https','http'] or u.port not in [None,443,8443]:raise ValueError('Unexpected county redirect')
        if u.scheme=='http':url=urlunsplit(('https',u.netloc,u.path,u.query,u.fragment))
        return super().redirect_request(req,fp,code,msg,headers,url)
def fetch(property_id,year):
    account,_=ACCOUNTS[property_id];opener=build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()),SafeRedirect())
    def read(url,data=None):
        if urlsplit(url).hostname!='eagleweb.ironcounty.net' or urlsplit(url).scheme!='https':raise ValueError('Unexpected public guest destination')
        headers={'User-Agent':'AdexPropertyMonitor/2.0 (+https://adexholdings.com)'}
        if data is not None:headers.update({'Origin':ORIGIN,'Referer':ORIGIN+'/treasurer/web/','Content-Type':'application/x-www-form-urlencoded'})
        with opener.open(Request(url,data=data,headers=headers),timeout=25) as r:
            raw=r.read(2000000)
            if len(raw)>=2000000:raise ValueError('County page too large')
            return r.url,raw.decode(r.headers.get_content_charset() or 'utf-8')
    current,html=read(ORIGIN+'/treasurer/web/');guests=[f for f in Page.parse(html).forms if f['fields'].get('guest')=='true']
    if len(guests)!=1:raise ValueError('Public guest form unavailable')
    action=urljoin(current,guests[0]['action'])
    if urlsplit(action).path.split(';',1)[0]!='/treasurer/web/loginPOST.jsp':raise ValueError('Unexpected guest action')
    read(action,urlencode(guests[0]['fields']).encode())
    url=ORIGIN+'/treasurer/treasurerweb/account.jsp?account='+account
    _,summary=read(url);_,transactions=read(url+'&action=tx')
    return parse(property_id,summary,transactions,year)
