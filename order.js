const $=s=>document.querySelector(s);let expiryTimer;let token='';try{token=sessionStorage.getItem('iman-order-token')||''}catch{}
const fragment=location.hash.slice(1);if(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fragment)){token=fragment;try{sessionStorage.setItem('iman-order-token',token)}catch{}history.replaceState(null,'',location.pathname)}
// Redirect query parameters are deliberately ignored: only verified server state counts.
async function refresh(){
 $('#refresh').disabled=true;clearTimeout(expiryTimer);
 try{
  if(!token)throw Error('Open this page in the browser you used for checkout. If that session is gone, contact the store with your order number and bank transfer details.');
  const r=await fetch('/api/order-status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:token})});const d=await r.json();if(!r.ok){if(r.status===404){$('#newBag').hidden=false;$('#newBag').textContent='Return to bag';$('#newBag').onclick=()=>{sessionStorage.removeItem('iman-order-token');location.assign('checkout.html')}}throw Error(d.error);}
  const states={pending:['Your order is reserved.','Transfer the amount below using your order number as the payment reference. Once paid, let us know using the button below.'],paid:['It’s yours.','Payment verified. We’ll prepare your order for delivery.'],shipped:['On its way.','Your order has been shipped.'],expired:['Reservation ended.','This reservation has expired. If you paid, contact the store with your receipt before placing another order.'],cancelled:['Order cancelled.','If you already paid, contact the store so we can check your payment.'],review:['We’re checking your payment.','Your payment was received after the reservation ended. Please contact the store to confirm availability or arrange a refund.']};
  const [heading,message]=states[d.status]||['Checking your order.','Please contact the store for help.'];$('#heading').textContent=heading;$('#status').textContent=message+(d.payment_review?' This order needs a payment review by the store.':'');$('#reference').textContent=d.reference+' · RM '+(d.total_sen/100).toFixed(2);$('#tracking').textContent=d.tracking||'';
  $('#returnCheckout').hidden=true;
  if(d.status==='pending')expiryTimer=setTimeout(refresh,Math.min(2147483647,Math.max(1000,Date.parse(d.expires_at)-Date.now()+500)));
  $('#bankPayment').hidden=!(d.status==='pending'&&d.payment_method==='bank_transfer'&&d.bank_details);
  if(!$('#bankPayment').hidden){
   $('#bankName').textContent=d.bank_details.name;$('#bankBank').textContent=d.bank_details.bank;$('#bankAccount').textContent=d.bank_details.account;$('#bankReference').textContent=d.reference;$('#bankTotal').textContent='RM '+(d.total_sen/100).toFixed(2);$('#deadline').textContent='Please pay before '+new Date(d.expires_at).toLocaleString('en-MY',{timeZone:'Asia/Kuala_Lumpur'})+' (Malaysia time). Do not pay after this reservation expires.';
   $('#reportPayment').disabled=Boolean(d.payment_reported_at);$('#reportPayment').textContent=d.payment_reported_at?'Payment reported':'I’ve made payment';
   if(d.payment_reported_at){$('#heading').textContent='Awaiting payment verification.';$('#status').textContent='Thanks for letting us know. We’ll check the incoming transfer. You do not need to upload a receipt. Check this page for confirmation.'}
  }
  $('#newBag').hidden=!['paid','shipped','cancelled','expired'].includes(d.status);
  if(['paid','shipped'].includes(d.status))localStorage.removeItem('iman-bag');
 }catch(e){$('#heading').textContent='Let’s check your order.';$('#status').textContent=e.message}finally{$('#refresh').disabled=false}
}
$('#refresh').onclick=refresh;$('#newBag').onclick=()=>{sessionStorage.removeItem('iman-order-token');localStorage.removeItem('iman-bag');location.assign('/#collection')};refresh();

for(const [button,value] of [['#copyAccount','#bankAccount'],['#copyReference','#bankReference']])$(button).onclick=async()=>{try{await navigator.clipboard.writeText($(value).textContent);$('#reportMessage').textContent='Copied.'}catch{$('#reportMessage').textContent='Please select and copy the number shown above.'}};
$('#reportPayment').onclick=async()=>{if(!confirm('Have you completed the bank transfer? This notifies the store; payment still needs to be verified.'))return;$('#reportPayment').disabled=true;try{const r=await fetch('/api/report-payment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:token})});const d=await r.json();if(!r.ok)throw Error(d.error);$('#reportMessage').textContent='Payment reported. Please allow the store to verify the transfer.';await refresh()}catch(e){$('#reportMessage').textContent=e.message;$('#reportPayment').disabled=false}};
