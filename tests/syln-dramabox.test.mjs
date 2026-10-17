import assert from 'node:assert/strict';
import test from 'node:test';
import {Syln,sylnPage,sylnPlatforms,sylnLanguages} from '../lib/miniseries/providers/syln.ts';
import {MiniService} from '../lib/miniseries/service.ts';
import {MiniTransport} from '../lib/miniseries/transport.ts';
import {sourceStatus,publicTitle} from '../lib/miniseries/policy.ts';
import {distributionAuthorized} from '../lib/miniseries/authorization.ts';
import {sylnTitle} from '../lib/miniseries/providers/syln.ts';
import {microTitle} from '../lib/miniseries/providers/microdramalist.ts';
import {MemoryStore,testConfig,sylnFixture,microFixture} from './miniseries-helpers.mjs';

// ALL PAYLOADS IN THIS FILE ARE MOCKS. Live evidence is docs/syln-dramabox-smoke.json.
const pt={...sylnFixture,title:'MOCK título português',lang:'pt'};
const another={...sylnFixture,id:'dramabox:43',title:'MOCK another title'};
const authorization={reference:'MOCK distribution authorization, test only',verifiedAt:'2026-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'};
const page=(rows,query)=>({success:true,...(query.get('platform')?{platform:query.get('platform')}:{}),data:rows,meta:{page:Number(query.get('page')||1),limit:24,count:rows.length}});
function setup({languages=['pt','en'],enabled=true,ptEmpty=false}={}) {
 const store=new MemoryStore();const calls=[];
 const transport=new MiniTransport(store,async(address)=>{
  const url=new URL(address);assert.equal(url.hostname,'api.syln.dev');calls.push(url);
  if(url.pathname==='/v1/platforms')return Response.json({success:true,data:[{platform:'dramabox',enabled,titles:2}]});
  if(url.pathname==='/v1/languages')return Response.json({success:true,platform:'dramabox',data:languages.map(lang=>({lang}))});
  if(url.pathname==='/v1/catalog')return Response.json(page(url.searchParams.get('lang')==='pt'?(ptEmpty?[]:[pt]):[sylnFixture,another],url.searchParams));
  if(url.pathname==='/v1/search')return Response.json(page([pt],url.searchParams));
  if(url.pathname.endsWith('/episodes'))return Response.json({success:true,data:[{ep:1,resolutions:[540,720]},{ep:2,resolutions:[]}]});
  if(url.pathname.endsWith('/play/1'))return Response.json({success:true,data:{ep:1,url:`https://cdn.syln.dev/MOCK.mp4?t=${Math.floor(Date.now()/1000)+120}`,expires_in:120,subtitles:[]}});
  if(decodeURIComponent(url.pathname)==='/v1/titles/dramabox:42')return Response.json({success:true,data:pt});
  throw Error('Unexpected MOCK request');
 });
 return {store,calls,transport,service:new MiniService(store,testConfig(),transport),api:new Syln(transport,'MOCK-TOKEN')};
}

test('Syln DramaBox (MOCK): platform, languages and full IDs have independent validated contracts',()=>{
 assert.deepEqual(sylnPlatforms({success:true,data:[{platform:'dramabox',enabled:true,titles:2}]}),[{platform:'dramabox',enabled:true,titles:2}]);
 assert.deepEqual(sylnLanguages({success:true,platform:'dramabox',data:[{lang:'pt'},{lang:'en'}]},'dramabox'),['pt','en']);
 assert.throws(()=>sylnLanguages({success:true,platform:'other',data:[]},'dramabox'));
 assert.throws(()=>sylnPlatforms({success:true,data:[{platform:'dramabox',enabled:'true'}]}));
 const params=new URLSearchParams({platform:'dramabox',page:'1'});
 assert.equal(sylnPage(page([pt],params),1,24,'dramabox').titles[0].refs[0].id,'dramabox:42');
 assert.throws(()=>sylnPage(page([pt,pt],params),1,24,'dramabox'),/duplicado/);
 assert.throws(()=>sylnPage(page([{...pt,id:'moboreels:42',platform:'moboreels'}],params),1,24,'dramabox'),/plataforma/);
});

test('Syln DramaBox (MOCK): Portuguese preference keeps the unfiltered catalog and caches both pages',async()=>{
 const {api,calls,store}=setup();
 const [a,b]=await Promise.all([api.dramaBoxCatalog(1),api.dramaBoxCatalog(1)]);
 assert.equal(a.baseCount,2);assert.equal(a.preferredCount,1);assert.equal(a.titles[0].languages[0],'pt');assert.equal(b.baseCount,2);
 assert.equal(calls.length,4);assert.equal(calls.filter(u=>u.pathname==='/v1/catalog').length,2);
 for(const request of calls.filter(u=>u.pathname==='/v1/catalog')){assert.equal(request.searchParams.get('platform'),'dramabox');assert.equal(request.searchParams.get('has_media'),'true');assert.equal(request.searchParams.get('content_type'),'short_drama')}
 await new Syln(new MiniTransport(store,async()=>{throw Error('Cached metadata expected')}),'MOCK').dramaBoxCatalog(1);
 assert.equal(calls.length,4);
});

test('Syln DramaBox (MOCK): absent or empty Portuguese response never hides other languages',async()=>{
 for(const options of [{languages:['en']},{ptEmpty:true}]){
  const {api,calls}=setup(options);const result=await api.dramaBoxCatalog(1);
  assert.ok(result.titles.some(t=>t.refs[0].id==='dramabox:43'));assert.equal(result.baseCount,2);
  if(options.languages)assert.equal(calls.filter(u=>u.searchParams.has('lang')).length,0);
 }
});

test('Syln DramaBox (MOCK): disabled platform stops discovery without touching catalog or other suppliers',async()=>{
 const {api,calls}=setup({enabled:false});
 await assert.rejects(api.dramaBoxCatalog(1),/indisponível/);await assert.rejects(api.dramaBoxCatalog(1),/indisponível/);
 assert.equal(calls.length,1);assert.equal(calls[0].pathname,'/v1/platforms');
});

test('Syln DramaBox (MOCK): import deduplicates MicroDramaList and direct SDK references, retains ID and Portuguese',async()=>{
 const {service,store,calls}=setup();
 const [original]=await service.ingest([microTitle(microFixture,true)]);
 const stored=await store.title(original.id);stored.refs.push({provider:'dramabox',id:'42',language:'pt'});await store.save(stored);
 const result=await service.refresh(1,'syln','catalog',undefined,'dramabox');
 assert.equal(result.imported,2);assert.equal((await store.titles()).length,2);
 const merged=await store.title(original.id);assert.equal(merged.id,original.id);assert.equal(merged.title,pt.title);
 assert.ok(merged.refs.some(r=>r.provider==='microdramalist'));assert.ok(merged.refs.some(r=>r.provider==='dramabox'));
 assert.ok(merged.refs.some(r=>r.provider==='syln'&&r.id==='dramabox:42'));
 assert.equal(sourceStatus(service.config,merged.refs.find(r=>r.provider==='dramabox')).available,false);
 const before=calls.length;await service.catalog('',1,undefined,'dramabox');await service.refresh(1,'syln','catalog',undefined,'dramabox');assert.equal(calls.length,before);
 assert.equal((await service.catalog('',1,undefined,'dramabox')).titles[0].title,pt.title);
});

test('Syln DramaBox (MOCK): normalized search shares query cache, preserves supplier relevance and isolates filters',async()=>{
 const {api,service,calls,store}=setup();
 await api.catalog(1);await api.catalog(1,{platform:'dramabox',hasMedia:true});assert.equal(calls.length,2);
 const first=await service.catalog('coração',1,undefined,'dramabox');assert.equal(first.titles.length,1);
 const before=calls.length;const repeated=await service.catalog('CORAÇÃO',1,undefined,'dramabox');assert.equal(repeated.titles[0].id,first.titles[0].id);assert.equal(calls.length,before);
 const search=calls.find(u=>u.pathname==='/v1/search');assert.equal(search.searchParams.get('platform'),'dramabox');assert.equal(search.searchParams.get('q'),'coração');
 assert.ok([...store.cache.keys()].every(k=>/^[\x00-\x7f]+$/.test(k)&&k.length<=190));
});

test('Syln DramaBox (MOCK): detail and lazy episodes preserve the complete provider selector',async()=>{
 const {api,calls}=setup();const ref=sylnTitle(pt).refs[0];
 assert.equal(calls.length,0);const title=await api.detail(ref);assert.equal(title.externalIds['platform:dramabox'],'42');
 assert.equal(decodeURIComponent(calls[0].pathname),'/v1/titles/dramabox:42');assert.equal(calls[0].searchParams.get('lang'),'pt');
 const episodes=await api.episodes(ref);assert.deepEqual(episodes.map(e=>[e.id,e.available,e.resolutions]),[['1',true,[540,720]],['2',false,[]]]);
 assert.ok(!calls.some(u=>u.pathname.includes('/play/')));
});

test('Syln DramaBox distribution (MOCK): no video call without title evidence; expired and malformed evidence fail',async()=>{
 const {api,calls,service}=setup();const ref=sylnTitle(pt).refs[0];
 assert.equal(distributionAuthorized(ref),false);assert.equal(distributionAuthorized({...ref,platform:undefined}),false);
 assert.equal(distributionAuthorized({...ref,distributionAuthorization:{...authorization,expiresAt:'2000-01-01'}}),false);
 assert.equal(distributionAuthorized({...ref,distributionAuthorization:{...authorization,reference:''}}),false);
 await assert.rejects(api.play(ref,'1'),e=>e.status===403);assert.equal(calls.length,0);
 const [title]=await service.ingest([sylnTitle(pt)]);const detail=await service.detail(title.id);
 assert.equal(detail.sources[0].name,'DramaBox via Syln · pt');assert.equal(detail.sources[0].available,false);assert.equal(detail.sources[0].episodesAvailable,true);
 assert.equal(publicTitle(service.config,{...title,refs:[{...ref,distributionAuthorization:authorization}]}).refs[0].distributionAuthorization,undefined);
});

test('Syln DramaBox authorized Play (MOCK): availability, revocation and temporary media remain enforced',async()=>{
 const {service,store,calls}=setup();const [title]=await service.ingest([sylnTitle(pt)]);const key='syln:dramabox:42:pt';
 await service.episodes(title.id,key);assert.ok(!calls.some(u=>u.pathname.includes('/play/')));
 await service.setDistributionAuthorization(title.id,key,authorization);
 const media=await service.play(title.id,key,'1',1);assert.match(media.url,/MOCK\.mp4/);
 assert.equal(calls.filter(u=>u.pathname.includes('/play/')).length,1);
 await assert.rejects(service.play(title.id,key,'2',1),e=>e.status===404);
 await service.refresh(1,'syln','catalog',undefined,'dramabox');assert.equal((await service.detail(title.id)).sources.find(s=>s.key===key).available,true);
 await service.setDistributionAuthorization(title.id,key,undefined);
 const before=calls.length;await assert.rejects(service.play(title.id,key,'1',1),e=>e.status===403);assert.equal(calls.length,before);
 assert.ok(!JSON.stringify([...store.cache]).includes('MOCK.mp4'));
});
