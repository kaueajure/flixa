import test from 'node:test';
import assert from 'node:assert/strict';
import {ReelShort} from '../lib/miniseries/providers/reelshort.ts';
import {projectPlayback} from '../lib/miniseries/providers/external-contract.ts';
import {MiniService} from '../lib/miniseries/service.ts';
import {MiniTransport,providerBudget} from '../lib/miniseries/transport.ts';
import {sourceKey} from '../lib/miniseries/types.ts';
import {sourceStatus} from '../lib/miniseries/policy.ts';
import {MemoryStore,testConfig,sylnFixture} from './miniseries-helpers.mjs';
import {sylnTitle} from '../lib/miniseries/providers/syln.ts';
const book={book_id:'mock_book',book_title:'MOCK Title',book_pic:'https://media.example/mock.jpg',chapter_count:2,paid_start:2,theme:['MOCK Genre']};
const grant={reference:'MOCK rights only',verifiedAt:new Date().toISOString()};
const source={provider:'reelshort',platform:'reelshort',id:'mock_book',slug:'mock-title'};
const home=()=>new Response(`<script id="__NEXT_DATA__">${JSON.stringify({buildId:'MOCK_BUILD',props:{pageProps:{fallback:{'/api/ms/hall/webInfo':{bookShelfList:[{bookshelf_name:'Novo Lançamento',books:[book]},{bookshelf_name:'Mais Recomendado',books:[book]},{bookshelf_name:'Série Dublada',books:[book]}]}}}}})}</script>`,{headers:{'content-type':'text/html'}});

test('ReelShort MOCK: native backend has no Express; one homepage for three feeds, normalized persistent cache',async()=>{
 const store=new MemoryStore();let calls=0;const fetcher=async(url)=>{calls++;assert.equal(url,'https://www.reelshort.com/pt');return home();};
 const a=new ReelShort(new MiniTransport(store,fetcher));for(const feed of ['newrelease','recommended','dramadub'])assert.equal((await a.list(feed)).titles[0].refs[0].slug,'mock-title');
 const b=new ReelShort(new MiniTransport(store,fetcher));await b.list('newrelease');assert.equal(calls,1);assert.deepEqual((await b.list('newrelease')).titles[0].genres,['MOCK Genre']);
});
test('ReelShort MOCK: chapter IDs preserved, trailer omitted, paid episodes blocked; no video while browsing',async()=>{
 const store=new MemoryStore();const calls=[];const a=new ReelShort(new MiniTransport(store,async(url)=>{calls.push(url);if(url.endsWith('/pt'))return home();return Response.json({pageProps:{data:{book_id:'mock_book',paid_start:2,online_base:[{serial_number:0,chapter_type:2,chapter_id:'trailer'},{serial_number:1,chapter_id:'free',status:1},{serial_number:2,chapter_id:'paid',status:1}]}}});}));
 const episodes=await a.episodes(source);assert.deepEqual(episodes.map(e=>[e.number,e.id,e.available]),[[1,'free',true],[2,'paid',false]]);
 const mapped=await a.episodes({...source,episodeMap:{first:'free'}});assert.equal(mapped[0].key,'first');assert.equal(calls.length,2);assert.ok(calls.every(u=>!u.includes('/episodes/')));
 await assert.rejects(a.play({...source,distributionAuthorization:grant},'paid'),/bloqueado/);await assert.rejects(a.play(source,'free'),/Autorização/);assert.equal(calls.length,2);
});
test('ReelShort MOCK: explicit authorized free Play uses exact book/slug/chapter; media never cached',async()=>{
 const store=new MemoryStore();const calls=[];const a=new ReelShort(new MiniTransport(store,async(url)=>{calls.push(url);if(url.endsWith('/pt'))return home();if(url.includes('/movie/'))return Response.json({pageProps:{data:{paid_start:2,online_base:[{serial_number:1,chapter_id:'c1',status:1}]}}});assert.ok(url.includes('episode-1-mock-title-mock_book-c1.json'));return Response.json({pageProps:{data:{serial_number:1,chapter_id:'c1',video_url:'https://media.example/MOCK.m3u8'}}});}));
 const media=await a.play({...source,distributionAuthorization:grant},'c1');assert.equal(media.format,'hls');assert.ok(media.expiresAt>Date.now());assert.ok(!JSON.stringify([...store.cache]).includes('MOCK.m3u8'));assert.equal(calls.length,3);
});
test('external playback MOCK: MP4/HLS qualities, subtitles, signatures, locked and unsafe URLs fail closed',()=>{
 const r={videoUrl:'https://media.example/mock.mp4',locked:false,qualityList:[{quality:'720p',url:'https://media.example/720.mp4'}],subtitles:[{lang:'pt',url:'https://media.example/pt.vtt'}]};const p=projectPlayback(r,source);assert.equal(p.qualities[0].label,'720p');assert.equal(p.subtitles[0].lang,'pt');assert.equal(p.format,'mp4');
 for(const v of [{...r,locked:true},{...r,videoUrl:'http://media.example/x'},{...r,videoUrl:'https://127.0.0.1/x'},{...r,videoUrl:'https://media.example/x?unknown=signature'},{...r,expires_at:1}])assert.throws(()=>projectPlayback(v,source));
});
test('ReelShort MOCK: deduplication keeps native identity and per-source grants remain revocable',async()=>{
 const store=new MemoryStore();const c=testConfig();c.enabled.reelshort=true;c.playback.reelshort=true;const service=new MiniService(store,c,new MiniTransport(store,async()=>home()));
 const [old]=await service.ingest([sylnTitle({...sylnFixture,id:'reelshort:mock_book',platform:'reelshort'})]);await service.refreshExternal('reelshort','reelshort','newrelease',1);assert.equal((await store.titles()).length,1);const t=await store.title(old.id);const ref=t.refs.find(r=>r.provider==='reelshort');assert.equal(sourceStatus(c,ref).available,false);
 await service.setDistributionAuthorization(old.id,sourceKey(ref),grant);assert.equal(sourceStatus(c,(await store.title(old.id)).refs.find(r=>r.provider==='reelshort')).available,true);
 await service.setDistributionAuthorization(old.id,sourceKey(ref),undefined);assert.equal(sourceStatus(c,(await store.title(old.id)).refs.find(r=>r.provider==='reelshort')).available,false);
 assert.equal(providerBudget('reelshort').limit,10);
});
test('ReelShort MOCK: 429 and unknown bootstrap contracts never become fake empty catalogs',async()=>{
 const limited=new ReelShort(new MiniTransport(new MemoryStore(),async()=>new Response('',{status:429,headers:{'Retry-After':'120'}})));await assert.rejects(limited.list('newrelease'),e=>e.status===429);
 await assert.rejects(new ReelShort(new MiniTransport(new MemoryStore(),async()=>new Response('HTML changed'))).list('newrelease'),/NEXT_DATA/);
});
test('ReelShort search MOCK: persistent relevance index retains related results without provider fan-out',async()=>{
 const store=new MemoryStore();const c=testConfig();c.enabled.reelshort=true;let calls=0;
 const fetcher=async(url)=>{calls++;assert.ok(url.startsWith('https://www.reelshort.com/'));if(url.endsWith('/pt'))return home();assert.ok(url.includes('/search.json?'));return Response.json({pageProps:{books:[{book_id:'one',book_title:'Keyword exact'},{book_id:'two',book_title:'Related result'}]}});};
 const a=new MiniService(store,c,new MiniTransport(store,fetcher));assert.equal((await a.externalCatalog('reelshort','reelshort','Keyword',1)).titles.length,2);
 const b=new MiniService(store,c,new MiniTransport(store,fetcher));assert.equal((await b.externalCatalog('reelshort','reelshort','KEYWORD',1)).titles.length,2);assert.equal(calls,2);
});
