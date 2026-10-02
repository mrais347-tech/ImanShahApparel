import {validSignature,rpc,reconcile,reply} from '../server/store.js';
export default async function handler(req,res) {
  if(req.method!=='POST') return reply(res,405,{error:'Method not allowed'});
  try {
    const b=typeof req.body==='string'?Object.fromEntries(new URLSearchParams(req.body)):req.body;
    if(!b||!validSignature(b,process.env.TOYYIBPAY_SECRET_KEY)) return reply(res,403,{error:'Invalid signature'});
    if(String(b.status)!=='1') return reply(res,200,{received:true});
    const order=await rpc('payment_order',{p_reference:b.order_id});
    if(!order?.bill_code || order.bill_code!==b.billcode) return reply(res,409,{error:'Bill not ready or does not match'});
    // The signed message does not cover amount or billcode. Retrieve payment
    // independently and compare the reference and amount stored by our server.
    if(!await reconcile(order)) return reply(res,503,{error:'Transaction is not available yet. Retry callback.'});
    return reply(res,200,{received:true});
  } catch { return reply(res,503,{error:'Payment verification pending. Retry callback.'}); }
}
