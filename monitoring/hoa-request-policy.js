/* Browser writes are limited to observed sign-in endpoints. Payment actions remain blocked. */
export function allowPortalWrite({provider,url,method,payload,expectedAccountNumber,allowProfileInit=false}) {
 if(['GET','HEAD','OPTIONS'].includes(method))return true;
 const u=new URL(url);
 if(u.protocol!=='https:')return false;
 if(provider==='LCM'&&u.hostname==='lcmpropertymanagement.com'&&method==='POST'&&['/account/login/40583','/member/validateetrack'].includes(u.pathname.toLowerCase()))return true;
 if(provider==='FrontSteps'&&u.hostname==='horsecreekridge.frontsteps.com'&&method==='POST'&&u.pathname==='/users/one_click_login')return true;
 if(provider==='FrontSteps'&&allowProfileInit&&u.hostname==='fspay-api.frontsteps.com'&&u.pathname==='/api/v1/Payers'&&method==='POST') {
  const fields=['communityId','communityExternalIdentifier','externalForeignKey','name','emailAddress','accountNumber','addressLine1','addressLine2','city','state','country','postalCode','aisOwnerId','metadata','balance','isOtherAmountValidation','utmSource','utmMedium','utmCampaign','utmCampaignId','utmContent','campaignId','sessionGuid','guidParam','isNewPayer','isMobileBrowser','deviceType','transactionLimit','isAabAchAllowed','isAabAchCardAllowed'];
  return !!expectedAccountNumber && payload?.accountNumber===expectedAccountNumber && payload.isNewPayer===false && Object.keys(payload).every(k=>fields.includes(k));
 }
 return false;
}
