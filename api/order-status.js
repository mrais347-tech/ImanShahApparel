import {rpc,reconcile,reply,readBody,sameOrigin,uuid} from '../server/store.js';
export default async function handler(req,res) {
  if(req.method!=='POST') return reply(res,405,{error:'Method not allowed'});
  if(!sameOrigin(req)) return reply(res,403,{error:'Origin not allowed'});
  try {
    const b=readBody(req);
    if(!uuid(b.request_id)) return reply(res,400,{error:'Invalid order token'});
    let status=await rpc('checkout_status',{p_request:b.request_id});
    if(!status) return reply(res,404,{error:'No order found yet.'});
    if(status.payment_method==='toyyibpay' && status.bill_code && ['pending','expired'].includes(status.status)) {
      const order=await rpc('payment_order',{p_reference:status.reference});
      try { await reconcile(order); } catch { /* Keep pending; never infer success from a redirect. */ }
      status=await rpc('checkout_status',{p_request:b.request_id});
    }
    delete status.bill_code;
    return reply(res,200,status);
  } catch { return reply(res,503,{error:'Unable to check your order. Please try again shortly.'}); }
}
