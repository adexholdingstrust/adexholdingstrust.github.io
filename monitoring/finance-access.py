"""Create only an isolated Access app; preserve the existing finance app/policy."""
import json
import re
ACCOUNT='8956c5a630c91f81296ffb3e8f9a7532'
SOURCE_APP='bde4d1da-960f-49dd-9f6b-b1b69228ba26'
DOMAIN='adex-hoa-monitor.tenantservices.workers.dev/finance/*'
NAME='Adex isolated monitoring finance view'

def policy_rules(policies):
    if not isinstance(policies,list) or not policies:
        raise ValueError('Existing finance access policy unavailable')
    result=[]
    for p in policies:
        if p.get('decision') not in ['allow','deny'] or not p.get('include'):
            raise ValueError('Unsupported finance access policy; refusing to broaden access')
        for rule in p['include']+p.get('exclude',[]):
            if set(rule)!={'email'} or not isinstance(rule['email'].get('email'),str):
                raise ValueError('Expected explicit finance identities')
        for rule in p.get('require',[]):
            if set(rule)!={'login_method'}:
                raise ValueError('Unsupported finance identity requirement')
        result.append({'name':p.get('name','Finance identities'),'decision':p['decision'],'include':p['include'],'require':p.get('require',[]),'exclude':p.get('exclude',[])})
    if not any(p['decision']=='allow' for p in result):raise ValueError('No permitted finance identities')
    return result

def provision(token,api):
    prefix=f'/accounts/{ACCOUNT}/access/apps'
    source=api(token,prefix+'/'+SOURCE_APP)['result']
    if source.get('domain')!='adexholdings.com/finance.html*':raise ValueError('Finance application identity mismatch')
    rules=policy_rules(api(token,prefix+'/'+SOURCE_APP+'/policies')['result'])
    apps=api(token,prefix+'?per_page=100')['result']
    if not isinstance(apps,list) or len(apps)>=100:raise ValueError('Access application list unavailable or requires pagination')
    found=[a for a in apps if a.get('domain')==DOMAIN]
    if len(found)>1:raise ValueError('Ambiguous isolated finance application')
    if found:
        app=found[0]
        if app.get('name')!=NAME:raise ValueError('Existing application ownership mismatch')
        existing=policy_rules(api(token,prefix+'/'+app['id']+'/policies')['result'])
        comparable=lambda ps:sorted(json.dumps({'decision':p['decision'],**{k:sorted(json.dumps(r,sort_keys=True) for r in p[k]) for k in ['include','require','exclude']}},sort_keys=True) for p in ps)
        if comparable(existing)!=comparable(rules):raise ValueError('Finance policy drift requires review')
    else:
        body={'name':NAME,'domain':DOMAIN,'type':'self_hosted','session_duration':'8h','http_only_cookie_attribute':True,'same_site_cookie_attribute':'lax','policies':rules}
        if source.get('allowed_idps'):body['allowed_idps']=source['allowed_idps']
        app=api(token,prefix,'POST',body)['result']
    if app.get('domain')!=DOMAIN or not re.fullmatch(r'[a-f0-9]{64}',app.get('aud','')):raise ValueError('Invalid isolated Access audience')
    return app['aud']
