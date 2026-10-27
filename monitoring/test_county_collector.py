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

class NyeCollectorTests(unittest.TestCase):
    def test_bill_remains_unverified_and_selects_next_local_due_date(self):
        from datetime import datetime, timezone
        data={'propertyId':'pahrump-nv-232','sourceUrl':'https://nyenv-assessor.devnetwedge.com/TaxBill?year=2026','taxYear':'2026/2027','annualAssessment':96,'paymentStatus':'unverified','installments':[{'dueDate':'2026-10-05','amount':48},{'dueDate':'2027-01-04','amount':48}]}
        snapshot=collector.normalize_nye(data,datetime(2026,10,27,tzinfo=timezone.utc))
        self.assertEqual(snapshot['dueDate'],'2027-01-04')
        self.assertIsNone(snapshot['balanceDue'])
        self.assertEqual(snapshot['payments'],[])
        self.assertEqual(len(snapshot['installments']),2)

    def test_tax_year_rollover_uses_nevada_local_date(self):
        from datetime import datetime, timezone
        self.assertEqual(collector.nye_year(datetime(2027,7,1,5,tzinfo=timezone.utc)),2026)
        self.assertEqual(collector.nye_year(datetime(2027,7,1,8,tzinfo=timezone.utc)),2027)
