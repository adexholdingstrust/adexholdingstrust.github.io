"""Read Apache's public guest tax account. Quoted payment options are alternatives."""
from datetime import datetime
from decimal import Decimal
import http.cookiejar
import importlib.util
from pathlib import Path
import re
from urllib.parse import urlencode,urljoin,urlsplit,urlunsplit
from urllib.request import Request,build_opener,HTTPCookieProcessor,HTTPRedirectHandler
spec=importlib.util.spec_from_file_location('apache_page',Path(__file__).with_name('valencia-tax-extractor.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
Page=m.Page
HOST='eagletreasurer.co.apache.az.us'
ORIGIN='https://'+HOST+':8443'
URL=ORIGIN+'/treasurer/treasurerweb/account.jsp?account=R0042800'
PROPERTY_ID='apache-az-464'
def money(text):
    if not re.fullmatch(r'\$?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{2})?',text):raise ValueError('Invalid county amount')
    value=Decimal(text.replace('$','').replace(',',''))
    if value>100000000:raise ValueError('County amount out of range')
    return value
def parse(html,year):
    page=Page.parse(html);text=' '.join(page.text)
    if 'R0042800' not in html or not re.search(r'(?<!\d)206[- ]?30[- ]?098(?!\d)',text):raise ValueError('County parcel identity mismatch')
    rows=[r for t in page.tables for r in t]
    totals=[money(r[-1]) for r in rows if len(r)>=2 and r[0]=='Total Billed']
    components=[money(r[-1]) for r in rows if len(r)>=2 and re.fullmatch(r'Taxes \([^)]+\)',r[0])]
    if len(totals)!=1 or not components or sum(components,Decimal(0))!=totals[0]:raise ValueError('County tax components do not reconcile')
    options=[]
    for row in rows:
        if len(row)!=2:continue
        label=re.fullmatch(r'(First Half|Full) Payment\s*Due\s*(\d{1,2}/\d{1,2}/\d{2,4})',row[0])
        if not label:continue
        date=datetime.strptime(label[2],'%m/%d/%y' if len(label[2].split('/')[-1])==2 else '%m/%d/%Y').date()
        options.append({'type':'first_half_option' if label[1]=='First Half' else 'full_payment_option','dueDate':date.isoformat(),'amount':float(money(row[1]))})
    if len(options)!=2 or {x['type'] for x in options}!={'first_half_option','full_payment_option'}:raise ValueError('County alternatives missing or ambiguous')
    years={int(x['dueDate'][:4]) for x in options}
    if len(years)!=1 or not year-1<=next(iter(years))<=year:raise ValueError('County tax year unavailable')
    return {'propertyId':PROPERTY_ID,'sourceUrl':URL,'taxYear':str(next(iter(years))),'annualAssessment':float(totals[0]),'paymentOptions':options,'paymentStatus':'unverified'}
class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,url):
        u=urlsplit(url)
        if u.hostname!=HOST or u.scheme not in ['https','http'] or u.port not in [None,443,8443]:raise ValueError('Unexpected county redirect')
        if u.scheme=='http':url=urlunsplit(('https',u.netloc,u.path,u.query,u.fragment))
        return super().redirect_request(req,fp,code,msg,headers,url)
def fetch(year):
    opener=build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()),SafeRedirect())
    def read(url,data=None,referer=None):
        if urlsplit(url).hostname!=HOST or urlsplit(url).scheme!='https':raise ValueError('Unexpected public guest destination')
        headers={'User-Agent':'AdexPropertyMonitor/2.0 (+https://adexholdings.com)'}
        if data is not None:headers.update({'Origin':ORIGIN,'Referer':referer or URL,'Content-Type':'application/x-www-form-urlencoded'})
        with opener.open(Request(url,data=data,headers=headers),timeout=25) as r:
            raw=r.read(2000000)
            if len(raw)>=2000000:raise ValueError('County page too large')
            return r.url,raw.decode(r.headers.get_content_charset() or 'cp1252')
    current,html=read(URL);page=Page.parse(html)
    guests=[f for f in page.forms if f['fields'].get('guest')=='true']
    if guests:
        if len(guests)!=1:raise ValueError('Ambiguous public guest form')
        action=urljoin(current,guests[0]['action'])
        if urlsplit(action).path.split(';',1)[0]!='/treasurer/web/loginPOST.jsp':raise ValueError('Unexpected guest action')
        read(action,urlencode(guests[0]['fields']).encode(),referer=current);_,html=read(URL)
    return parse(html,year)
