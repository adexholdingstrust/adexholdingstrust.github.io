"""Send one clearly labelled monitoring acceptance email to the configured owners.
Run only on the protected GitHub environment. The Brevo key is read from the
runner environment and is never printed, passed on a command line, or stored.
"""
import json
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
        raise ValueError(f'Provider rejected test email with HTTP {exc.code}') from None


def main():
    key = os.environ.get('ADEX_MONITOR_BREVO_API_KEY', '')
    if not key:
        print('Monitoring email test blocked: ADEX_MONITOR_BREVO_API_KEY is not configured.', file=sys.stderr)
        return 1
    try:
        status = send_test(key)
        print(f'Test message accepted by Brevo (HTTP {status}); inbox delivery still requires verification.')
        return 0
    except Exception as exc:
        print('Monitoring email test failed: ' + (str(exc) if isinstance(exc, ValueError) else type(exc).__name__), file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
