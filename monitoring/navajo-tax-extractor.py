"""Read Navajo's public WebForms account and the selected year's recorded receipts."""
from datetime import datetime,timezone
from decimal import Decimal
import http.cookiejar
from html import unescape
import importlib.util
from pathlib import Path
import re
from urllib.parse import urlencode,urlsplit
from urllib.request import Request,build_opener,HTTPCookieProcessor,HTTPRedirectHandler
spec=importlib.util.spec_from_file_location('county_page',Path(__file__).with_name('valencia-tax-extractor.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
Page=module.Page
URL='https://apps.navajocountyaz.gov/NavajoWebPayments/PropertyInformation'
PROPERTY_ID='navajo-az-10'
PARCEL='20123012'
class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,url):
        u=urlsplit(url)
        if u.scheme!='https' or u.hostname!='apps.navajocountyaz.gov':raise ValueError('Unexpected county redirect')
        return super().redirect_request(req,fp,code,msg,headers,url)
def money(value):
    if not re.fullmatch(r'\$?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{2})?',value):raise ValueError('Invalid county money')
    result=Decimal(value.replace('$','').replace(',',''))
    if result>100000000:raise ValueError('County money out of range')
    return result
def tax_rows(page):
    headers=['Year (Roll)','Balance','Status','Taxes','Interest','Fees','Payments','1st Half Delinq','2nd Half Delinq','Name']
    tables=[t for t in page.tables if t and t[0]==headers]
    if len(tables)!=1:raise ValueError('County tax ledger missing or ambiguous')
    rows=[]
    for row in tables[0][1:]:
        if len(row)!=10:raise ValueError('Unexpected county tax row')
        year=re.fullmatch(r'(20\d{2})\s*\(\d+\)',row[0])
        if not year:raise ValueError('Invalid county tax year')
        rows.append({'year':int(year[1]),'balance':money(row[1]),'status':row[2],'taxes':money(row[3]),'interest':money(row[4]),'fees':money(row[5]),'payments':money(row[6]),'deadline':row[7]})
    if len({r['year'] for r in rows})!=len(rows):raise ValueError('Ambiguous county tax roll')
    return rows
def chosen_row(page,year):
    rows=tax_rows(page);candidates=[r for r in rows if year-1<=r['year']<=year]
    if not candidates:raise ValueError('No current or prior-year county ledger')
    selected=max(candidates,key=lambda r:r['year'])
    if selected['taxes']<=0:raise ValueError('No positive annual assessment to reconcile')
    return selected,rows
def verify_identity(page):
    if len(page.forms)!=1 or re.sub(r'\D','',page.forms[0]['fields'].get('hdnParcelNumber',''))!=PARCEL:raise ValueError('County parcel identity mismatch')
def parse(account_html,receipt_html,year):
    account=Page.parse(account_html);receipts=Page.parse(receipt_html);verify_identity(account);verify_identity(receipts)
    row,rows=chosen_row(account,year);new_row,new_rows=chosen_row(receipts,year)
    if row!=new_row or rows!=new_rows:raise ValueError('County ledger changed during receipt retrieval')
    details=[t for t in account.tables if t and t[0]==['Tax Authority','Charge Amount','Tax Code Description']]
    if len(details)!=1 or len(details[0])<2:raise ValueError('County tax breakdown unavailable')
    detail_total=sum((money(r[1]) for r in details[0][1:] if len(r)==3),Decimal(0))
    if any(len(r)!=3 for r in details[0][1:]) or detail_total!=row['taxes']:raise ValueError('Tax breakdown does not reconcile')
    annual=float(row['taxes']);balance=float(sum((r['balance'] for r in rows),Decimal(0)))
    deadline=re.fullmatch(r'All Due (\d{1,2}/\d{1,2}/20\d{2})',row['deadline'])
    due=datetime.strptime(deadline[1],'%m/%d/%Y').date().isoformat() if deadline else None
    result={'propertyId':PROPERTY_ID,'sourceUrl':URL,'taxYear':str(row['year']),'annualAssessment':annual,'accountBalance':balance,'currentYearBalance':float(row['balance']),'dueDate':due,'paymentStatus':'unverified'}
    tables=[t for t in receipts.tables if t and t[0]==['Amount','Payment Date','Remitter','Method','Note 1','Note 2']]
    if row['status'].casefold()=='paid in full':
        if len(tables)!=1 or len(tables[0])<2:raise ValueError('Posted receipt history required')
        total=Decimal(0);dates=[]
        for receipt in tables[0][1:]:
            if len(receipt)!=6:raise ValueError('Unexpected receipt row')
            total+=money(receipt[0]);dates.append(datetime.strptime(receipt[1],'%m/%d/%Y').date().isoformat())
        if total!=row['payments'] or total!=row['taxes']+row['interest']+row['fees']:raise ValueError('Receipt totals do not reconcile')
        result['countySettlement']={'method':'county_ledger_and_receipts','postedTotal':float(total),'receiptTotal':float(total),'taxDetailTotal':annual,'interestAndFees':float(row['interest']+row['fees']),'currentYearBalance':float(row['balance']),'latestReceiptOn':max(dates)}
        if balance==0 and row['balance']==0:result['paymentStatus']='paid_confirmed'
    return result

def fetch(year):
    opener=build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()),SafeRedirect())
    def request(fields=None):
        headers={'User-Agent':'AdexPropertyMonitor/2.0 (+https://adexholdings.com)'}
        if fields is not None:headers.update({'Origin':'https://apps.navajocountyaz.gov','Referer':URL,'Content-Type':'application/x-www-form-urlencoded'})
        req=Request(URL,data=urlencode(fields).encode() if fields is not None else None,headers=headers)
        with opener.open(req,timeout=25) as r:
            raw=r.read(2000000)
            if len(raw)>=2000000:raise ValueError('County page too large')
            return raw.decode(r.headers.get_content_charset() or 'utf-8')
    initial=Page.parse(request())
    if len(initial.forms)!=1:raise ValueError('County lookup form unavailable')
    fields=dict(initial.forms[0]['fields']);fields.update({'__EVENTTARGET':'btnFindAccount','__EVENTARGUMENT':'','txtParcelNumber':'201-23-012'})
    html=request(fields);page=Page.parse(html);verify_identity(page);selected,_=chosen_row(page,year)
    if selected['status'].casefold()!='paid in full':return parse(html,html,year)
    # Match the requested year's own View Payments link; never guess a row index.
    raw_rows=re.findall(r'<tr[^>]*>((?:(?!<tr).)*?)</tr>',html,re.S)
    targets=[]
    for raw_row in raw_rows:
        if not re.search(str(selected['year'])+r'\s*\(\d+\)',raw_row):continue
        found=re.search(r"__doPostBack\(&#39;(grdTaxHistory\$ctl\d+\$lnkViewPayments)&#39;",raw_row)
        if found:targets.append(unescape(found[1]))
    if len(targets)!=1:raise ValueError('Year-specific receipt link unavailable')
    fields=dict(page.forms[0]['fields']);fields.update({'__EVENTTARGET':targets[0],'__EVENTARGUMENT':'','txtParcelNumber':'201-23-012'})
    return parse(html,request(fields),year)
