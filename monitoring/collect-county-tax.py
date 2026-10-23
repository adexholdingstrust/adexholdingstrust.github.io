"""Read-only Elko collector and signed delivery to the isolated Worker.
No credentials required to read public county data. Prints summary fields only.
Set ADEX_MONITOR_URL and ADEX_MONITOR_INGEST_SECRET for delivery; never pass
secrets on command lines. --dry-run performs county reconciliation without delivery.
"""
import argparse
import hashlib
import hmac
import importlib.util
import json
import os
from pathlib import Path
import sys
import time
from datetime import datetime, timezone
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).parent

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def normalize(account):
    if account.get('reconciled') is not True:
        raise ValueError('Account and bill must reconcile')
    now = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    return {
        'kind': 'tax', 'propertyId': account['propertyId'], 'provider': 'Elko County',
        'sourceUrl': account['sourceUrl'], 'observedAt': now, 'taxYear': account['taxYear'],
        'dueDate': None,  # No verified due date is inferred from the calendar.
        'annualAssessment': float(account['annualAssessment']),
        'amountDue': float(account['annualAssessment']), 'balanceDue': float(account['accountBalance']),
        'payments': [],
        'countySettlement': {'method': 'county_account_and_bill',
                             'postedTotal': float(account['currentYearPaid']),
                             'billPreviousPayments': float(account['billPreviousPayments']),
                             'currentYearBalance': float(account['currentYearBalance'])},
    }


def deliver(snapshot, endpoint, secret):
    url = urlparse(endpoint)
    if url.scheme != 'https' or url.username or url.password or url.query or url.fragment or url.path not in ['', '/']:
        raise ValueError('Use the HTTPS Worker origin without credentials or path')
    body = json.dumps(snapshot, separators=(',', ':'), allow_nan=False).encode()
    stamp = str(int(time.time()))
    signature = hmac.new(secret.encode(), stamp.encode() + b'.' + body, hashlib.sha256).hexdigest()
    req = Request(endpoint.rstrip('/') + '/ingest', data=body,
                  headers={'Content-Type': 'application/json', 'X-Adex-Timestamp': stamp,
                           'X-Adex-Signature': 'sha256=' + signature})
    # Do not follow redirects carrying signed account data to an unintended host.
    from urllib.request import HTTPRedirectHandler, build_opener
    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            raise ValueError('Worker redirect rejected')
    with build_opener(NoRedirect()).open(req, timeout=25) as response:
        result = json.loads(response.read(10000))
    if not result.get('ok'):
        raise ValueError('Worker processing failed')
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    endpoint = os.environ.get('ADEX_MONITOR_URL', '')
    secret = os.environ.get('ADEX_MONITOR_INGEST_SECRET', '')
    if not args.dry_run and (not endpoint or not secret):
        parser.error('Worker URL and signing secret environment variables are required')
    page = load('elko_page', 'elko-tax-extractor.py')
    bill = load('elko_bill', 'elko-tax-bill.py')
    failures = 0
    for property_id in page.PARCELS:
        try:
            account = bill.reconcile(page.fetch(property_id), bill.fetch_bill(property_id))
            snapshot = normalize(account)
            result = None if args.dry_run else deliver(snapshot, endpoint, secret)
            print(json.dumps({'propertyId': property_id, 'reconciled': True,
                              'countyPaymentStatus': account['paymentStatus'],
                              'delivered': bool(result), 'mode': 'dry_run' if args.dry_run else 'live'}))
        except Exception:
            # Never include response bodies, tokens, exception URLs, or headers.
            failures += 1
            print(json.dumps({'propertyId': property_id, 'status': 'collection_or_delivery_failed'}), file=sys.stderr)
    return 1 if failures else 0

if __name__ == '__main__':
    sys.exit(main())
