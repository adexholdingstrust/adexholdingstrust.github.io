import importlib.util
from pathlib import Path
from datetime import datetime,timezone
from unittest.mock import patch
import unittest
from urllib.request import Request

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(path));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
valencia=load('valencia','valencia-tax-extractor.py');collector=load('collector','collect-county-tax.py')
class ValenciaTests(unittest.TestCase):
    def page(self,amount='4.76',year='2026'):
        return valencia.Page.parse(f'<h1>Account: R023098</h1><div>1-016-026-124-054-100690</div><table><tr><th>Tax Year</th><th>Taxes</th></tr><tr><td>{year}</td><td>${amount}</td></tr></table><i>Special assessments exist for 2026</i>')
    def test_tax_history_is_base_only_not_settlement_or_total_due(self):
        p=self.page()
        with patch.object(valencia,'read_account',return_value=(p,p)):
            result=valencia.extract('valencia-nm-rge-1',2026)
        snapshot=collector.normalize_valencia(result,datetime(2026,11,2,tzinfo=timezone.utc))
        self.assertEqual(snapshot['annualAssessment'],4.76);self.assertEqual(snapshot['assessmentScope'],'base_tax_only');self.assertIsNone(snapshot['balanceDue']);self.assertIsNone(snapshot['dueDate']);self.assertEqual(snapshot['payments'],[])
    def test_missing_current_year_and_mismatch_fail_closed(self):
        with self.assertRaises(ValueError):valencia.reported_tax(self.page(year='2025'),2026)
        with patch.object(valencia,'read_account',return_value=(self.page(),self.page('9.50'))):
            with self.assertRaises(ValueError):valencia.extract('valencia-nm-rge-1',2026)
    def test_duplicate_tax_rows_and_invalid_amounts_are_rejected(self):
        p=self.page();p.tables[0].append(['2026','$4.76'])
        with self.assertRaises(ValueError):valencia.reported_tax(p,2026)
        for amount in ['1,23.00','NaN','-4.76','4.761']:
            with self.assertRaises(ValueError):valencia.reported_tax(self.page(amount),2026)
    def test_guest_redirect_stays_encrypted_and_never_leaves_county(self):
        handler=valencia.SafeRedirect();req=Request('https://'+valencia.HOST+'/assessor/web/loginPOST.jsp',data=b'guest=true')
        out=handler.redirect_request(req,None,302,'',{},'http://'+valencia.HOST+'/assessor/taxweb/search.jsp')
        self.assertTrue(out.full_url.startswith('https://'+valencia.HOST+'/'))
        with self.assertRaises(ValueError):handler.redirect_request(req,None,302,'',{},'https://other.example/')
    def test_nested_layout_does_not_mix_owner_text_into_tax_table(self):
        p=valencia.Page.parse('<table><tr><td>Private owner<table><tr><th>Tax Year</th><th>Taxes</th></tr><tr><td>2026</td><td>$9.50</td></tr></table></td></tr></table>')
        self.assertEqual(float(valencia.reported_tax(p,2026)),9.5)
if __name__=='__main__':unittest.main()
