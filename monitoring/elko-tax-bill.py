"""Read-only retrieval and reconciliation of Elko County tax bills.
Uses a fresh form token and a cookie-aware session; no payment requests.
Requires pdftotext (poppler). Never log form tokens or taxpayer details.
"""
import http.cookiejar
import re
import subprocess
from decimal import Decimal
from urllib.parse import urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener
from html.parser import HTMLParser

BASE="https://elko-search.gsacorp.io"
ACCOUNTS={"elko-nv-10a-1":"00712Q011","elko-nv-10a-2":"01081H024"}
class Form(HTMLParser):
    def __init__(self):
        super().__init__();self.in_form=False;self.token=None
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=="form" and a.get("action","").startswith("/taxbill/RE/"):self.in_form=True
        if self.in_form and tag=="input" and a.get("name")=="token":self.token=a.get("value")
    def handle_endtag(self,tag):
        if tag=="form":self.in_form=False

def parse_pdf(text,parcel):
    formatted=parcel[:3]+"-"+parcel[3:6]+"-"+parcel[6:]
    if not re.search(r"\b"+re.escape(formatted)+r"\b",text):raise ValueError("Tax bill parcel mismatch")
    period=re.search(r"JULY 1,\s*(20\d{2})\s+THRU JUNE 30,\s*(20\d{2})",text)
    if not period or int(period.group(2))!=int(period.group(1))+1:raise ValueError("Tax year missing")
    prior=re.search(r"Previous Payments\s*-\s*\$?\s*([\d,]+\.\d{2})",text)
    if not prior:raise ValueError("Prior payments not found")
    return {"taxYear":f"{period.group(1)}/{period.group(2)}","previousPayments":str(Decimal(prior.group(1).replace(",",""))),"source":"county_tax_bill_pdf"}

def fetch_bill(property_id):
    if property_id not in ACCOUNTS:raise ValueError("Unknown parcel")
    parcel=ACCOUNTS[property_id]
    opener=build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
    detail=BASE+"/tax/"+parcel
    with opener.open(Request(detail,headers={"User-Agent":"Mozilla/5.0"}),timeout=20) as r:
        if r.status!=200:raise ValueError("Tax detail unavailable")
        html=r.read(750000).decode("utf-8","replace")
    form=Form();form.feed(html)
    if not form.token:raise ValueError("Tax bill form token missing")
    url=BASE+"/taxbill/RE/"+parcel
    req=Request(url,data=urlencode({"token":form.token}).encode(),headers={"User-Agent":"Mozilla/5.0","Referer":detail})
    with opener.open(req,timeout=25) as r:
        pdf=r.read(1500000)
    if not pdf.startswith(b"%PDF-"):raise ValueError("Tax bill PDF not returned")
    out=subprocess.run(["pdftotext","-layout","-","-"],input=pdf,capture_output=True,check=True)
    return {"propertyId":property_id,"billUrl":url,**parse_pdf(out.stdout.decode("utf-8","replace"),parcel)}

def reconcile(account,bill):
    if account["propertyId"]!=bill["propertyId"] or account["taxYear"]!=bill["taxYear"]:raise ValueError("Account/bill mismatch")
    original=Decimal(account["annualAssessment"])
    paid=Decimal(account["currentYearPaid"])
    balance=Decimal(account["currentYearBalance"])
    previous=Decimal(bill["previousPayments"])
    if paid<0 or balance<0 or original<0:raise ValueError("Invalid amounts")
    if paid!=previous:raise ValueError("Payment discrepancy between account and bill")
    confirmed=balance==0 and paid>=original and Decimal(account["accountBalance"])==0
    return {**account,"billUrl":bill["billUrl"],"billPreviousPayments":str(previous),
            "paymentStatus":"paid_confirmed" if confirmed else "unverified",
            "reconciled":True}
