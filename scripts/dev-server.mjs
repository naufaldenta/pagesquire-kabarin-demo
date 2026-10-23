import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {newsResponse} from '../server/news.mjs';
import {assistantResponse,createAssistantHost} from '../server/assistant.mjs';
const root=path.resolve(import.meta.dirname,'../dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
export function createPreview({assistant=assistantResponse,news=newsResponse,banner=''}={}){
  return createServer(async(req,res)=>{
    try{
      const origin=`http://${req.headers.host}`;const url=new URL(req.url,origin);const headers=new Headers();
      for(const[key,value]of Object.entries(req.headers))if(typeof value==='string')headers.set(key,value);
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>196608){res.writeHead(413).end();return;}chunks.push(chunk);}
      const request=new Request(url,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})});
      let response;const api=/^\/api\/(news|assistant-(session|chat|reset))(?:\.php)?$/.exec(url.pathname);
      if(api)response=api[1]==='news'?await news(request):await assistant(request,api[2]);
      else{
        const pathname=decodeURIComponent(url.pathname)==='/'?'/index.html':decodeURIComponent(url.pathname);
        const file=path.resolve(root,'.'+pathname);
        if(!file.startsWith(root+path.sep)||pathname.split('/').some(part=>part.startsWith('.'))||!(await stat(file).catch(()=>null))?.isFile()){res.writeHead(404).end('Not found');return;}
        let bytes=await readFile(file);if(banner&&pathname==='/index.html')bytes=Buffer.from(bytes.toString().replace('<body>',`<body><div style="padding:8px;background:#ffe8b7;text-align:center;font:11px Arial">${banner}</div>`));
        response=new Response(bytes,{headers:{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'}});
      }
      res.statusCode=response.status;for(const[key,value]of response.headers)if(key!=='set-cookie')res.setHeader(key,value);
      if(response.headers.getSetCookie().length)res.setHeader('set-cookie',response.headers.getSetCookie());
      res.end(Buffer.from(await response.arrayBuffer()));
    }catch{res.writeHead(503,{'Content-Type':'application/json'}).end('{"error":"PREVIEW_UNAVAILABLE"}');}
  });
}
if(import.meta.url===pathToFileURL(process.argv[1]).href){
  const port=Number(process.env.PORT)||3000;
  // Preview uses its own bound loopback origin, independently of Laragon's http://localhost.
  const assistant=createAssistantHost({env:{...process.env,PAGESQUIRE_ORIGIN:`http://127.0.0.1:${port}`}});
  const server=createPreview({assistant});server.listen(port,'127.0.0.1',()=>console.log(`Local Node preview: http://127.0.0.1:${port}/ (run npm run build after frontend edits)`));
}
