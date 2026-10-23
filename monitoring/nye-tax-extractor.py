"""Read-only Nye County annual tax bill PDF extractor.
Requires pdftotext (poppler). A bill does NOT establish payment status.
"""
import json
import re
import subprocess
import sys
from urllib.request import Request, urlopen

PROPERTY_ID = "pahrump-nv-232"
PROPERTY_KEY = "04524339"

def bill_url(year):
    year = int(year)
    if year < 2020 or year > 2100:
        raise ValueError("Invalid tax year")
    return f"https://nyenv-assessor.devnetwedge.com/TaxBill?source=RE&property_key={PROPERTY_KEY}&year={year}"

def parse_bill(text, year):
    if not re.search(r"\b045-243-39\b", text):
        raise ValueError("Parcel mismatch")
    if not re.search(rf"\({year}\s*-\s*{year+1}\)", text):
        raise ValueError("Tax year mismatch")
    total = re.search(r"(?m)^\s*TOTAL\s+\$([\d,]+\.\d{2})\s*$", text)
    if not total:
        raise ValueError("Annual total not found")
    # Due dates are explicitly shown in installment columns on the tax bill.
    dates = re.findall(r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b", text)
    block = text.split("4TH INSTALLMENT", 1)[-1].split("AMOUNT BARCODE", 1)[0]
    amounts = re.findall(r"\$([\d,]+\.\d{2})", block)
    if len(dates) < 4 or len(amounts) < 4:
        raise ValueError("Installments require review")
    # The bill lays out installments from fourth to first.
    from datetime import datetime
    installment_amounts = amounts[-4:]
    installments = sorted(
        [{"dueDate":datetime.strptime(date,"%B %d, %Y").date().isoformat(),"amount":float(amount.replace(",",""))}
         for date,amount in zip(dates[-4:],installment_amounts)],
        key=lambda x:x["dueDate"])
    annual = float(total.group(1).replace(",",""))
    if abs(sum(i["amount"] for i in installments)-annual)>0.011:
        raise ValueError("Installment amounts do not reconcile")
    return {"propertyId":PROPERTY_ID,"taxYear":f"{year}/{year+1}","annualAssessment":annual,
            "installments":installments,"paymentStatus":"unverified","sourceUrl":bill_url(year)}

def fetch_bill(year):
    req=Request(bill_url(year),headers={"User-Agent":"Mozilla/5.0"})
    with urlopen(req,timeout=20) as res:
        content=res.read(3000000)
    if not content.startswith(b"%PDF-"):
        raise ValueError("Expected county PDF")
    result=subprocess.run(["pdftotext","-layout","-","-"],input=content,capture_output=True,check=True)
    return parse_bill(result.stdout.decode("utf-8","replace"),int(year))

if __name__=="__main__":
    print(json.dumps(fetch_bill(int(sys.argv[1]) if len(sys.argv)>1 else 2026),indent=2))
