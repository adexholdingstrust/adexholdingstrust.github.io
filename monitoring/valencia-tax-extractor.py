"""Read the assessor's explicit public guest view; never infer settlement from tax history."""
from html.parser import HTMLParser
import http.cookiejar
import re
from urllib.parse import urljoin,urlsplit,urlunsplit,urlencode
from urllib.request import Request,HTTPRedirectHandler,HTTPCookieProcessor,build_opener
HOST='valenciacountynm-assessorweb.tylerhost.net'
ORIGIN='https://'+HOST
ACCOUNTS={'valencia-nm-rge-1':('R023098','1-016-026-124-054-100690'),'valencia-nm-rancho-215':('R016363','1-015-029-264-264-141100')}
class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.tables=[];self.stack=[];self.forms=[];self.form=None;self.text=[];self.skip=0
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag in ['script','style']:self.skip+=1
        if tag=='form':self.form={'action':a.get('action',''),'fields':{}};self.forms.append(self.form)
        if tag=='input' and self.form is not None and a.get('name') and a.get('type','').lower()=='hidden':self.form['fields'][a['name']]=a.get('value','')
        if tag=='table':self.stack.append({'rows':[],'row':None,'cell':None})
        elif self.stack and tag=='tr':self.stack[-1]['row']=[]
        elif self.stack and tag in ['td','th']:self.stack[-1]['cell']=[]
    def handle_endtag(self,tag):
        if tag in ['script','style']:self.skip=max(0,self.skip-1)
        if tag=='form':self.form=None
        if not self.stack:return
        t=self.stack[-1]
        if tag in ['td','th'] and t['cell'] is not None:
            if t['row'] is not None:t['row'].append(' '.join(''.join(t['cell']).split()))
            t['cell']=None
        elif tag=='tr' and t['row'] is not None:t['rows'].append(t['row']);t['row']=None
        elif tag=='table':self.tables.append(self.stack.pop()['rows'])
    def handle_data(self,data):
        if self.skip:return
        self.text.append(data)
        if self.stack and self.stack[-1]['cell'] is not None:self.stack[-1]['cell'].append(data)
    @classmethod
    def parse(cls,html):p=cls();p.feed(html);return p
class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        u=urlsplit(newurl)
        if u.hostname!=HOST or u.scheme not in ['http','https']:raise ValueError('Unexpected county redirect')
        # The legacy guest redirect uses HTTP. Keep the same target encrypted instead.
        if u.scheme=='http':newurl=urlunsplit(('https',u.netloc,u.path,u.query,u.fragment))
        return super().redirect_request(req,fp,code,msg,headers,newurl)
def read_account(property_id):
    account,parcel=ACCOUNTS[property_id]
    opener=build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()),SafeRedirect())
    def read(url,data=None,referer=None,stage='account_lookup'):
        if urlsplit(url).hostname!=HOST or urlsplit(url).scheme!='https':raise ValueError('Unexpected county origin')
        headers={'User-Agent':'AdexPropertyMonitor/2.0 (+https://adexholdings.com)'}
        if data is not None:headers.update({'Origin':ORIGIN,'Referer':referer or ORIGIN+'/assessor/web/login.jsp','Content-Type':'application/x-www-form-urlencoded'})
        req=Request(url,data=data,headers=headers)
        try:
            with opener.open(req,timeout=25) as r:
                raw=r.read(2000000)
                if len(raw)>=2000000:raise ValueError('County page too large')
                return r.url,raw.decode(r.headers.get_content_charset() or 'cp1252')
        except Exception as exc:
            exc.county_stage=stage
            if hasattr(exc,'headers'):exc.challenge=exc.headers.get('cf-mitigated')=='challenge'
            raise
    url=ORIGIN+'/assessor/taxweb/account.jsp?'+urlencode({'accountNum':account})
    current,html=read(url);page=Page.parse(html)
    guest=[f for f in page.forms if f['fields'].get('guest')=='true']
    if guest:
        if len(guest)!=1:raise ValueError('Ambiguous public guest form')
        action=urljoin(current,guest[0]['action'])
        if not urlsplit(action).path.startswith('/assessor/web/loginPOST.jsp'):raise ValueError('Unexpected guest action')
        read(action,urlencode(guest[0]['fields']).encode(),referer=current,stage='public_guest_login');_,html=read(url,stage='guest_account_reload');page=Page.parse(html)
    text=' '.join(page.text)
    if not re.search(r'Account:\s*'+re.escape(account)+r'\b',text) or parcel not in text:raise ValueError('County property identity mismatch')
    _,detail=read(url+'&doc=TaxDocument',stage='public_tax_history')
    if not re.search(r'Account:\s*'+re.escape(account)+r'\b',' '.join(Page.parse(detail).text)):raise ValueError('Tax history identity mismatch')
    return page,Page.parse(detail)

def reported_tax(page,year):
    from decimal import Decimal,InvalidOperation
    values=[]
    for table in page.tables:
        if not table or [x.lower() for x in table[0]]!=['tax year','taxes']:continue
        for row in table[1:]:
            if len(row)!=2 or row[0]!=str(year):continue
            if not re.fullmatch(r'\$?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{2})?',row[1]):raise ValueError('Invalid reported tax')
            amount=Decimal(row[1].replace('$','').replace(',',''))
            if amount<0 or amount>100000000:raise ValueError('Reported tax out of range')
            values.append(amount)
    if len(values)!=1:raise ValueError('Current reported tax is not unique')
    return values[0]

def extract(property_id,year):
    summary,history=read_account(property_id)
    amount=reported_tax(summary,year)
    if amount!=reported_tax(history,year):raise ValueError('Assessor tax views disagree')
    account,_=ACCOUNTS[property_id]
    return {'propertyId':property_id,'sourceUrl':ORIGIN+'/assessor/taxweb/account.jsp?'+urlencode({'accountNum':account}),'taxYear':str(year),'annualAssessment':float(amount),'assessmentScope':'base_tax_only','paymentStatus':'unverified'}
