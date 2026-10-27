import importlib.util
import json
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('email_acceptance', Path(__file__).with_name('verify-email-delivery.py'))
email = importlib.util.module_from_spec(spec)
spec.loader.exec_module(email)

class EmailAcceptanceTests(unittest.TestCase):
    def test_labels_test_and_targets_only_requested_recipients(self):
        captured = {}
        class Response:
            status = 201
            def __enter__(self): return self
            def __exit__(self, *args): return False
        def opener(req, timeout):
            captured['body'] = json.loads(req.data)
            self.assertEqual(req.full_url, 'https://api.brevo.com/v3/smtp/email')
            return Response()
        self.assertEqual(email.send_test('test-only', opener), 201)
        self.assertEqual([x['email'] for x in captured['body']['to']], list(email.RECIPIENTS))
        self.assertIn('test', captured['body']['subject'].lower())
        self.assertIn('No payment', captured['body']['textContent'])

    def test_missing_key_fails_before_network(self):
        with self.assertRaises(ValueError):
            email.send_test('', lambda *args, **kwargs: self.fail('Must not send'))

if __name__ == '__main__': unittest.main()
