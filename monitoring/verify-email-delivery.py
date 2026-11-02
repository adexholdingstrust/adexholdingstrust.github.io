"""Send one clearly labelled monitoring acceptance email to the configured owners.
Run only on the protected GitHub environment. The Brevo key is read from the
runner environment and is never printed, passed on a command line, or stored.
"""
import json
import importlib.util
from pathlib import Path
import os
import sys
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, Request, build_opener

RECIPIENTS = ('tenantservices@adexholdings.com', 'ahmedadeyemi@gmail.com')
SENDER = 'sitealert@adexholdings.com'

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('Unexpected email provider redirect')


def send_test(api_key, open_request=None):
    api_key = api_key.strip()
    if not api_key:
        raise ValueError('Brevo API key is not configured')
    payload = {'sender': {'email': SENDER, 'name': 'Adex Property Monitoring'},
               'to': [{'email': email} for email in RECIPIENTS],
               'subject': 'Adex property monitoring: test notification',
               'textContent': 'This is a test of Adex Holdings HOA and property tax monitoring email delivery. No payment was made or requested. Monitoring coverage and payment status must be verified separately.'}
    req = Request('https://api.brevo.com/v3/smtp/email', data=json.dumps(payload).encode(), method='POST',
                  headers={'Content-Type': 'application/json', 'api-key': api_key})
    opener = open_request or build_opener(NoRedirect()).open
    try:
        with opener(req, timeout=20) as response:
            if response.status not in (200, 201, 202):
                raise ValueError('Provider did not accept the test email')
            return response.status
    except HTTPError as exc:
        # Classify the provider response without logging bodies, keys, or auth URLs.
        reason = 'provider_rejected'
        try:
            data = json.loads(exc.read(4096))
            message = str(data.get('message', '')).lower()
            if 'ip' in message and any(word in message for word in ['unrecogn', 'unauthor', 'not author', 'whitelist', 'blocked']):
                reason = 'source_ip_not_authorized'
            elif any(word in message for word in ['key not found', 'invalid api key', 'api key is not enabled', 'invalid authentication']):
                reason = 'api_key_not_recognized_or_enabled'
        except (ValueError, TypeError, AttributeError):
            pass
        raise ValueError(f'Provider rejected test email with HTTP {exc.code}; reason={reason}') from None


def main():
    key = os.environ.get('ADEX_MONITOR_BREVO_API_KEY', '')
    if not key:
        print('Monitoring email test blocked: ADEX_MONITOR_BREVO_API_KEY is not configured.', file=sys.stderr)
        return 1
    try:
        token = os.environ.get('CLOUDFLARE_API_TOKEN', '')
        if not token:
            raise ValueError('Cloudflare deployment token is needed for runtime email acceptance')
        spec = importlib.util.spec_from_file_location('monitor_deployment', Path(__file__).with_name('deploy-monitor.py'))
        deployment = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(deployment)
        secret = deployment.signing_secret(token)
        print('::add-mask::' + secret, flush=True)
        subdomain = deployment.api(token, f'/accounts/{deployment.ACCOUNT}/workers/subdomain')['result']['subdomain']
        import re
        if not re.fullmatch(r'[a-z0-9-]+', subdomain):
            raise ValueError('Unexpected Worker subdomain')
        deployment.verify_runtime_email(f'https://{deployment.WORKER}.{subdomain}.workers.dev', secret)
        return 0
    except Exception as exc:
        print('Monitoring email test failed: ' + (str(exc) if isinstance(exc, (ValueError, RuntimeError)) else type(exc).__name__), file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
