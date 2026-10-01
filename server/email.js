import nodemailer from 'nodemailer';
import {rpc} from './store.js';
export const SUPPORT_EMAIL='imanshahapparel@gmail.com';
export function emailText(order,origin) {
 const total='RM '+((order.subtotal_sen+order.shipping_sen)/100).toFixed(2);
 const paid=order.kind==='paid';
 const lines=[`Hi ${order.customer_name},`,'',paid?'Your payment has been verified. We’ll prepare your order for delivery.':'Your order is received and reserved. Payment is still pending.',`Order: ${order.reference}`,...(order.items||[]).map(i=>`${i.color} / ${i.size} × ${i.quantity}`),`Total: ${total} (including delivery)`];
 if(!paid) lines.push('',`Please transfer ${total} to:`,order.bank_details.bank,`Account name: ${order.bank_details.name}`,`Account number: ${order.bank_details.account}`,`Transfer reference: ${order.reference}`,`Pay before: ${new Date(order.expires_at).toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'})} (Malaysia time). Do not pay after the reservation expires.`,'After paying, open your order page and click “I’ve made payment”. No receipt upload is required.');
 lines.push('','Your private order link (do not share):',origin+'/order.html#'+order.request_id,'',`Questions? Reply to this email or contact ${SUPPORT_EMAIL}.`,'Iman Shah Apparel');
 return {subject:`${paid?'Payment confirmed':'Order received — payment pending'} · ${order.reference}`,text:lines.join('\n')};
}
export async function sendOrderEmail(reference,kind) {
 if(process.env.EMAIL_ENABLED!=='true'||!process.env.GMAIL_APP_PASSWORD) return 'not_configured';
 let job;
 try {
  job=await rpc('claim_order_email',{p_reference:reference,p_kind:kind});
  if(!job)return 'already_sent_or_not_ready';
  const transport=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:SUPPORT_EMAIL,pass:process.env.GMAIL_APP_PASSWORD},connectionTimeout:8000,greetingTimeout:8000,socketTimeout:10000});
  const message=emailText(job,process.env.SHOP_ORIGIN);
  const info=await transport.sendMail({from:{name:'Iman Shah Apparel',address:SUPPORT_EMAIL},replyTo:SUPPORT_EMAIL,to:job.email,messageId:`<${job.id}.${kind}@imanshahapparel.local>`,...message});
  if(!info.accepted?.length)throw Error('Email not accepted');
  await rpc('finish_order_email',{p_claim:job.claim,p_sent:true});
  return 'sent';
 } catch {
  if(job)try{await rpc('finish_order_email',{p_claim:job.claim,p_sent:false})}catch{}
  // The order remains successful even when email fails. Admin can retry.
  return 'failed';
 }
}
