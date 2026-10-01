import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import checkout from '../api/checkout.js';
import callback from '../api/payment-callback.js';
import status from '../api/order-status.js';
import adminPayment from '../api/admin-payment.js';
import reportPayment from '../api/report-payment.js';
const res=()=>({code:0,body:null,setHeader(){},status(c){this.code=c;return this},json(b){this.body=b;return this}});
test('checkout fails closed without origin and payment configuration',async()=>{process.env.SHOP_ORIGIN='https://store.example';process.env.PAYMENTS_ENABLED='false';let r=res();await checkout({method:'POST',headers:{origin:'https://other.example'}},r);assert.equal(r.code,403);r=res();await checkout({method:'POST',headers:{origin:'https://store.example'}},r);assert.equal(r.code,503)});
test('unsigned callback cannot reach database',async()=>{const r=res();await callback({method:'POST',body:{status:'1',order_id:'IS-X'}},r);assert.equal(r.code,403)});
test('signed callback verifies provider amount, ignoring callback amount',async()=>{
 process.env.TOYYIBPAY_SECRET_KEY='secret';process.env.TOYYIBPAY_ENV='sandbox';process.env.SUPABASE_SERVICE_ROLE_KEY='test-service';process.env.SUPABASE_URL='https://database.example';
 const original=global.fetch,calls=[];
 global.fetch=async(url,opts)=>{calls.push([url,opts]);if(url.endsWith('/payment_order'))return Response.json({reference:'IS-X',bill_code:'billx',subtotal_sen:8900,shipping_sen:800});if(url.includes('/getBillTransactions'))return Response.json([{billpaymentStatus:'1',billExternalReferenceNo:'IS-X',billpaymentAmount:'97.00',billpaymentInvoiceNo:'invoiceX'}]);if(url.endsWith('/confirm_payment'))return Response.json(null);throw Error('Unexpected endpoint')};
 try{const b={status:'1',order_id:'IS-X',refno:'ref1',billcode:'billx',amount:'0.01'};b.hash=createHash('md5').update('secret1IS-Xref1ok').digest('hex');const r=res();await callback({method:'POST',body:b},r);assert.equal(r.code,200);const confirmed=calls.find(([url])=>url.endsWith('/confirm_payment'));assert.equal(JSON.parse(confirmed[1].body).p_amount,9700)}finally{global.fetch=original}
});
test('redirect status does not confirm an order',async()=>{const r=res();await status({method:'GET',headers:{origin:'https://store.example'},query:{status_id:'1'}},r);assert.equal(r.code,405)});
test('manual admin endpoint rejects unsigned requests',async()=>{const r=res();await adminPayment({method:'POST',headers:{origin:'https://store.example'},body:{}},r);assert.equal(r.code,401)});
test('customer cannot report payment with a guessable order reference',async()=>{const r=res();await reportPayment({method:'POST',headers:{origin:'https://store.example'},body:{request_id:'IS-TEST'}},r);assert.equal(r.code,400)});
test('admin verification uses caller identity, not service-role authorization',async()=>{
 const original=global.fetch,calls=[];delete process.env.EMAIL_ENABLED;
 global.fetch=async(url,opts)=>{calls.push([url,opts]);if(url.endsWith('/admin_confirm_bank_payment'))return Response.json('paid');if(url.endsWith('/admin_email_order'))return Response.json({reference:'IS-X',status:'paid'});throw Error('Unexpected endpoint')};
 try{const r=res();await adminPayment({method:'POST',headers:{origin:'https://store.example',authorization:'Bearer admin-jwt'},body:{action:'confirm',order_id:'11111111-1111-4111-8111-111111111111',bank_reference:'BANK-X',amount_sen:9900}},r);assert.equal(r.code,200);assert.equal(r.body.status,'paid');assert.equal(r.body.email,'not_configured');assert.equal(calls[0][1].headers.Authorization,'Bearer admin-jwt');assert.equal(JSON.parse(calls[0][1].body).p_amount,9900)}finally{global.fetch=original}
});
