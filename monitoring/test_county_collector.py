import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).with_name('collect-county-tax.py')
spec = importlib.util.spec_from_file_location('collector', path)
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)

class CollectorTests(unittest.TestCase):
    def test_requires_account_bill_reconciliation(self):
        with self.assertRaises(ValueError):
            collector.normalize({'reconciled': False})

    def test_preserves_year_balance_and_no_invented_deadline_or_payment_date(self):
        result = collector.normalize({'reconciled': True, 'propertyId': 'elko-nv-10a-1',
            'sourceUrl': 'https://elko-search.gsacorp.io/tax/00712Q011', 'taxYear': '2026/2027',
            'annualAssessment': '11.73', 'currentYearPaid': '11.73', 'accountBalance': '0.00',
            'currentYearBalance': '0.00', 'billPreviousPayments': '11.73'})
        self.assertIsNone(result['dueDate'])
        self.assertEqual(result['payments'], [])
        self.assertEqual(result['countySettlement']['postedTotal'], 11.73)

    def test_rejects_non_https_delivery_before_transmitting(self):
        for url in ['http://example.test', 'https://user:password@example.test', 'https://example.test/?key=secret']:
            with self.assertRaises(ValueError):
                collector.deliver({}, url, 'test-only')

if __name__ == '__main__':
    unittest.main()
