import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('public');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
  const name=url.pathname.slice(5);
  if(!['checkout','order-status','payment-callback','report-payment','admin-payment'].includes(name)){res.writeHead(404).end();return}
  let raw='';for await(const part of req){raw+=part;if(raw.length>12000){res.writeHead(413).end();return}}
  try{req.body=req.headers['content-type']?.includes('application/json')?JSON.parse(raw||'{}'):raw;res.status=c=>{res.statusCode=c;return res};res.json=d=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(d))};await(await import('../api/'+name+'.js')).default(req,res)}catch{res.writeHead(500).end()}
  return;
 }
 const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
 try{res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(await readFile(file))}catch{res.writeHead(404).end('Not found')}
}).listen(4173,'0.0.0.0',()=>console.log('Preview on http://localhost:4173'));
