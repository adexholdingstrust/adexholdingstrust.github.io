import importlib.util
from pathlib import Path
import json,unittest
from unittest.mock import MagicMock
spec=importlib.util.spec_from_file_location('routing',Path(__file__).with_name('inspect-receipt-routing.py'));routing=importlib.util.module_from_spec(spec);spec.loader.exec_module(routing)
class ReceiptRoutingInspectionTests(unittest.TestCase):
    def test_inspection_only_reads_pinned_zone_and_never_returns_credentials_or_raw_records(self):
        calls=[]
        def request(req,timeout):
            self.assertEqual(req.method,'GET');self.assertTrue(req.full_url.startswith('https://api.cloudflare.com/client/v4/zones/'+routing.ZONE+'/'));calls.append(req.full_url)
            response=MagicMock();response.status=200;response.__enter__.return_value=response;response.read.return_value=json.dumps({'success':True,'result':{'enabled':False} if req.full_url.endswith('/email/routing') else [{'content':'private-record-value'}]}).encode();return response
        result=routing.inspect('private-token',request);self.assertEqual(len(calls),4);self.assertFalse(result['mutationsPerformed']);self.assertNotIn('private-token',json.dumps(result));self.assertNotIn('private-record-value',json.dumps(result))
        with self.assertRaises(ValueError):routing.NoRedirect().redirect_request(None,None,302,'',{},'https://elsewhere.test')
