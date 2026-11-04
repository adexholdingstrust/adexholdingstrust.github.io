"""Read-only Elko, Nye and Valencia collector and signed delivery to the isolated Worker.
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
from zoneinfo import ZoneInfo
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


def normalize_nye(bill, now=None):
    now = now or datetime.now(timezone.utc)
    local_today = now.astimezone(ZoneInfo('America/Los_Angeles')).date().isoformat()
    installments = bill['installments']
    if not installments or bill.get('paymentStatus') != 'unverified':
        raise ValueError('Incomplete Nye bill')
    # A tax bill establishes amounts and dates, not settlement or balance.
    next_due = next((i for i in installments if i['dueDate'] >= local_today), installments[-1])
    return {
        'kind': 'tax', 'propertyId': bill['propertyId'], 'provider': 'Nye County',
        'sourceUrl': bill['sourceUrl'], 'observedAt': now.isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
        'taxYear': bill['taxYear'], 'annualAssessment': bill['annualAssessment'],
        'dueDate': next_due['dueDate'], 'amountDue': next_due['amount'],
        'balanceDue': None, 'payments': [], 'installments': installments,
    }


def normalize_valencia(account, now=None):
    now=now or datetime.now(timezone.utc)
    if account.get('assessmentScope')!='base_tax_only' or account.get('paymentStatus')!='unverified':
        raise ValueError('Expected assessor base-tax observation')
    return {'kind':'tax','propertyId':account['propertyId'],'provider':'Valencia County Assessor','sourceUrl':account['sourceUrl'],'observedAt':now.isoformat(timespec='milliseconds').replace('+00:00','Z'),'taxYear':account['taxYear'],'annualAssessment':account['annualAssessment'],'assessmentScope':'base_tax_only','amountDue':account['annualAssessment'],'dueDate':None,'balanceDue':None,'payments':[]}


def normalize_navajo(account, now=None):
    now=now or datetime.now(timezone.utc)
    result={'kind':'tax','propertyId':account['propertyId'],'provider':'Navajo County','sourceUrl':account['sourceUrl'],'observedAt':now.isoformat(timespec='milliseconds').replace('+00:00','Z'),'taxYear':account['taxYear'],'annualAssessment':account['annualAssessment'],'amountDue':account['annualAssessment'],'balanceDue':account['accountBalance'],'dueDate':account['dueDate'],'payments':[]}
    if account.get('countySettlement'):result['countySettlement']=account['countySettlement']
    return result


def normalize_apache(account,now=None):
    now=now or datetime.now(timezone.utc)
    if 'paymentOptions' not in account:
        result=normalize_iron(account,now);result['provider']='Apache County'
        if account.get('countySettlement'):result['countySettlement']=account['countySettlement']
        return result
    return {'kind':'tax','propertyId':account['propertyId'],'provider':'Apache County','sourceUrl':account['sourceUrl'],'observedAt':now.isoformat(timespec='milliseconds').replace('+00:00','Z'),'taxYear':account['taxYear'],'annualAssessment':account['annualAssessment'],'amountDue':None,'balanceDue':None,'dueDate':None,'payments':[],'paymentOptions':account['paymentOptions']}


def nye_year(now=None):
    now=now or datetime.now(timezone.utc)
    local=now.astimezone(ZoneInfo('America/Los_Angeles'))
    return local.year if local.month>=7 else local.year-1


def normalize_valencia_treasurer(account,now=None):
    snapshot=normalize_iron(account,now)
    snapshot.update(provider='Valencia County Treasurer',assessmentScope='full_assessment')
    return snapshot


def normalize_iron(account,now=None):
    now=now or datetime.now(timezone.utc)
    return {'kind':'tax','propertyId':account['propertyId'],'provider':'Iron County Treasurer','sourceUrl':account['sourceUrl'],'observedAt':now.isoformat(timespec='milliseconds').replace('+00:00','Z'),'taxYear':account['taxYear'],'annualAssessment':account['annualAssessment'],'amountDue':account['annualAssessment'],'balanceDue':account['accountBalance'],'dueDate':None,'payments':[]}


def deliver(snapshot, endpoint, secret):
    url = urlparse(endpoint)
    if url.scheme != 'https' or url.username or url.password or url.query or url.fragment or url.path not in ['', '/']:
        raise ValueError('Use the HTTPS Worker origin without credentials or path')
    body = json.dumps(snapshot, separators=(',', ':'), allow_nan=False).encode()
    stamp = str(int(time.time()))
    signature = hmac.new(secret.encode(), stamp.encode() + b'.' + body, hashlib.sha256).hexdigest()
    req = Request(endpoint.rstrip('/') + '/ingest', data=body,
                  headers={'Content-Type': 'application/json', 'User-Agent': 'AdexPropertyMonitor/2.0 (+https://adexholdings.com)', 'X-Adex-Timestamp': stamp,
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


def collect_valencia_in_worker(property_id,endpoint,secret):
    url=urlparse(endpoint)
    if url.scheme!='https' or url.username or url.password or url.query or url.fragment or url.path not in ['', '/']:raise ValueError('Use the HTTPS Worker origin')
    body=json.dumps({'propertyId':property_id},separators=(',',':')).encode()
    timestamp=str(int(time.time()))
    signature=hmac.new(secret.encode(),timestamp.encode()+b'.'+body,hashlib.sha256).hexdigest()
    request=Request(endpoint.rstrip('/')+'/internal/collect-valencia',data=body,headers={'Content-Type':'application/json','User-Agent':'AdexPropertyMonitor/2.0 (+https://adexholdings.com)','X-Adex-Timestamp':timestamp,'X-Adex-Signature':'sha256='+signature},method='POST')
    from urllib.request import HTTPRedirectHandler,build_opener
    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self,req,fp,code,msg,headers,newurl):raise ValueError('Worker redirect rejected')
    try:
        with build_opener(NoRedirect()).open(request,timeout=150) as response:result=json.loads(response.read(10000))
    except Exception as exc:
        from urllib.error import HTTPError
        if isinstance(exc,HTTPError):
            try:
                details=json.loads(exc.read(10000))
                if isinstance(details.get('countyHttpStatus'),int):exc.county_http_status=details['countyHttpStatus']
                if details.get('stage') in ['public_guest_login','public_county_retrieval','county_reconciliation_or_delivery']:exc.county_stage=details['stage']
            except (ValueError,TypeError):pass
        raise
    if not result.get('ok'):raise ValueError('Worker county collection failed')
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--county',choices=['all','elko','nye','valencia','navajo','apache','iron'],default='all')
    args = parser.parse_args()
    endpoint = os.environ.get('ADEX_MONITOR_URL', '')
    secret = os.environ.get('ADEX_MONITOR_INGEST_SECRET', '')
    token = os.environ.get('CLOUDFLARE_API_TOKEN', '')
    if not args.dry_run and token and (not endpoint or not secret):
        deployment = load('monitor_deployment', 'deploy-monitor.py')
        if not secret:
            secret = deployment.signing_secret(token)
        print('::add-mask::' + secret, flush=True)
        if not endpoint:
            subdomain = deployment.api(token, f'/accounts/{deployment.ACCOUNT}/workers/subdomain')['result']['subdomain']
            import re
            if not re.fullmatch(r'[a-z0-9-]+', subdomain):
                parser.error('Unexpected Worker subdomain')
            endpoint = f'https://{deployment.WORKER}.{subdomain}.workers.dev'
    if not args.dry_run and (not endpoint or not secret):
        parser.error('Worker URL and signing secret environment variables are required')
    page = load('elko_page', 'elko-tax-extractor.py')
    bill = load('elko_bill', 'elko-tax-bill.py')
    failures = 0
    for property_id in (page.PARCELS if args.county in ['all','elko'] else []):
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
    if args.county in ['all','nye']:
        nye = load('nye_bill', 'nye-tax-extractor.py')
        stage = 'county_bill_fetch'
        try:
            tax_bill = nye.fetch_bill(nye_year())
            stage = 'bill_normalization'
            snapshot = normalize_nye(tax_bill)
            stage = 'worker_delivery'
            result = None if args.dry_run else deliver(snapshot, endpoint, secret)
            print(json.dumps({'propertyId': snapshot['propertyId'], 'billValidated': True,
                              'countyPaymentStatus': 'unverified', 'delivered': bool(result),
                              'mode': 'dry_run' if args.dry_run else 'live'}))
        except Exception as exc:
            failures += 1
            # Log the operation and non-sensitive HTTP status; never response bodies or URLs.
            from urllib.error import HTTPError
            details = {'propertyId': nye.PROPERTY_ID, 'status': 'collection_or_delivery_failed', 'stage': stage, 'errorType': type(exc).__name__}
            if isinstance(exc, HTTPError):
                details['httpStatus'] = exc.code
            print(json.dumps(details), file=sys.stderr)
    valencia=load('valencia_treasurer','valencia-treasurer-extractor.py')
    for property_id in (valencia.ACCOUNTS if args.county in ['all','valencia'] else []):
        stage='treasurer_guest_retrieval'
        try:
            if args.dry_run:
                account=valencia.extract(property_id,datetime.now(ZoneInfo('America/Denver')).year)
                stage='treasurer_normalization';snapshot=normalize_valencia_treasurer(account);result=None
            else:
                stage='isolated_worker_county_collection';result=collect_valencia_in_worker(property_id,endpoint,secret)
            print(json.dumps({'propertyId':property_id,'assessmentScope':'full_assessment','balanceObserved':True,'countyPaymentStatus':'unverified','delivered':bool(result),'mode':'dry_run' if args.dry_run else 'live'}))
        except Exception as exc:
            failures+=1
            from urllib.error import HTTPError
            details={'propertyId':property_id,'status':'collection_or_delivery_failed','stage':getattr(exc,'county_stage',stage),'errorType':type(exc).__name__,'interactiveChallenge':getattr(exc,'challenge',False)}
            if hasattr(exc,'county_http_status'):details['countyHttpStatus']=exc.county_http_status
            if isinstance(exc,HTTPError):details['httpStatus']=exc.code
            print(json.dumps(details),file=sys.stderr)
    for county,module_path,normalizer in [('navajo','navajo-tax-extractor.py',normalize_navajo),('apache','apache-tax-extractor.py',normalize_apache)]:
        if args.county not in ['all',county]:continue
        module=load(county+'_county',module_path)
        stage='public_account_retrieval'
        try:
            account=module.fetch(datetime.now(ZoneInfo('America/Phoenix')).year)
            stage='account_normalization';snapshot=normalizer(account)
            stage='worker_delivery';result=None if args.dry_run else deliver(snapshot,endpoint,secret)
            print(json.dumps({'propertyId':module.PROPERTY_ID,'countyPaymentStatus':account['paymentStatus'],'delivered':bool(result),'mode':'dry_run' if args.dry_run else 'live'}))
        except Exception as exc:
            failures+=1
            from urllib.error import HTTPError
            details={'propertyId':module.PROPERTY_ID,'status':'collection_or_delivery_failed','stage':stage,'errorType':type(exc).__name__}
            if isinstance(exc,HTTPError):details['httpStatus']=exc.code
            print(json.dumps(details),file=sys.stderr)
    if args.county in ['all','iron']:
        iron=load('iron_county','iron-tax-extractor.py')
        for property_id in iron.ACCOUNTS:
            stage='public_account_retrieval'
            try:
                account=iron.fetch(property_id,datetime.now(ZoneInfo('America/Denver')).year)
                stage='account_normalization';snapshot=normalize_iron(account)
                stage='worker_delivery';result=None if args.dry_run else deliver(snapshot,endpoint,secret)
                print(json.dumps({'propertyId':property_id,'countyPaymentStatus':'unverified','balanceObserved':True,'delivered':bool(result),'mode':'dry_run' if args.dry_run else 'live'}))
            except Exception as exc:
                failures+=1
                from urllib.error import HTTPError
                details={'propertyId':property_id,'status':'collection_or_delivery_failed','stage':stage,'errorType':type(exc).__name__}
                if isinstance(exc,HTTPError):details['httpStatus']=exc.code
                print(json.dumps(details),file=sys.stderr)
    return 1 if failures else 0

if __name__ == '__main__':
    sys.exit(main())
