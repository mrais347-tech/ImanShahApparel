import {rpc,reply,readBody,sameOrigin,uuid} from '../server/store.js';
export default async function handler(req,res) {
 if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'});
 if(!sameOrigin(req))return reply(res,403,{error:'Origin not allowed'});
 try {
  const body=readBody(req);
  if(!uuid(body.request_id))return reply(res,400,{error:'Invalid order token'});
  await rpc('report_bank_payment',{p_request:body.request_id});
  return reply(res,200,{reported:true});
 } catch(e) {
  const safe=['Order not found','Reservation is no longer pending'];
  return reply(res,safe.includes(e.database)?409:503,{error:safe.includes(e.database)?e.database:'Unable to notify the store. Please try again.'});
 }
}
