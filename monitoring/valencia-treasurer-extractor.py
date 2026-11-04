"""Read the official public Valencia Treasurer summary and transaction ledger.
Complete billed totals include special assessments and miscellaneous charges.
No settlement or deadline is inferred from an account balance.
"""
from datetime import datetime
from decimal import Decimal
import http.cookiejar
import importlib.util
from pathlib import Path
import re
from urllib.parse import urlencode,urljoin,urlsplit,urlunsplit
from urllib.request import Request,build_opener,HTTPCookieProcessor,HTTPRedirectHandler
spec=importlib.util.spec_from_file_location('valencia_page',Path(__file__).with_name('valencia-tax-extractor.py'));page_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(page_module)
Page=page_module.Page
HOST='valenciacountynm-treasurerweb.tylerhost.net'
ORIGIN='https://'+HOST
ACCOUNTS={'valencia-nm-rge-1':('R023098','1016026124054100690'),'valencia-nm-rancho-215':('R016363','1015029264264141100')}
def money(text,signed=False):
    if not isinstance(text,str):raise ValueError('Invalid county amount')
    negative=text.startswith('(') and text.endswith(')')
    value=text[1:-1] if negative else text
    if negative and not signed:raise ValueError('Unexpected negative county amount')
    if not re.fullmatch(r'\$?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{2})?',value):raise ValueError('Invalid county amount')
    result=Decimal(value.replace('$','').replace(',',''))
    if result>100000000:raise ValueError('County amount out of range')
    return -result if negative else result

def parse(property_id,summary_html,ledger_html,year):
    account,parcel=ACCOUNTS[property_id];summary=Page.parse(summary_html);ledger=Page.parse(ledger_html)
    fields=[f['fields'].get('account') for f in summary.forms if 'account' in f['fields']]
    if fields!=[account] or not re.search(r'(?<!\d)'+parcel+r'(?!\d)',' '.join(summary.text)):raise ValueError('Treasurer property identity mismatch')
    for html in [summary_html,ledger_html]:
        if set(re.findall(r'account\.jsp\?account=(R\d+)',html))!={account}:raise ValueError('Treasurer account identity mismatch')
    rows=[r for t in summary.tables for r in t]
    totals=[money(r[-1]) for r in rows if len(r)==3 and r[0]=='Total Billed']
    components=[money(r[-1]) for r in rows if len(r)==3 and r[0] in ['Taxes','Special Assessment']]
    if len(totals)!=1 or totals[0]<=0 or not components or sum(components,Decimal(0))!=totals[0]:raise ValueError('Treasurer billed components disagree')
    balance_header=['Tax Year','Tax Due','Interest Due','Penalty Due','Misc Due','Lien Due','Lien Interest Due','Total Due']
    balances=[t for t in ledger.tables if t and t[0]==balance_header]
    transactions=[t for t in ledger.tables if t and t[0]==['Tax Year','Type','Effective Date','Amount','Balance']]
    if len(balances)!=1 or len(transactions)!=1:raise ValueError('Treasurer ledger unavailable')
    account_balance=Decimal(0);years=[]
    for row in balances[0][1:]:
        if len(row)!=8 or not re.fullmatch(r'20\d{2}',row[0]):raise ValueError('Invalid Treasurer balance row')
        parts=[money(x) for x in row[1:]]
        if sum(parts[:-1],Decimal(0))!=parts[-1]:raise ValueError('Treasurer balance components disagree')
        account_balance+=parts[-1];years.append(int(row[0]))
    if len(years)!=len(set(years)) or year not in years:raise ValueError('Current Treasurer tax year unavailable')
    charges=[]
    for row in transactions[0][1:]:
        if len(row)!=5 or not re.fullmatch(r'20\d{2}',row[0]):raise ValueError('Invalid Treasurer transaction row')
        datetime.strptime(row[2],'%m/%d/%y');amount=money(row[3],True);money(row[4],True)
        if int(row[0])==year and row[1] in ['Tax','Tax Adjustment','Special Assessment','Miscellaneous']:charges.append(amount)
    if not charges or sum(charges,Decimal(0))!=totals[0]:raise ValueError('Treasurer assessment and ledger disagree')
    return {'propertyId':property_id,'sourceUrl':ORIGIN+'/treasurer/treasurerweb/account.jsp?account='+account+'&action=tx','taxYear':str(year),'annualAssessment':float(totals[0]),'accountBalance':float(account_balance),'assessmentScope':'full_assessment','paymentStatus':'unverified'}

class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,url):
        u=urlsplit(url)
        if u.hostname!=HOST or u.scheme not in ['https','http'] or u.port not in [None,443]:raise ValueError('Unexpected Treasurer redirect')
        return super().redirect_request(req,fp,code,msg,headers,urlunsplit(('https',u.netloc,u.path,u.query,u.fragment)))
def extract(property_id,year):
    account,_=ACCOUNTS[property_id];opener=build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()),SafeRedirect())
    def read(url,fields=None):
        if urlsplit(url).hostname!=HOST or urlsplit(url).scheme!='https':raise ValueError('Unexpected Treasurer destination')
        headers={'User-Agent':'AdexPropertyMonitor/2.0 (+https://adexholdings.com)'}
        if fields is not None:headers.update({'Origin':ORIGIN,'Referer':ORIGIN+'/treasurer/web/','Content-Type':'application/x-www-form-urlencoded'})
        with opener.open(Request(url,data=urlencode(fields).encode() if fields is not None else None,headers=headers),timeout=25) as r:
            raw=r.read(2000000)
            if len(raw)>=2000000:raise ValueError('Treasurer page too large')
            return r.url,raw.decode(r.headers.get_content_charset() or 'cp1252')
    url,html=read(ORIGIN+'/treasurer/web/');guests=[f for f in Page.parse(html).forms if f['fields'].get('guest')=='true']
    if len(guests)!=1:raise ValueError('Treasurer public guest form unavailable')
    action=urljoin(url,guests[0]['action'])
    if urlsplit(action).path.split(';',1)[0]!='/treasurer/web/loginPOST.jsp':raise ValueError('Unexpected Treasurer guest action')
    read(action,guests[0]['fields']);url=ORIGIN+'/treasurer/treasurerweb/account.jsp?account='+account
    _,summary=read(url);_,ledger=read(url+'&action=tx')
    return parse(property_id,summary,ledger,year)
