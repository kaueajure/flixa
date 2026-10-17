// Opt-in local QA only. Uses the actual shared React player and real media in memory.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export async function verifyPlayer({ detail, episodes, play }) {
  const result=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Episodes from './app/miniseries-episodes.tsx';fetch('/detail').then(r=>r.json()).then(detail=>createRoot(document.getElementById('root')).render(React.createElement(Episodes,{detail})));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
  const bundle=result.outputFiles[0].contents;
  let playRequests = 0;
  const server=createServer(async(req,res)=>{
    try {
      res.setHeader('Cache-Control','no-store');
      if(req.url==='/bundle.js'){res.setHeader('Content-Type','application/javascript');res.end(bundle);}
      else if(req.url==='/detail'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(detail));}
      else if(req.url?.startsWith('/api/miniseries/episodes?')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({episodes:await episodes()}));}
      else if(req.url==='/api/miniseries/play'&&req.method==='POST'){
        let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)throw Error('QA body too large');}
        const input=JSON.parse(body);if(input.id!==detail.title.id||!detail.sources.some(s=>s.key===input.source))throw Error('QA source mismatch');
        playRequests++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await play(input.episode)));
      }
      else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body><div id="root"></div><script src="/bundle.js"></script></body></html>');}
    } catch {res.statusCode=502;res.end(JSON.stringify({error:'Real media unavailable during QA'}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const profile=await mkdtemp(join(tmpdir(),'flixa-video-qa-'));let socket;let chrome;
  try {
    chrome=spawn('google-chrome',['--headless=new','--no-first-run','--disable-gpu','--autoplay-policy=no-user-gesture-required','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
    const address=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('Chrome startup timeout')),15000);chrome.once('error',reject);chrome.stderr.on('data',d=>{text+=d;const m=text.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});chrome.once('exit',code=>{clearTimeout(timer);reject(Error(`Chrome exited ${code}`));});});
    socket=new WebSocket(address);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    let serial=0;const pending=new Map();socket.addEventListener('message',e=>{const data=JSON.parse(e.data);const p=pending.get(data.id);if(p){pending.delete(data.id);if(data.error)p.reject(Error(data.error.message));else p.resolve(data.result);}});
    const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,sessionId}));});
    const {targetId}=await send('Target.createTarget',{url:`http://127.0.0.1:${server.address().port}`});
    const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
    const evaluate=async(expression)=>(await send('Runtime.evaluate',{expression,returnByValue:true},sessionId)).result.value;
    const waitFor=async(expression)=>{const deadline=Date.now()+15000;while(Date.now()<deadline){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,250));}throw Error('Episode selection UI timeout');};
    await waitFor('!!Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes("Ver episódios"))');
    const noPrefetch=playRequests===0;
    await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes("Ver episódios")).click()');
    await waitFor('!!document.querySelector(".mini-episode-grid button:not(:disabled)")');
    await evaluate('document.querySelector(".mini-episode-grid button:not(:disabled)").click()');
    await waitFor('!!Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes("Iniciar episódio")&&!b.disabled)');
    await evaluate('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes("Iniciar episódio")&&!b.disabled).click()');
    const sample=async()=>{const r=await send('Runtime.evaluate',{expression:'JSON.stringify({video:!!document.querySelector("video"),time:document.querySelector("video")?.currentTime||0,ready:document.querySelector("video")?.readyState||0,paused:document.querySelector("video")?.paused,network:document.querySelector("video")?.networkState,error:document.querySelector("video")?.error?.code||null,notice:document.querySelector("[role=alert]")?.textContent||null,qualityOptions:Array.from(document.querySelectorAll("select")).flatMap(s=>Array.from(s.options).map(o=>o.textContent)),width:document.querySelector("video")?.videoWidth,height:document.querySelector("video")?.videoHeight})',returnByValue:true},sessionId);return JSON.parse(r.result.value);};
    const startedAt=Date.now();let first;let last;
    while(Date.now()-startedAt<30000){await new Promise(r=>setTimeout(r,1000));last=await sample();if(last.error||last.notice)break;if(last.time>1&&!first)first=last;if(first&&last.time>=first.time+5)break;}
    return {browser:'Chrome headless',sharedPlayer:true,scope:"existing episode selector and player, real adapter, local QA harness; no authenticated Flixa session",noPlaybackPrefetch:noPrefetch,playRequests,started:!!first,continued:!!first&&last.time>=first.time+5,firstTime:first?.time??0,lastTime:last?.time??0,readyState:last?.ready,qualityOptions:last?.qualityOptions||[],videoWidth:last?.width,videoHeight:last?.height,mediaError:last?.error,notice:last?.notice};
  } finally {socket?.close();chrome?.kill('SIGTERM');server.closeAllConnections();await new Promise(r=>server.close(r));await new Promise(r=>setTimeout(r,500));await rm(profile,{recursive:true,force:true,maxRetries:3});}
}
