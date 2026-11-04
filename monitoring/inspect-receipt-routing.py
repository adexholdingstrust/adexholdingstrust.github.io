"""Read-only receipt-routing prerequisites. Never enables routing or changes MX."""
import json
import os
from urllib.error import HTTPError
from urllib.request import Request,HTTPRedirectHandler,build_opener
ZONE='eae123a0ca4d89b727117b71495bcddc'
DOMAIN='adexholdings.com'
SUBDOMAIN='receipts.'+DOMAIN
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):raise ValueError('Cloudflare redirect rejected')
def inspect(token,open_request=None):
    if not token:raise ValueError('Cloudflare token missing')
    open_request=open_request or build_opener(NoRedirect()).open
    def get(path):
        request=Request('https://api.cloudflare.com/client/v4/zones/'+ZONE+path,headers={'Authorization':'Bearer '+token,'User-Agent':'AdexPropertyMonitor/2.0 (+https://adexholdings.com)'},method='GET')
        try:
            with open_request(request,timeout=25) as response:
                data=json.loads(response.read(100000));return {'status':response.status,'result':data.get('result') if data.get('success') else None}
        except HTTPError as exc:return {'status':exc.code,'result':None}
    settings=get('/email/routing');required=get('/email/routing/dns?subdomain='+SUBDOMAIN)
    subdomain=get('/dns_records?name='+SUBDOMAIN+'&type=MX');root=get('/dns_records?name='+DOMAIN+'&type=MX')
    root_records=root['result'] if isinstance(root['result'],list) else []
    return {'mode':'read_only','mutationsPerformed':False,'subdomain':SUBDOMAIN,'emailRoutingHttpStatus':settings['status'],'emailRoutingEnabled':settings['result'].get('enabled') if isinstance(settings['result'],dict) else None,'subdomainRequirementsHttpStatus':required['status'],'subdomainDnsHttpStatus':subdomain['status'],'existingSubdomainMxCount':len(subdomain['result']) if isinstance(subdomain['result'],list) else None,'rootDnsHttpStatus':root['status'],'rootMxCount':len(root_records) if root['result'] is not None else None,'rootUsesGoogleWorkspace':any('google.com' in str(x.get('content','')) for x in root_records),'rootMxMustRemainUnchanged':True}
if __name__=='__main__':
    print(json.dumps(inspect(os.environ.get('CLOUDFLARE_API_TOKEN',''))))
