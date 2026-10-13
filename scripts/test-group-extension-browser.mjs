/** Real-media smoke test of the distributable extension. Chrome must use a temporary profile on port 9228. */
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
const port = Number(process.env.FLIXA_EXTENSION_TEST_PORT || 9228);
const source = process.env.FLIXA_EXTENSION_TEST_SOURCE || "https://cinesrc.st/embed/movie/550";
const providerId = process.env.FLIXA_EXTENSION_TEST_PROVIDER || "cinesrc";
const sleep = ms => new Promise(r => setTimeout(r, ms));
class CDP {
  async open(url) { this.socket = new WebSocket(url); this.seq = 0; this.pending = new Map(); this.handlers = []; await new Promise(r => this.socket.addEventListener("open", r, { once:true })); this.socket.addEventListener("message", e => { const m=JSON.parse(e.data); if(m.id){const p=this.pending.get(m.id);if(p){clearTimeout(p.timer);this.pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result)}} else for(const fn of this.handlers)fn(m); }); return this; }
  call(method,params={},sessionId){const id=++this.seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(method+" timed out")),15000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params,...sessionId?{sessionId}:{}}));});}
  async eval(expression,sessionId,userGesture=false){const r=await this.call("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true,userGesture},sessionId);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
}
const info=await(await fetch(`http://127.0.0.1:${port}/json/version`)).json();
const browser=await new CDP().open(info.webSocketDebuggerUrl);
const existing=(await browser.call("Extensions.getExtensions")).extensions.find(e=>e.path===resolve("extension/flixa-group"));
if(existing)await browser.call("Extensions.uninstall",{id:existing.id});
const {id}=await browser.call("Extensions.loadUnpacked",{path:resolve("extension/flixa-group")});
console.log("Production extension installed",id);
const pages=[];
const wrapper=`<!doctype html><html lang="pt-BR"><body style="margin:0;background:#111;color:white"><h1 style="font:16px system-ui;height:30px;margin:0">Flixa extension test wrapper — real provider video</h1><iframe data-flixa-group-player src="${source}" style="width:100vw;height:calc(100vh - 30px);border:0" sandbox="allow-scripts allow-same-origin allow-presentation allow-orientation-lock" allow="autoplay *; fullscreen *; encrypted-media *" referrerpolicy="no-referrer"></iframe><script>window.events=[];window.channel='test-'+Math.random().toString(36).slice(2);window.request=(action,args={})=>new Promise(resolve=>{const requestId=Math.random().toString(36);const timer=setTimeout(()=>{removeEventListener('message',listener);resolve({error:'timeout'})},10000);function listener(e){if(e.source===window&&e.data?.type==='flixa-group:extension'&&e.data.kind==='response'&&e.data.requestId===requestId){clearTimeout(timer);removeEventListener('message',listener);resolve(e.data)}}addEventListener('message',listener);postMessage({type:'flixa-group:site',channel,requestId,action,...args},location.origin)});addEventListener('message',e=>{if(e.source===window&&e.data?.type==='flixa-group:extension'&&e.data.channel===channel){events.push({...e.data,receivedAt:Date.now()});if(events.length>100)events.shift()}})</script></body></html>`;
async function create(index){
 const {targetId}=await browser.call("Target.createTarget",{url:"about:blank"});const page=await new CDP().open(`ws://127.0.0.1:${port}/devtools/page/${targetId}`);pages.push({page,targetId});
 await page.call("Page.enable");await page.call("Emulation.setDeviceMetricsOverride",{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await page.call("Fetch.enable",{patterns:[{urlPattern:`https://cinesrc.st/flixa-extension-test-${index}`,requestStage:"Request"}]});
 page.handlers.push(m=>{if(m.method==="Fetch.requestPaused")void page.call("Fetch.fulfillRequest",{requestId:m.params.requestId,responseCode:200,responseHeaders:[{name:"Content-Type",value:"text/html"}],body:Buffer.from(wrapper).toString("base64")});});
 await page.call("Page.navigate",{url:`https://cinesrc.st/flixa-extension-test-${index}`});await sleep(1200);return {page,targetId};
}
async function activate(targetId){
 await browser.call("Target.activateTarget",{targetId});
 const pageInfo=(await browser.call("Target.getTargetInfo",{targetId})).targetInfo;
 const tabs=(await browser.call("Target.getTargets",{filter:[{type:"tab"}]})).targetInfos;
 const tabTarget=tabs.find(t=>t.url===pageInfo.url);
 if(!tabTarget)throw Error("Chrome tab target was not found");
 await browser.call("Extensions.triggerAction",{id,targetId:tabTarget.targetId});await sleep(800);
 const popup=(await browser.call("Target.getTargets")).targetInfos.find(t=>t.url===`chrome-extension://${id}/popup.html`);
 if(!popup)throw Error("Popup did not open");const session=(await browser.call("Target.attachToTarget",{targetId:popup.targetId,flatten:true})).sessionId;
 await browser.eval("document.getElementById('activate').click()",session,true);await sleep(1200);
 const error=await browser.eval("document.getElementById('error').textContent",session);if(error)throw Error(error);
 return {targetId:popup.targetId,session};
}
try{
 const host=await create(1);const popup=await activate(host.targetId);await browser.call("Target.closeTarget",{targetId:popup.targetId});
 const guest=await create(2);
 for(const [actor,role] of [[host,"host"],[guest,"guest"]]){
  const result=await actor.page.eval(`request('bind',${JSON.stringify({sourceUrl:source,providerId,role,roomCode:"ABC234"})})`);if(result.error)throw Error(result.error);
 }
 const latest=async actor=>actor.page.eval("events.filter(e=>e.kind==='playback').at(-1)");
 for(let tries=0;tries<65;tries++){if((await latest(host))?.playback?.ready>=2&&(await latest(guest))?.playback?.ready>=2)break;await sleep(1000);}
 const initialHost=await latest(host),initialGuest=await latest(guest);
 if(!initialHost||!initialGuest)throw Error("Two real videos did not become available");
 if(Math.abs(initialHost.playback.duration-initialGuest.playback.duration)>5)throw Error("Media versions differ; cannot synchronize");
 // Do not mute or extract media. The provider must allow playback after ordinary interaction.
 for(const actor of [host,guest]){
  await actor.page.call("Input.dispatchMouseEvent",{type:"mousePressed",x:640,y:410,button:"left",clickCount:1});
  await actor.page.call("Input.dispatchMouseEvent",{type:"mouseReleased",x:640,y:410,button:"left",clickCount:1});
 }
 const evidence={providerId,source,browser:info.Browser,extensionVersion:"1.0.0",realMedia:true,roomTransport:"Local test relay, not Ably",initialHost,initialGuest,steps:[]};
 for(const [command,time] of [["pause"],["seek",20],["play"]]){
  const responses=await Promise.all([host,guest].map(actor=>actor.page.eval(`request('command',${JSON.stringify({command,time})})`)));
  if(responses.some(r=>r.error))throw Error(JSON.stringify(responses));await sleep(command==="play"?4500:2500);
  const states=await Promise.all([latest(host),latest(guest)]);evidence.steps.push({command,time,responses,host:states[0].playback,guest:states[1].playback});
  if(command==="pause"&&states.some(s=>!s.playback.paused))throw Error("Pause was not observed");
  if(command==="seek"&&states.some(s=>Math.abs(s.playback.currentTime-time)>1))throw Error("Seek was not observed");
  if(command==="play"&&states.some(s=>s.playback.paused||s.playback.currentTime<=20.2))throw Error("Real playback did not advance");
 }
 // Actual guest popup must be prevented from issuing host controls.
 await writeFile(process.env.FLIXA_EXTENSION_TEST_OUTPUT||"/tmp/flixa-group-real-browser.json",JSON.stringify(evidence,null,2));
 const saved=(await host.page.call("Extensions.getStorageItems",{id,storageArea:"session",keys:["sessions"]})).data;
 const guestChannel=await guest.page.eval("channel");
 const guestTabId=Number(Object.entries(saved.sessions).find(([,s])=>s.channel===guestChannel)[0]);
 const guestPopup=await activate(guest.targetId);
 const denial=await browser.eval(`chrome.runtime.sendMessage({type:'FLIXA_GROUP_POPUP',action:'control',tabId:${guestTabId},command:'pause'})`,guestPopup.session,true);
 if(!denial.error?.includes("anfitrião"))throw Error("Guest popup was not restricted");evidence.guestControlDenied=denial.error;
 await writeFile(process.env.FLIXA_EXTENSION_TEST_OUTPUT||"/tmp/flixa-group-real-browser.json",JSON.stringify(evidence,null,2));console.log("PASS: two real videos, pause/seek/play, guest controls denied. Local relay; Ably not verified.");
}catch(error){
 console.error(error); process.exitCode=1;
 for (const {page} of pages) {
  console.log("DIAG SITE",await page.eval("({events:events.slice(-3),iframe:document.querySelector('iframe').src})").catch(()=>null));
  const tree=(await page.call("Page.getFrameTree")).frameTree;
  const visit=async f=>{try{const world=await page.call("Page.createIsolatedWorld",{frameId:f.frame.id,worldName:"flixa-readonly-check"});const r=await page.call("Runtime.evaluate",{contextId:world.executionContextId,expression:"({url:location.origin,title:document.title,text:document.body?.innerText?.slice(0,300),videos:[...document.querySelectorAll('video')].map(v=>({ready:v.readyState,duration:Number.isFinite(v.duration)?v.duration:null,paused:v.paused,error:v.error?.code}))})",returnByValue:true});console.log("DIAG FRAME",r.result.value)}catch{} for(const c of f.childFrames||[])await visit(c);};await visit(tree);
 }
 const worker=(await browser.call("Target.getTargets")).targetInfos.find(t=>t.type==="service_worker"&&t.url.includes(id));if(worker){const session=(await browser.call("Target.attachToTarget",{targetId:worker.targetId,flatten:true})).sessionId;console.log("DIAG BINDINGS",await browser.eval("chrome.storage.session.get('sessions')",session));}
}
finally{for(const {targetId,page} of pages){await browser.call("Target.closeTarget",{targetId}).catch(()=>{});page.socket.close();}browser.socket.close();}
