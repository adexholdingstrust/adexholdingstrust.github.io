"""Read the county's normal public bill form and verify the downloaded PDF."""
import re
import subprocess
from decimal import Decimal
from urllib.parse import urlsplit

SOURCE = 'https://ttc.lacounty.gov/request-duplicate-bill/'
PARCELS = {'lancaster-ca-210': '3322 023 014', 'lancaster-ca-253': '3344 011 068'}


def parse_bill(pdf, property_id, year):
    if not pdf.startswith(b'%PDF-') or len(pdf) > 5_000_000:
        raise ValueError('Unexpected bill document')
    body = subprocess.run(
        ['pdftotext', '-layout', '-', '-'], input=pdf, capture_output=True,
        check=True, timeout=15,
    ).stdout.decode()
    parcel = re.escape(PARCELS[property_id])
    if not re.search(r"ASSESSOR'S ID\.NO\.:\s*" + parcel + r'\b', body):
        raise ValueError('Bill parcel mismatch')
    if not re.search(fr'FISCAL YEAR JULY 1, {year} TO JUNE 30, {year + 1}\b', body):
        raise ValueError('Bill fiscal year mismatch')
    money = r'\$([\d,]+\.\d{2})'
    totals = re.findall(
        fr'^\s*{money}\s+{money}\s+{money}\s*\n\s*DUE NOVEMBER 1, {year}'
        fr'\s+DUE FEBRUARY 1, {year + 1}', body, re.MULTILINE,
    )
    if len(totals) != 1:
        raise ValueError('Installment amounts and dates not verified')
    first, second, total = (Decimal(value.replace(',', '')) for value in totals[0])
    if min(first, second) <= 0 or first + second != total:
        raise ValueError('Installments do not reconcile')
    return {
        'propertyId': property_id, 'sourceUrl': SOURCE,
        'taxYear': f'{year}/{year + 1}', 'annualAssessment': float(total),
        'paymentStatus': 'unverified',
        'installments': [
            {'dueDate': f'{year}-11-01', 'amount': float(first)},
            {'dueDate': f'{year + 1}-02-01', 'amount': float(second)},
        ],
    }


def fetch_bill(property_id, year):
    from playwright.sync_api import sync_playwright

    ain = PARCELS[property_id].replace(' ', '')
    label = f'{year}-{(year + 1) % 100:02d}'
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        context = browser.new_context()
        page = context.new_page()
        page.set_default_timeout(25_000)
        page.goto(SOURCE, wait_until='domcontentloaded')
        page.get_by_label('AIN', exact=True).fill(ain)
        with page.expect_popup() as popup:
            page.locator('#submit-btn').click()
        result = popup.value
        row = result.locator('#TaxBillsTable tr').filter(
            has=result.get_by_text(label, exact=True)
        ).filter(has=result.get_by_text('Annual', exact=True))
        link = row.get_by_role('link', name='Click here to view bill', exact=True)
        url = link.get_attribute('href') or ''
        target = urlsplit(url)
        if (target.scheme, target.netloc) != ('https', 'latapi.estreamone.com') or not re.fullmatch(
            r'/repos/LAT2-Main/docs/\d+\.\d+', target.path
        ):
            raise ValueError('Unexpected county bill destination')
        response = context.request.get(url, max_redirects=0, timeout=25_000)
        if not response.ok:
            raise ValueError('County bill download failed')
        return parse_bill(response.body(), property_id, year)
