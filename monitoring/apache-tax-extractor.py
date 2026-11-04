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
def ledger_money(text):
    negative=text.startswith('(') and text.endswith(')')
    return -money(text[1:-1]) if negative else money(text)

def parse_ledger(summary_html,ledger_html,year):
    summary=Page.parse(summary_html);text=' '.join(summary.text)
    if 'R0042800' not in summary_html or not re.search(r'(?<!\d)206[- ]?30[- ]?098(?!\d)',text):raise ValueError('County parcel identity mismatch')
    if set(re.findall(r'account\.jsp\?account=(R\d+)',ledger_html))!={'R0042800'}:raise ValueError('County ledger account mismatch')
    rows=[r for t in summary.tables for r in t]
    totals=[money(r[-1]) for r in rows if len(r)>=2 and r[0]=='Total Billed']
    components=[money(r[-1]) for r in rows if len(r)>=2 and re.fullmatch(r'Taxes \([^)]+\)',r[0])]
    if len(totals)!=1 or not components or sum(components,Decimal(0))!=totals[0]:raise ValueError('County annual assessment mismatch')
    ledger=Page.parse(ledger_html)
    header=['Tax Year','Tax Due','Interest Due','Penalty Due','Misc Due','Lien Due','Lien Interest Due','Total Due']
    balances=[t for t in ledger.tables if t and t[0]==header]
    transactions=[t for t in ledger.tables if t and t[0]==['Tax Year','Type','Effective Date','Amount','Balance']]
    if len(balances)!=1 or len(transactions)!=1:raise ValueError('County ledger unavailable')
    balance=Decimal(0);by_year={}
    for row in balances[0][1:]:
        if len(row)!=8 or not re.fullmatch(r'20\d{2}',row[0]) or row[0] in by_year:raise ValueError('Invalid county balance row')
        parts=[money(x) for x in row[1:]]
        if sum(parts[:-1],Decimal(0))!=parts[-1]:raise ValueError('County balance does not reconcile')
        by_year[row[0]]=parts[-1];balance+=parts[-1]
    candidates=[int(y) for y in by_year if year-1<=int(y)<=year]
    if not candidates:raise ValueError('Recent county tax year unavailable')
    selected=str(max(candidates));charges=Decimal(0);fees=Decimal(0);payments=Decimal(0);dates=[]
    for row in transactions[0][1:]:
        if len(row)!=5:raise ValueError('Unexpected county transaction')
        if row[0]!=selected:continue
        date=datetime.strptime(row[2],'%m/%d/%y').date().isoformat();amount=ledger_money(row[3])
        if row[1]=='Tax Charge':charges+=amount
        elif row[1] in ['Interest Charge','Penalty Charge','Miscellaneous Charge','Fee Charge','Lien Charge']:fees+=amount
        elif row[1] in ['Tax Payment','Interest Payment','Penalty Payment','Miscellaneous Payment','Fee Payment','Lien Payment']:payments+=amount;dates.append(date)
        else:raise ValueError('Unrecognized current county transaction')
    if charges!=totals[0] or fees<0 or payments<0:raise ValueError('County assessment and ledger do not reconcile')
    return {'propertyId':PROPERTY_ID,'sourceUrl':URL+'&action=tx','taxYear':selected,'annualAssessment':float(totals[0]),'accountBalance':float(balance),'currentYearBalance':float(by_year[selected]),'postedTotal':float(payments),'interestAndFees':float(fees),'paymentDates':dates,'paymentStatus':'unverified'}

def reconcile_receipt(account,text,as_of=None):
    # The receipt's effective date is distinct from its printing/receipt date.
    top=re.findall(r'^R0042800\s+20630098\s+([A-Z][a-z]{2} \d{1,2}, 20\d{2})\s+([A-Z][a-z]{2} \d{1,2}, 20\d{2})\s+',text,re.M)
    if len(top)!=1:raise ValueError('County receipt account identity mismatch')
    issued=datetime.strptime(top[0][0],'%b %d, %Y').date();effective=datetime.strptime(top[0][1],'%b %d, %Y').date()
    from zoneinfo import ZoneInfo
    as_of=as_of or datetime.now(ZoneInfo('America/Phoenix')).date()
    if issued>as_of or issued<effective or effective.isoformat() not in account['paymentDates']:raise ValueError('County receipt and payment dates disagree')
    if not re.search(r'Year\s+Charges\s+Billed\s+Prior Payments\s+New Payments\s+Balance',text):raise ValueError('County receipt columns unavailable')
    amount=r'(\$[\d,]+\.\d{2}|\(\$[\d,]+\.\d{2}\))'
    rows=re.findall(r'^'+account['taxYear']+r'\s+[A-Za-z][A-Za-z /-]+?\s+'+amount+r'\s+'+amount+r'\s+'+amount+r'\s+'+amount+r'\s*$',text,re.M)
    if not rows:raise ValueError('County receipt tax year unavailable')
    billed=sum((ledger_money(r[0]) for r in rows),Decimal(0));applied=sum((ledger_money(r[1])+ledger_money(r[2]) for r in rows),Decimal(0));remaining=sum((ledger_money(r[3]) for r in rows),Decimal(0))
    account_balances=re.findall(r'Account Balance\s+(\$[\d,]+\.\d{2})',text)
    annual=Decimal(str(account['annualAssessment']));fees=Decimal(str(account['interestAndFees']));posted=Decimal(str(account['postedTotal']))
    if len(account_balances)!=1 or money(account_balances[0])!=Decimal(str(account['accountBalance'])) or billed!=annual+fees or applied!=posted or applied!=billed or remaining!=Decimal(str(account['currentYearBalance'])):raise ValueError('County receipt totals do not reconcile')
    result=dict(account);result['countySettlement']={'method':'county_ledger_and_receipts','postedTotal':float(posted),'receiptTotal':float(applied),'taxDetailTotal':float(annual),'interestAndFees':float(fees),'currentYearBalance':account['currentYearBalance'],'latestReceiptOn':effective.isoformat()}
    if account['accountBalance']==0 and account['currentYearBalance']==0:result['paymentStatus']='paid_confirmed'
    return result

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
    try:return parse(html,year)
    except ValueError as exc:
        if str(exc)!='County alternatives missing or ambiguous':raise
    # Fully paid accounts no longer display quoted payment options.
    _,ledger_html=read(URL+'&action=tx');account=parse_ledger(html,ledger_html,year)
    links=re.findall(r"href\s*=\s*['\"]([^'\"]*taxreceipt/[^'\"]+\.pdf[^'\"]*)['\"]",html)
    if account['accountBalance']!=0 or not links:return account
    receipt=urljoin(URL,links[0]);u=urlsplit(receipt)
    if u.hostname!=HOST or u.scheme!='https' or not u.path.startswith('/treasurer/treasurerweb/taxreceipt/'):raise ValueError('Unexpected county receipt destination')
    with opener.open(Request(receipt,headers={'User-Agent':'AdexPropertyMonitor/2.0 (+https://adexholdings.com)'}),timeout=25) as response:raw=response.read(5000000)
    if not raw.startswith(b'%PDF') or len(raw)>=5000000:raise ValueError('County receipt PDF unavailable')
    import tempfile,subprocess
    with tempfile.TemporaryDirectory(prefix='adex-apache-receipt-') as directory:
        path=Path(directory)/'receipt.pdf';path.write_bytes(raw)
        text=subprocess.run(['pdftotext','-layout',str(path),'-'],check=True,capture_output=True,text=True,timeout=20).stdout
    return reconcile_receipt(account,text)
