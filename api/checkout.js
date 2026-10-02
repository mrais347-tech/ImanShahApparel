import {sendOrderEmail} from '../server/email.js';
import {createHash} from 'node:crypto';
import {rpc,reply,readBody,sameOrigin,uuid} from '../server/store.js';

export default async function handler(req,res) {
  if(req.method!=='POST') return reply(res,405,{error:'Method not allowed'});
  if(!sameOrigin(req)) return reply(res,403,{error:'Origin not allowed'});
  if(process.env.BANK_CHECKOUT_ENABLED!=='true'||!process.env.BANK_ACCOUNT_NAME||!process.env.BANK_NAME||!process.env.BANK_ACCOUNT_NUMBER)
    return reply(res,503,{error:'Checkout is not open yet. Please check back shortly.'});
  try {
    const b=readBody(req), c=b.customer;
    if(!uuid(b.request_id)||!c||!Array.isArray(b.items)||!b.items.length||b.items.length>3) return reply(res,400,{error:'Please check your bag.'});
    if(!/^\+?[0-9]{8,15}$/.test(c.phone||'') || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(c.email||'') || String(c.email||'').length>254 || c.country!=='MY' || !/^\d{5}$/.test(c.postcode||'') || !String(c.city||'').trim() || !String(c.state||'').trim())
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
    const order=await rpc('bank_checkout',{p_request:b.request_id,p_customer:customer,p_items:b.items.map(i=>({variant_id:i.variant_id,quantity:i.quantity})),p_bank:{name:process.env.BANK_ACCOUNT_NAME,bank:process.env.BANK_NAME,account:process.env.BANK_ACCOUNT_NUMBER}});
    const email=await sendOrderEmail(order.reference,'pending');
    return reply(res,200,{...order,email,order_url:'/order.html'});
  } catch(e) {
    const safe=['Orders are not open','Check your contact and delivery details','Invalid bag','Invalid quantity','Duplicate variant','Variant unavailable','A selected colour no longer has enough stock','Request already used'];
    return reply(res,safe.includes(e.database)?400:503,{error:safe.includes(e.database)?e.database:'Unable to create your order. Check order status before trying again.',reset_request:safe.includes(e.database)&&e.database!=='Request already used'});
  }
}
