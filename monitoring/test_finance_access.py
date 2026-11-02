import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('finance_access',Path(__file__).with_name('finance-access.py'))
access=importlib.util.module_from_spec(spec);spec.loader.exec_module(access)
class FinanceAccessTests(unittest.TestCase):
    def rules(self):return [{'id':'source-policy','name':'Existing finance users','decision':'allow','include':[{'email':{'email':'owner@example.test'}}],'require':[{'login_method':{'id':'existing-method'}}],'exclude':[]}]
    def test_rejects_bypass_and_broad_principals(self):
        for patch in [{'decision':'bypass'},{'include':[{'everyone':{}}]},{'require':[{'email_domain':{'domain':'example.test'}}]}]:
            with self.assertRaises(ValueError):access.policy_rules([{**self.rules()[0],**patch}])
    def test_new_app_preserves_exact_rules_and_never_updates_existing_app(self):
        writes=[]
        def api(token,path,method='GET',payload=None):
            if method!='GET':
                writes.append((path,method,payload));return {'result':{'id':'new','domain':access.DOMAIN,'aud':'a'*64}}
            if path.endswith('/'+access.SOURCE_APP):return {'result':{'domain':'adexholdings.com/finance.html*','allowed_idps':['existing-method']}}
            if path.endswith('/policies'):return {'result':self.rules()}
            return {'result':[]}
        self.assertEqual(access.provision('test',api),'a'*64);self.assertEqual(len(writes),1)
        path,method,body=writes[0];self.assertEqual(method,'POST');self.assertTrue(path.endswith('/access/apps'));self.assertEqual(body['domain'],access.DOMAIN)
        self.assertEqual(body['policies'][0]['include'],self.rules()[0]['include']);self.assertEqual(body['policies'][0]['require'],self.rules()[0]['require'])
    def test_existing_matching_app_is_read_only(self):
        def api(token,path,method='GET',payload=None):
            self.assertEqual(method,'GET')
            if path.endswith('/'+access.SOURCE_APP):return {'result':{'domain':'adexholdings.com/finance.html*'}}
            if path.endswith('/policies'):return {'result':self.rules()}
            return {'result':[{'id':'new','name':access.NAME,'domain':access.DOMAIN,'aud':'a'*64}]}
        self.assertEqual(access.provision('test',api),'a'*64)
    def test_drift_or_wrong_source_is_not_silently_overwritten(self):
        def api(token,path,method='GET',payload=None):return {'result':{'domain':'other.example'}}
        with self.assertRaises(ValueError):access.provision('test',api)
if __name__=='__main__':unittest.main()
