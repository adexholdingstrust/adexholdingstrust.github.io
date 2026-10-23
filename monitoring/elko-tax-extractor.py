"""Read-only Elko County public tax-page extractor. No credentials or payment actions."""
from html.parser import HTMLParser
from urllib.request import Request, urlopen
from decimal import Decimal
import json
import re
import sys

PARCELS = {
    "elko-nv-10a-1": "https://elko-search.gsacorp.io/tax/00712Q011",
    "elko-nv-10a-2": "https://elko-search.gsacorp.io/tax/01081H024",
}

class Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
    def handle_data(self, value):
        value = " ".join(value.split())
        if value:
            self.parts.append(value)

def money(value):
    if not re.fullmatch(r"\$[\d,]+\.\d{2}", value):
        raise ValueError("Unexpected money format")
    return str(Decimal(value[1:].replace(",", "")))

def parse_elko(html, property_id):
    if property_id not in PARCELS:
        raise ValueError("Unknown parcel")
    parser = Text()
    parser.feed(html)
    a = parser.parts
    expected = PARCELS[property_id].rsplit("/", 1)[-1]
    expected_formatted = expected[:3] + "-" + expected[3:6] + "-" + expected[6:]
    title = " ".join(a[:60])
    # Require an exact account identifier somewhere in the parsed page.
    if expected_formatted not in " ".join(a[:150]):
        raise ValueError("Parcel identity not confirmed")
    # The account-level Balance and Currently Due fields are near the page header.
    def next_value(label):
        for i, s in enumerate(a[:160]):
            if s == label and i + 1 < len(a) and re.fullmatch(r"\$[\d,]+\.\d{2}", a[i + 1]):
                return money(a[i + 1])
        raise ValueError("Missing " + label)
    tax_index = next((i for i, s in enumerate(a[:160]) if re.fullmatch(r"20\d{2}/20\d{2} REAL ESTATE TAXES", s)), None)
    if tax_index is None:
        raise ValueError("Current tax year not found")
    tax_year = a[tax_index].split()[0]
    section = a[tax_index:tax_index + 14]
    def section_value(label):
        try:
            i = section.index(label)
            return money(section[i + 1])
        except (ValueError, IndexError):
            raise ValueError("Missing current-year " + label)
    return {
        "propertyId": property_id,
        "sourceUrl": PARCELS[property_id],
        "taxYear": tax_year,
        "annualAssessment": section_value("Original"),
        "currentYearPaid": section_value("Paid"),
        "currentYearBalance": section_value("Balance"),
        "accountBalance": next_value("Balance"),
        "currentlyDue": next_value("Currently Due"),
        "paymentStatus": "paid_confirmed" if Decimal(section_value("Balance")) == 0 and Decimal(section_value("Paid")) >= Decimal(section_value("Original")) else "unverified",
        "source": "county_public_tax_page",
    }

def fetch(property_id):
    if property_id not in PARCELS:
        raise ValueError("Unknown parcel")
    req = Request(PARCELS[property_id], headers={"User-Agent": "AdexTaxMonitor/1.0 (read-only)"})
    with urlopen(req, timeout=20) as response:
        if response.status != 200:
            raise ValueError("County page unavailable")
        content = response.read(600000)
    return parse_elko(content.decode("utf-8", errors="replace"), property_id)

if __name__ == "__main__":
    for property_id in PARCELS:
        try:
            print(json.dumps(fetch(property_id), sort_keys=True))
        except Exception as exc:
            print(json.dumps({"propertyId": property_id, "error": str(exc)}), file=sys.stderr)
            sys.exit(1)
