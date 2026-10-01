import {createHash} from 'node:crypto';
import {rpc,provider,providerOrigin,reply,readBody,sameOrigin,uuid,expiryMY} from '../server/store.js';

export default async function handler(req,res) {
  if(req.method!=='POST') return reply(res,405,{error:'Method not allowed'});
  if(!sameOrigin(req)) return reply(res,403,{error:'Origin not allowed'});
  if(process.env.PAYMENTS_ENABLED!=='true' || !process.env.TOYYIBPAY_SECRET_KEY || !process.env.TOYYIBPAY_CATEGORY_CODE)
    return reply(res,503,{error:'Checkout is not open yet. Please check back shortly.'});
  try {
    const b=readBody(req), c=b.customer;
    if(!uuid(b.request_id)||!c||!Array.isArray(b.items)||!b.items.length||b.items.length>3) return reply(res,400,{error:'Please check your bag.'});
    if(!/^\+?[0-9]{8,15}$/.test(c.phone||'') || !/^[^ @]+@[^ @]+\.[^ @]+$/.test(c.email||'') || c.country!=='MY' || !/^\d{5}$/.test(c.postcode||'') || !String(c.city||'').trim() || !String(c.state||'').trim())
      return reply(res,400,{error:'Please check your contact and Malaysian delivery details.'});
    const secret=process.env.TURNSTILE_SECRET_KEY;
    if(!secret) throw Error('Verification not configured');
    const proof=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
      method:'POST',body:new URLSearchParams({secret,response:String(b.captcha||'')}),signal:AbortSignal.timeout(10000)
    }).then(r=>r.json());
    if(!proof.success||proof.hostname!==new URL(process.env.SHOP_ORIGIN).hostname||proof.action!=='order') return reply(res,400,{error:'Please complete verification again.'});
    const bucket=createHash('sha256').update(secret+c.phone.replace(/\D/g,'')).digest('hex');
    if(!await rpc('order_rate_limit',{p_bucket:bucket})) return reply(res,429,{error:'Too many attempts. Please try again in an hour.'});
    const customer={name:c.name,email:c.email,phone:c.phone,address:[c.address,c.postcode,c.city,c.state,'Malaysia'].join(', ')};
    await rpc('place_order',{p_request:b.request_id,p_customer:customer,p_items:b.items.map(i=>({variant_id:i.variant_id,quantity:i.quantity}))});
    const order=await rpc('checkout_claim',{p_request:b.request_id});
    if(order.status!=='pending') return reply(res,409,{error:'This reservation has ended. Check your order status before starting again.'});
    let bill=order.bill_code;
    if(order.claimed) {
      const result=await provider('createBill',{
        userSecretKey:process.env.TOYYIBPAY_SECRET_KEY,categoryCode:process.env.TOYYIBPAY_CATEGORY_CODE,
        billName:'ImanShahApparel',billDescription:'Pelikat Inspired Trousers',billPriceSetting:'1',billPayorInfo:'1',
        billAmount:String(order.subtotal_sen+order.shipping_sen),billReturnUrl:process.env.SHOP_ORIGIN+'/order.html',
        billCallbackUrl:process.env.SHOP_ORIGIN+'/api/payment-callback',billExternalReferenceNo:order.reference,
        billTo:order.customer_name,billEmail:order.email,billPhone:order.phone.replace(/^\+/,''),
        billPaymentChannel:'0',billSplitPayment:'0',billChargeToCustomer:'',billExpiryDate:expiryMY(order.expires_at)
      });
      bill=result[0]?.BillCode;
      if(typeof bill!=='string'||!/^[a-zA-Z0-9]+$/.test(bill)) throw Error('Bill not created');
      await rpc('checkout_attach',{p_request:b.request_id,p_bill:bill});
    }
    if(!bill) return reply(res,409,{error:'Your payment link is being checked. Please keep your order reference and contact the store; do not create another payment.'});
    return reply(res,200,{reference:order.reference,total_sen:order.subtotal_sen+order.shipping_sen,payment_url:providerOrigin()+'/'+bill});
  } catch(e) {
    const safe=['Orders are not open','Check your contact and delivery details','Invalid bag','Invalid quantity','Duplicate variant','Variant unavailable','A selected colour no longer has enough stock','Request already used'];
    return reply(res,safe.includes(e.database)?400:503,{error:safe.includes(e.database)?e.database:'Unable to open payment. Check order status before trying again.',reset_request:safe.includes(e.database)&&e.database!=='Request already used'});
  }
}
