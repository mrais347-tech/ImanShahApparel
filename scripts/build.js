import {mkdir,rm,copyFile,cp,readdir} from 'node:fs/promises';
await rm('public',{recursive:true,force:true});await mkdir('public');
for(const file of await readdir('.')) if(/\.(html|css|woff2)$/.test(file)||['app.js','checkout.js','order.js','admin.js','shop-config.js','shop-api.js'].includes(file)) await copyFile(file,'public/'+file);
await cp('assets','public/assets',{recursive:true});
console.log('Static files built. Server code, migrations, and secrets excluded.');
