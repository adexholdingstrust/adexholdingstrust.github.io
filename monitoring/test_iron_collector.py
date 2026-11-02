import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('iron',Path(__file__).with_name('iron-tax-extractor.py'));iron=importlib.util.module_from_spec(spec);spec.loader.exec_module(iron)
def table(rows):return '<table>'+''.join('<tr>'+''.join('<td>'+str(c)+'</td>' for c in r)+'</tr>' for r in rows)+'</table>'
identity=table([['Account Id','0503376'],['Parcel Number','E-1699-0038-0000']])
summary=identity+table([['Taxes','','$25.00']])
transactions=identity+'<a href="account.jsp?account=0503376">Account Summary</a>'+table([['Tax Year','Tax Due','Interest Due','Penalty Due','Misc Due','Lien Due','Lien Interest Due','Total Due'],['2026','$0.00','$0.00','$0.00','$0.00','$0.00','$0.00','$0.00']])+table([['Tax Year','Type','Effective Date','Amount','Balance'],['2026','Tax Charge','10/12/26','$25.00','$0.00'],['2026','Tax Payment','10/20/26','$25.00','$0.00']])
class IronTests(unittest.TestCase):
 def test_zero_balance_is_observed_but_not_claimed_payment_confirmation(self):
  result=iron.parse('iron-ut-113',summary,transactions,2026)
  self.assertEqual(result['annualAssessment'],25);self.assertEqual(result['accountBalance'],0);self.assertEqual(result['paymentStatus'],'unverified');self.assertNotIn('countySettlement',result)
 def test_wrong_identity_and_mismatched_charge_rejected(self):
  for tx in [transactions.replace('0503376','9999999'),transactions.replace('$25.00','$24.00'),transactions.replace('2026','2025')]:
   with self.assertRaises(ValueError):iron.parse('iron-ut-113',summary,tx,2026)
 def test_all_due_components_must_reconcile(self):
  with self.assertRaises(ValueError):iron.parse('iron-ut-113',summary,transactions.replace("<td>$0.00</td>","<td>$1.00</td>",1),2026)
if __name__=='__main__':unittest.main()
