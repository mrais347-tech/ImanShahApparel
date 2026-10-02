const ShopAPI = (()=>{
 const c=window.SHOP_CONFIG||{};
 const configured=Boolean(c.supabaseUrl&&c.publishableKey);
 let accessToken='';
 async function request(path,body,auth=false){
  if(!configured)throw Error('The store backend is not connected yet.');
  const headers={'Content-Type':'application/json',apikey:c.publishableKey};
  if(auth){if(!accessToken)throw Error('Please sign in.');headers.Authorization='Bearer '+accessToken;}
  const response=await fetch(c.supabaseUrl+path,{method:'POST',headers,body:JSON.stringify(body),cache:'no-store'});
  const data=await response.json();if(!response.ok)throw Error(data.message||data.error_description||data.error||'Request failed');return data;
 }
 return {configured,config:c,rpc:(name,args={},auth=false)=>request('/rest/v1/rpc/'+name,args,auth),
  async adminPayment(body){if(!accessToken)throw Error('Please sign in.');const r=await fetch('/api/admin-payment',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+accessToken},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d;},
  async login(email,password){const d=await request('/auth/v1/token?grant_type=password',{email,password});accessToken=d.access_token;try{await request('/rest/v1/rpc/admin_dashboard',{},true);}catch(e){accessToken='';throw e;}},
  async logout(){try{if(accessToken)await request('/auth/v1/logout',{},true);}catch{}finally{accessToken='';}}
 };
})();
