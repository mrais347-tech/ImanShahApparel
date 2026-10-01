import {reply,readBody,sameOrigin,uuid} from '../server/store.js';
import {sendOrderEmail} from '../server/email.js';
export default async function handler(req,res) {
 if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'});
 if(!sameOrigin(req))return reply(res,403,{error:'Origin not allowed'});
 const token=req.headers.authorization;
 if(!token?.startsWith('Bearer '))return reply(res,401,{error:'Please sign in again.'});
 try {
  const b=readBody(req);
  if(!uuid(b.order_id)||!['confirm','email'].includes(b.action))return reply(res,400,{error:'Invalid request'});
  // Use the caller's JWT, never service-role privileges, for admin mutations.
  const adminRPC=async(name,args)=>{
   const r=await fetch(process.env.SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:token,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
   const d=await r.json();if(!r.ok)throw Object.assign(Error('Admin request failed'),{status:r.status,database:d.message});return d;
  };
  if(b.action==='confirm')await adminRPC('admin_confirm_bank_payment',{p_id:b.order_id,p_bank_reference:b.bank_reference,p_amount:b.amount_sen});
  const order=await adminRPC('admin_email_order',{p_id:b.order_id});
  const kind=['paid','shipped'].includes(order.status)?'paid':'pending';
  const email=await sendOrderEmail(order.reference,kind);
  return reply(res,200,{status:order.status,email});
 } catch(e) {
  const safe=['Admin access required','Bank transfer order not found','Received amount must match the order total','Enter the bank transaction reference','This order cannot be confirmed','Bank transaction or order already confirmed','Order not found'];
  return reply(res,e.status===401?401:400,{error:safe.includes(e.database)?e.database:'Unable to update the order. Refresh before retrying.'});
 }
}
