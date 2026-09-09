import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export async function runClientWalletReadinessSmoke({apiUrl, fetchImpl=fetch}) {
  const base = new URL(apiUrl);
  assert.ok(['http:','https:'].includes(base.protocol) && ['localhost','127.0.0.1','[::1]'].includes(base.hostname), 'QA requires loopback API');
  assert.ok(!base.username && !base.password && base.pathname==='/' && !base.search && !base.hash, 'QA requires a plain loopback origin');
  let token='';
  const request=async(path,{method='GET',body}={})=>{
    const response=await fetchImpl(`${base.origin}${path}`,{
      method,redirect:'error',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    return {status:response.status,data:await response.json()};
  };
  const health=await request('/api/health/ready');
  assert.equal(health.status,200);assert.equal(health.data.env,'development','Never log in outside local development');
  assert.equal(health.data.status,'ok');
  // Separate existing seed passenger, not the driver signed in on the phone.
  const login=await request('/api/auth/login/password',{method:'POST',body:{phone:'+77000000001',password:'123456'}});
  assert.equal(login.status,200);assert.equal(login.data.user?.role,'CLIENT');
  assert.ok(login.data.token);token=login.data.token;
  const wallet=await request('/api/clients/me/wallet');
  assert.equal(wallet.status,200);
  assert.deepEqual(wallet.data.capabilities,{cardBinding:false,topUp:false});
  const [beforeCards,beforeTopups]=await Promise.all([request('/api/clients/me/wallet/cards'),request('/api/clients/me/wallet/topup-requests')]);
  assert.equal(beforeCards.status,200);assert.equal(beforeTopups.status,200);
  // Empty bodies are intentionally invalid even against the old server. The
  // readiness gate must reject BEFORE validation; no card/financial intent is sent.
  for(const path of ['cards','topup-requests']) {
    const result=await request(`/api/clients/me/wallet/${path}`,{method:'POST',body:{}});
    assert.equal(result.status,503);assert.equal(result.data.error,'CLIENT_WALLET_NOT_READY');
  }
  const [afterCards,afterTopups]=await Promise.all([request('/api/clients/me/wallet/cards'),request('/api/clients/me/wallet/topup-requests')]);
  assert.deepEqual(afterCards,beforeCards);assert.deepEqual(afterTopups,beforeTopups);
  return {environment:'local development',status:'passed',capabilities:wallet.data.capabilities,
    rejectedBeforeValidation:['cards','topup-requests'],cardsUnchanged:true,topupsUnchanged:true,
    cardsCount:afterCards.data.cards.length,topupsCount:afterTopups.data.topupRequests.length};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  runClientWalletReadinessSmoke({apiUrl:process.env.API_URL||'http://127.0.0.1:4001'})
    .then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(()=>{console.error('Client wallet local QA failed; no credentials are logged.');process.exitCode=1;});
}
