import importlib.util
from pathlib import Path
import os
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('deployment',Path(__file__).with_name('deploy-monitor.py'))
deployment=importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment)

class DeploymentTests(unittest.TestCase):
    def base(self):
        return {'name':deployment.WORKER,'account_id':deployment.ACCOUNT,'main':'index.js','compatibility_date':'2026-10-23','triggers':{'crons':['15 14 * * *']}}

    def test_refuses_other_account_worker_and_routes(self):
        for patch_value in [{'account_id':'other'},{'name':'adex-trust-security'},{'routes':['adexholdings.com/*']},{'services':[{}]}]:
            with self.assertRaises(ValueError):
                deployment.make_config({**self.base(),**patch_value},'a'*32)

    def test_dedicated_binding_and_notifications_off(self):
        config=deployment.make_config(self.base(),'a'*32)
        self.assertEqual(config['kv_namespaces'],[{'binding':'HOA_MONITOR_KV','id':'a'*32}])
        self.assertEqual(config['vars']['NOTIFICATIONS_ENABLED'],'false')
        self.assertNotIn('services',config)

    def test_signing_key_is_domain_separated_and_explicit_key_preferred(self):
        with patch.dict(os.environ,{},clear=True):
            key=deployment.signing_secret('test-only-token')
            self.assertEqual(key,deployment.signing_secret('test-only-token'))
            self.assertNotEqual(key,'test-only-token')
            self.assertNotEqual(key,deployment.signing_secret('different-token'))
        with patch.dict(os.environ,{'ADEX_MONITOR_INGEST_SECRET':'x'*32},clear=True):
            self.assertEqual(deployment.signing_secret('test-only-token'),'x'*32)

    def test_api_rejects_other_account_before_transmission(self):
        with self.assertRaises(ValueError):
            deployment.api('test-only','/accounts/other/workers/scripts')

if __name__=='__main__':unittest.main()
