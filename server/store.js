import {createHash, timingSafeEqual} from 'node:crypto';

export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function cents(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) throw Error('Invalid payment amount');
  const [whole, fraction=''] = String(value).split('.');
  const result = Number(whole)*100 + Number(fraction.padEnd(2,'0'));
  if (!Number.isSafeInteger(result)) throw Error('Invalid payment amount');
  return result;
}
export function validSignature(body, secret) {
  if (!secret || !/^[a-f0-9]{32}$/i.test(body.hash || '')) return false;
  const expected = createHash('md5').update(secret+body.status+body.order_id+body.refno+'ok').digest();
  return timingSafeEqual(expected, Buffer.from(body.hash,'hex'));
}
export function providerOrigin() {
  if(process.env.TOYYIBPAY_ENV==='live') return 'https://toyyibpay.com';
  if(process.env.TOYYIBPAY_ENV==='sandbox') return 'https://dev.toyyibpay.com';
  throw Error('Payment environment missing');
}
export async function rpc(name, body) {
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key || !process.env.SUPABASE_URL) throw Error('Backend not configured');
  const response=await fetch(process.env.SUPABASE_URL+'/rest/v1/rpc/'+name, {
    method:'POST', headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify(body), signal:AbortSignal.timeout(10000)
  });
  if(response.ok && response.status===204) return null;
  const data=await response.json();
  if(!response.ok) throw Object.assign(Error('Database request failed'),{database:data.message});
  return data;
}
export async function provider(name, body) {
  const response=await fetch(providerOrigin()+'/index.php/api/'+name, {
    method:'POST',body:new URLSearchParams(body),signal:AbortSignal.timeout(15000)
  });
  if(!response.ok) throw Error('Payment service unavailable');
  const data=await response.json();
  if(!Array.isArray(data)) throw Error('Payment service rejected request');
  return data;
}
export async function reconcile(order) {
  if(!order?.bill_code) return 0;
  let confirmed=0;
  const transactions=await provider('getBillTransactions',{billCode:order.bill_code,billpaymentStatus:'1'});
  for(const t of transactions) {
    if(String(t.billpaymentStatus)!=='1' || t.billExternalReferenceNo!==order.reference) continue;
    const amount=cents(t.billpaymentAmount);
    if(amount!==order.subtotal_sen+order.shipping_sen || !t.billpaymentInvoiceNo) throw Error('Payment mismatch');
    await rpc('confirm_payment',{p_reference:order.reference,p_bill:order.bill_code,p_invoice:String(t.billpaymentInvoiceNo),p_amount:amount});
    confirmed++;
  }
  return confirmed;
}
export function reply(res, code, body) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.status(code).json(body);
}
export function readBody(req) {
  const b=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!b || JSON.stringify(b).length>12000) throw Error('Invalid request');
  return b;
}
export function sameOrigin(req) { return Boolean(process.env.SHOP_ORIGIN && req.headers.origin===process.env.SHOP_ORIGIN); }
export function expiryMY(iso) {
  const d=new Date(Date.parse(iso)+8*3600000).toISOString();
  return d.slice(8,10)+'-'+d.slice(5,7)+'-'+d.slice(0,4)+' '+d.slice(11,19);
}
