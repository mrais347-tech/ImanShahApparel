const $=s=>document.querySelector(s), rm=n=>'RM '+(n/100).toFixed(2);
const catalogue={'barrel-charcoal':{color:'Black',image:'assets/black-front-20260930.jpg'},'barrel-burgundy':{color:'Maroon',image:'assets/maroon-front-20260930.jpg'},'barrel-slate':{color:'Blue',image:'assets/blue-front-20260930.jpg'}};
let bag=[],live=null,captcha='',widget=null,busy=false,requestId='',submitted=false;
try{bag=JSON.parse(localStorage.getItem('iman-bag')||'[]').filter(i=>catalogue[i.id]&&Number.isInteger(i.qty)&&i.qty>0&&i.qty<=10).slice(0,3)}catch{}
try{requestId=sessionStorage.getItem('iman-order-token')||'';submitted=Boolean(requestId)}catch{}
function tell(s){$('#message').textContent=s}
function render(){
 $('#items').replaceChildren();
 for(const [index,item] of bag.entries()){
  const p=catalogue[item.id],v=live?.variants.find(v=>v.id===item.id),line=document.createElement('article');line.className='line-item';
  line.innerHTML=`<img src="${p.image}" alt="${p.color} trousers"><div><h3>Pelikat-Inspired Trousers</h3><p>${p.color} / Free Size</p><p>${rm((v?.price_sen??8900)*item.qty)}</p><div class="item-controls"><button type="button" data-change="-1" aria-label="Decrease ${p.color} quantity">−</button><span class="count">${item.qty}</span><button type="button" data-change="1" aria-label="Increase ${p.color} quantity">+</button><button type="button" data-change="remove">Remove</button></div></div>`;
  line.querySelectorAll('button').forEach(b=>{b.disabled=busy||submitted;b.onclick=()=>{if(b.dataset.change==='remove')bag.splice(index,1);else{item.qty+=Number(b.dataset.change);if(item.qty<=0)bag.splice(index,1);else item.qty=Math.min(10,item.qty)}localStorage.setItem('iman-bag',JSON.stringify(bag));render()}});
  $('#items').append(line);
 }
 const subtotal=bag.reduce((n,i)=>n+(live?.variants.find(v=>v.id===i.id)?.price_sen??8900)*i.qty,0);
 $('#subtotal').textContent=rm(subtotal);$('#shipping').textContent=live?.shipping_sen==null?'Not set yet':rm(live.shipping_sen);$('#total').textContent=live?.shipping_sen==null?'—':rm(subtotal+live.shipping_sen);
 const available=bag.every(i=>{const v=live?.variants.find(v=>v.id===i.id);return v&&v.available>=i.qty});
 $('#payButton').disabled=busy||!bag.length||!live?.ready||!available||!captcha;
 $('#checkOrder').hidden=!submitted;
 if(!bag.length){$('#items').innerHTML='<p>Your bag is empty. <a href="/#collection">Explore the collection →</a></p>';tell('Add a colour from the collection to get started.')}
 else if(live?.ready&&!available)tell('A colour in your bag is unavailable or exceeds remaining stock. Please adjust your bag.');
}
async function init(){
 render();
 if(!ShopAPI.configured){tell('Checkout is being prepared. Online orders are not open yet.');return}
 try{live=await ShopAPI.rpc('shop_catalog');render();tell(live.ready?'Complete your details to continue.':'Online orders are not open yet. Please check back at the drop.');
  if(ShopAPI.config.turnstileSiteKey){window.onCheckoutCaptcha=()=>{widget=turnstile.render('#captcha',{sitekey:ShopAPI.config.turnstileSiteKey,action:'order',callback:token=>{captcha=token;render()},'expired-callback':()=>{captcha='';render()},'error-callback':()=>{captcha='';render();tell('Verification could not load. Please refresh to try again.')}})};const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onCheckoutCaptcha&render=explicit';s.async=true;s.onerror=()=>tell('Verification could not load. Please refresh to try again.');document.head.append(s)}
  else tell('Checkout is being prepared. Online orders are not open yet.');
 }catch{tell('We could not check stock. Please refresh before placing an order.')}
}
$('#checkoutForm').onsubmit=async e=>{
 e.preventDefault();if($('#payButton').disabled||busy)return;
 busy=true;$('#fields').disabled=true;render();tell('Reserving your items and opening payment…');
 try{
  const customer=Object.fromEntries(new FormData(e.target));
  // Disabled fieldsets are omitted by FormData, so read named controls explicitly.
  for(const name of ['name','email','phone','address','postcode','city','state','country'])customer[name]=e.target.elements.namedItem(name).value.trim();
  if(!requestId){requestId=crypto.randomUUID();sessionStorage.setItem('iman-order-token',requestId)}
  submitted=true;
  const response=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:requestId,customer,items:bag.map(i=>({variant_id:i.id,quantity:i.qty})),captcha})});
  const data=await response.json();if(!response.ok){if(data.reset_request){requestId='';submitted=false;sessionStorage.removeItem('iman-order-token')}throw Error(data.error||'Unable to open payment.');}
  const url=new URL(data.payment_url);if(!['https://toyyibpay.com','https://dev.toyyibpay.com'].includes(url.origin))throw Error('Invalid payment destination');
  const shown=bag.reduce((n,i)=>n+live.variants.find(v=>v.id===i.id).price_sen*i.qty,0)+live.shipping_sen;
  if(shown!==data.total_sen&&!confirm('The current total is '+rm(data.total_sen)+'. Continue to payment at this amount?'))throw Error('Payment paused. Your reservation is saved; check your order or retry to continue.');
  location.assign(url.href);
 }catch(err){tell(err.message);busy=false;$('#fields').disabled=false;captcha='';if(widget!==null)turnstile.reset(widget);render()}
};
init();
