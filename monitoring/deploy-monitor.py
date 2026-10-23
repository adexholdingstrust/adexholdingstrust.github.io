"""Pinned-account CI deployment; secrets stay in runner memory and Cloudflare.
Only the named monitoring Worker and its dedicated namespace may be mutated.
No website routes, production finance bindings, DNS, or existing Workers are changed.
"""
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
import tomllib
from urllib.error import HTTPError
from urllib.request import Request, HTTPRedirectHandler, build_opener

ACCOUNT = '8956c5a630c91f81296ffb3e8f9a7532'
WORKER = 'adex-hoa-monitor'
NAMESPACE = 'adex-hoa-monitor-dedicated-v1'
ROOT = Path(__file__).resolve().parents[1]
WRANGLER = ['npx', '--yes', 'wrangler@4.86.0']

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise RuntimeError('Unexpected redirect rejected')


def api(token, path, method='GET', payload=None):
    # Paths are fixed in this file; callers cannot choose another account.
    if not path.startswith('/accounts/' + ACCOUNT + '/'):
        raise ValueError('Account scope rejected')
    data = None if payload is None else json.dumps(payload).encode()
    req = Request('https://api.cloudflare.com/client/v4' + path, data=data, method=method,
                  headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        with build_opener(NoRedirect()).open(req, timeout=30) as response:
            result = json.loads(response.read(2000000))
    except HTTPError as exc:
        raise RuntimeError('Cloudflare API returned HTTP ' + str(exc.code)) from None
    if not result.get('success'):
        raise RuntimeError('Cloudflare rejected the scoped operation')
    return result


def signing_secret(token):
    # Domain-separated key; never send the Cloudflare API token to ingestion.
    # Explicit dedicated signing secret takes precedence when configured.
    explicit = os.environ.get('ADEX_MONITOR_INGEST_SECRET', '')
    if explicit:
        if len(explicit) < 32:
            raise ValueError('Dedicated signing secret must have at least 32 characters')
        return explicit
    return hmac.new(token.encode(), b'adex-hoa-monitor-ingestion-v2', hashlib.sha256).hexdigest()


def make_config(base, namespace_id):
    if base.get('name') != WORKER or base.get('account_id') != ACCOUNT or base.get('main') != 'index.js':
        raise ValueError('Deployment identity mismatch')
    if any(base.get(k) for k in ['routes', 'route', 'services', 'assets', 'env']):
        raise ValueError('Unexpected production integration rejected')
    if not re.fullmatch(r'[a-f0-9]{32}', namespace_id):
        raise ValueError('Invalid namespace ID')
    return {'name': WORKER, 'account_id': ACCOUNT, 'main': 'index.js',
            'compatibility_date': base['compatibility_date'], 'workers_dev': True,
            'vars': {'NOTIFICATIONS_ENABLED': 'false', 'HOA_SENDER_EMAIL': 'sitealert@adexholdings.com'},
            'triggers': base['triggers'],
            'kv_namespaces': [{'binding': 'HOA_MONITOR_KV', 'id': namespace_id}]}


def namespace(token):
    matches = []
    for page in range(1, 100):
        result = api(token, f'/accounts/{ACCOUNT}/storage/kv/namespaces?page={page}&per_page=100')
        rows = result['result']
        matches.extend(row for row in rows if row.get('title') == NAMESPACE)
        if len(rows) < 100:
            break
    else:
        raise RuntimeError('Namespace listing exceeded safety bound')
    if len(matches) > 1:
        raise RuntimeError('Ambiguous monitoring namespace')
    if matches:
        return matches[0]['id']
    return api(token, f'/accounts/{ACCOUNT}/storage/kv/namespaces', 'POST', {'title': NAMESPACE})['result']['id']


def smoke(origin, secret):
    def request(path, method='GET', body=None, signed=False):
        headers = {'Content-Type': 'application/json'}
        if signed:
            stamp = str(int(time.time()))
            data = body or b''
            signature = hmac.new(secret.encode(), stamp.encode() + b'.' + data, hashlib.sha256).hexdigest()
            headers.update({'X-Adex-Timestamp': stamp, 'X-Adex-Signature': 'sha256=' + signature})
        req = Request(origin + path, data=body, headers=headers, method=method)
        try:
            with build_opener(NoRedirect()).open(req, timeout=25) as res:
                return res.status, json.loads(res.read(20000))
        except HTTPError as exc:
            return exc.code, None
    health = None
    status = None
    # A newly published secret/version can take a short time to reach the edge.
    for attempt in range(7):
        status, health = request('/health')
        ready = (status == 200 and isinstance(health, dict) and
                 health.get('service') == WORKER and health.get('version') == 2 and
                 health.get('storageConfigured') and health.get('signingConfigured') and
                 not health.get('notificationsEnabled'))
        if ready:
            break
        if attempt < 6:
            time.sleep(5)
    else:
        flags = {key: health.get(key) for key in ['service', 'version', 'storageConfigured', 'signingConfigured', 'notificationsEnabled']} if isinstance(health, dict) else {}
        raise RuntimeError('Worker health verification failed: HTTP ' + str(status) + ' ' + json.dumps(flags))
    if request('/ingest', 'POST', b'{}')[0] != 401:
        raise RuntimeError('Unsigned ingestion was not rejected')
    if request('/ingest', 'POST', b'{}', True)[0] != 400:
        raise RuntimeError('Invalid signed snapshot was not rejected')
    if request('/status', signed=True)[0] != 200:
        raise RuntimeError('Authenticated status failed')


def main():
    token = os.environ.get('CLOUDFLARE_API_TOKEN', '')
    if not token:
        raise RuntimeError('Add repository Actions secret ADEX_MONITOR_CLOUDFLARE_API_TOKEN')
    base = tomllib.loads((ROOT / 'hoa-monitor-worker/wrangler.toml').read_text())
    # Validate target before API mutations.
    make_config(base, '0' * 32)
    secret = signing_secret(token)
    print('::add-mask::' + secret, flush=True)
    namespace_id = namespace(token)
    config = make_config(base, namespace_id)
    config_path = ROOT / 'hoa-monitor-worker/wrangler.ci.json'
    config_path.write_text(json.dumps(config))  # Resource IDs only; no credentials.
    try:
        subprocess.run(WRANGLER + ['deploy', '--config', str(config_path)], cwd=ROOT, check=True)
        # CLI receives signing material on stdin, never command arguments or files.
        subprocess.run(WRANGLER + ['secret', 'put', 'HOA_INGEST_SECRET', '--config', str(config_path)],
                       input=secret + '\n', text=True, cwd=ROOT, check=True)
        brevo = os.environ.get('ADEX_MONITOR_BREVO_API_KEY', '')
        if brevo:
            subprocess.run(WRANGLER + ['secret', 'put', 'BREVO_API_KEY', '--config', str(config_path)],
                           input=brevo + '\n', text=True, cwd=ROOT, check=True)
        subdomain = api(token, f'/accounts/{ACCOUNT}/workers/subdomain')['result']['subdomain']
        if not re.fullmatch(r'[a-z0-9-]+', subdomain):
            raise RuntimeError('Unexpected Worker subdomain')
        origin = f'https://{WORKER}.{subdomain}.workers.dev'
        smoke(origin, secret)
        child_env = dict(os.environ, ADEX_MONITOR_URL=origin, ADEX_MONITOR_INGEST_SECRET=secret)
        subprocess.run([sys.executable, 'monitoring/collect-county-tax.py'], env=child_env, cwd=ROOT, check=True)
        smoke(origin, secret)
        summary = '\n'.join(['## Isolated monitoring deployment', '- Worker: ' + WORKER,
                             '- Origin: ' + origin, '- Namespace: ' + namespace_id,
                             '- Health/authentication checks: passed',
                             '- Both Elko county observations: delivered after account/bill reconciliation',
                             '- Email notifications: disabled pending acceptance',
                             '- Authenticated HOA and remaining county collectors: still pending']) + '\n'
        if os.environ.get('GITHUB_STEP_SUMMARY'):
            with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as out:
                out.write(summary)
        print(summary)
    finally:
        config_path.unlink(missing_ok=True)

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # Do not expose request headers, credential contents, or provider bodies.
        print('Deployment failed: ' + (str(exc) if isinstance(exc, (RuntimeError, ValueError)) else type(exc).__name__), file=sys.stderr)
        sys.exit(1)
