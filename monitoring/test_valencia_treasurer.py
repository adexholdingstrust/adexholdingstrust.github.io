import importlib.util
from pathlib import Path
import unittest

def load(name,file):
 spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(file));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
v=load('valencia_treasurer','valencia-treasurer-extractor.py');collector=load('collector','collect-county-tax.py')
def table(rows):return '<table>'+''.join('<tr>'+''.join('<td>'+str(c)+'</td>' for c in r)+'</tr>' for r in rows)+'</table>'
identity='<a href="account.jsp?account=R023098">Summary</a>'
summary='<form><input type="hidden" name="account" value="R023098"></form><p>Parcel 1016026124054100690</p>'+identity+table([['Taxes','','$10.00'],['Special Assessment','District','$0.50'],['Special Assessment','Admin','$0.25'],['Total Billed','','$10.75']])
ledger=identity+table([['Tax Year','Tax Due','Interest Due','Penalty Due','Misc Due','Lien Due','Lien Interest Due','Total Due'],['2026','$10.50','$0.00','$0.00','$0.25','$0.00','$0.00','$10.75']])+table([['Tax Year','Type','Effective Date','Amount','Balance'],['2026','Tax','10/5/26','$10.00','$10.00'],['2026','Special Assessment','10/5/26','$0.50','$0.50'],['2026','Miscellaneous','10/5/26','$0.25','$0.25'],['2025','Tax Payment','10/15/25','$9.00','$0.00']])
class ValenciaTreasurerTests(unittest.TestCase):
 def test_complete_total_reconciles_special_assessments_and_admin_charges(self):
  r=v.parse('valencia-nm-rge-1',summary,ledger,2026);self.assertEqual(r['annualAssessment'],10.75);self.assertEqual(r['accountBalance'],10.75);self.assertEqual(r['assessmentScope'],'full_assessment');self.assertEqual(r['paymentStatus'],'unverified')
  s=collector.normalize_valencia_treasurer(r);self.assertIsNone(s['dueDate']);self.assertEqual(s['balanceDue'],10.75);self.assertEqual(s['payments'],[]);self.assertNotIn('countySettlement',s)
 def test_wrong_account_parcel_annual_components_and_ledger_totals_fail_closed(self):
  cases=[(summary.replace('1016026124054100690','1015029264264141100'),ledger),(summary,ledger.replace('R023098','R016363')),(summary.replace('$0.25','$0.50'),ledger),(summary,ledger.replace('$10.75','$11.00')),(summary,ledger.replace('2026','2024'))]
  for first,second in cases:
   with self.assertRaises(ValueError):v.parse('valencia-nm-rge-1',first,second,2026)
 def test_prior_payment_and_zero_balance_never_create_settlement_evidence(self):
  zero=ledger.replace("<td>$10.50</td>","<td>$0.00</td>").replace("<td>$0.25</td><td>$0.00</td><td>$0.00</td><td>$10.75</td>","<td>$0.00</td><td>$0.00</td><td>$0.00</td><td>$0.00</td>")
  r=v.parse('valencia-nm-rge-1',summary,zero,2026);self.assertEqual(r['accountBalance'],0);self.assertEqual(r['paymentStatus'],'unverified');self.assertNotIn('countySettlement',r)
if __name__=='__main__':unittest.main()
