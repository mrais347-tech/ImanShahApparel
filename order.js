const $=s=>document.querySelector(s);let token='';try{token=sessionStorage.getItem('iman-order-token')||''}catch{}
// Redirect query parameters are deliberately ignored: only verified server state counts.
async function refresh(){
 $('#refresh').disabled=true;
 try{
  if(!token)throw Error('Open this page in the browser you used for checkout. If that session is gone, contact the store with your toyyibPay receipt.');
  const r=await fetch('/api/order-status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:token})});const d=await r.json();if(!r.ok){if(r.status===404){$('#newBag').hidden=false;$('#newBag').textContent='Return to bag';$('#newBag').onclick=()=>{sessionStorage.removeItem('iman-order-token');location.assign('checkout.html')}}throw Error(d.error);}
  const states={pending:['Payment pending.','We have not confirmed your payment yet. If you have paid, please wait a moment and check again.'],paid:['It’s yours.','Payment verified. We’ll prepare your order for delivery.'],shipped:['On its way.','Your order has been shipped.'],expired:['Reservation ended.','This reservation has expired. If you paid, contact the store with your receipt before placing another order.'],cancelled:['Order cancelled.','If you already paid, contact the store so we can check your payment.'],review:['We’re checking your payment.','Your payment was received after the reservation ended. Please contact the store to confirm availability or arrange a refund.']};
  const [heading,message]=states[d.status]||['Checking your order.','Please contact the store for help.'];$('#heading').textContent=heading;$('#status').textContent=message+(d.payment_review?' This order needs a payment review by the store.':'');$('#reference').textContent=d.reference+' · RM '+(d.total_sen/100).toFixed(2);$('#tracking').textContent=d.tracking||'';
  $('#returnCheckout').hidden=d.status!=='pending';
  $('#newBag').hidden=!['paid','shipped','cancelled','expired'].includes(d.status);
  if(['paid','shipped'].includes(d.status))localStorage.removeItem('iman-bag');
 }catch(e){$('#heading').textContent='Let’s check your order.';$('#status').textContent=e.message}finally{$('#refresh').disabled=false}
}
$('#refresh').onclick=refresh;$('#newBag').onclick=()=>{sessionStorage.removeItem('iman-order-token');localStorage.removeItem('iman-bag');location.assign('/#collection')};refresh();
