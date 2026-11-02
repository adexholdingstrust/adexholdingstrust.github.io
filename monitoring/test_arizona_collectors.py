"""Synthetic county fixtures; no real remitter or receipt identifiers."""
import importlib.util
from pathlib import Path
from datetime import datetime,timezone
import unittest

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(path));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
navajo=load('navajo','navajo-tax-extractor.py');apache=load('apache','apache-tax-extractor.py');collector=load('collector','collect-county-tax.py')
def table(rows):return '<table>'+''.join('<tr>'+''.join('<td>'+str(c)+'</td>' for c in r)+'</tr>' for r in rows)+'</table>'
def navajo_page(paid=True,receipt=False,parcel='20123012',receipt_amount='100.05',tax='100.05',prior_balance='$0.00'):
    history=[['Year (Roll)','Balance','Status','Taxes','Interest','Fees','Payments','1st Half Delinq','2nd Half Delinq','Name'],['2026 (12345)','$0.00' if paid else '$100.05','Paid in Full' if paid else 'Unpaid','$'+tax,'$0.00','$0.00','$100.05' if paid else '$0.00','All Due 12/31/2026','','redacted'],['2025 (9999)',prior_balance,'Paid in Full','$90.00','$0.00','$0.00','$90.00','All Due 12/31/2025','','redacted']]
    html='<form><input type="hidden" name="hdnParcelNumber" value="'+parcel+'"></form>'+table(history)+table([['Tax Authority','Charge Amount','Tax Code Description'],['Authority A','$50.00','Primary Tax'],['Authority B','$50.05','Secondary Tax']])
    if receipt:html+=table([['Amount','Payment Date','Remitter','Method','Note 1','Note 2'],['$'+receipt_amount,'10/01/2026','redacted','Check','','']])
    return html
class ArizonaTests(unittest.TestCase):
    def test_navajo_requires_tax_ledger_breakdown_and_receipt_reconciliation(self):
        result=navajo.parse(navajo_page(),navajo_page(receipt=True),2026)
        self.assertEqual(result['paymentStatus'],'paid_confirmed');self.assertEqual(result['annualAssessment'],100.05);self.assertEqual(result['accountBalance'],0)
        snapshot=collector.normalize_navajo(result,datetime(2026,11,2,tzinfo=timezone.utc));self.assertEqual(snapshot['countySettlement']['latestReceiptOn'],'2026-10-01');self.assertEqual(snapshot['countySettlement']['method'],'county_ledger_and_receipts')
    def test_navajo_rejects_wrong_parcel_receipt_mismatch_and_missing_history(self):
        cases=[(navajo_page(parcel='other'),navajo_page(receipt=True)),(navajo_page(),navajo_page(receipt=True,receipt_amount='50.00')),(navajo_page(),navajo_page()),(navajo_page(tax='200.00'),navajo_page(receipt=True,tax='200.00'))]
        for first,second in cases:
            with self.assertRaises(ValueError):navajo.parse(first,second,2026)
    def test_navajo_unpaid_or_prior_year_debt_never_claims_account_cleared(self):
        unpaid=navajo.parse(navajo_page(paid=False),navajo_page(paid=False),2026);self.assertEqual(unpaid['paymentStatus'],'unverified');self.assertNotIn('countySettlement',unpaid)
        prior=navajo.parse(navajo_page(prior_balance='$1.00'),navajo_page(receipt=True,prior_balance='$1.00'),2026);self.assertEqual(prior['paymentStatus'],'unverified');self.assertEqual(prior['accountBalance'],1)
    def apache_page(self):
        return '<div>Account R0042800 Parcel 206-30-098</div>'+table([['First Half PaymentDue 11/2/26','$12.25'],['Full PaymentDue 12/31/26','$24.50']])+table([['Taxes (Limited Property)','','$2.00'],['Taxes (LPV)','','$20.00'],['Taxes (Flood)','','$2.50'],['Total Billed','','$24.50']])
    def test_apache_options_are_alternatives_not_summed_installments(self):
        result=apache.parse(self.apache_page(),2026);self.assertEqual(result['annualAssessment'],24.5);self.assertEqual([x['amount'] for x in result['paymentOptions']],[12.25,24.5]);self.assertEqual(result['paymentStatus'],'unverified')
        snapshot=collector.normalize_apache(result,datetime(2026,11,2,tzinfo=timezone.utc));self.assertIsNone(snapshot['amountDue']);self.assertIsNone(snapshot['balanceDue']);self.assertIsNone(snapshot['dueDate']);self.assertNotIn('installments',snapshot)
    def test_apache_rejects_wrong_property_ambiguous_options_and_bad_component_totals(self):
        for html in [self.apache_page().replace('206-30-098','999-99-999'),self.apache_page().replace('$2.50','$9.50'),self.apache_page().replace('Full PaymentDue','Unknown PaymentDue')]:
            with self.assertRaises(ValueError):apache.parse(html,2026)
if __name__=='__main__':unittest.main()
