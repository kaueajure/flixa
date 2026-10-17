// Real authenticated metadata probes. Never prints a token or signed media URL.
import {config as loadEnv} from 'dotenv';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
loadEnv({path:'.env.local',quiet:true});loadEnv({path:'.env',quiet:true});
await mkdir('tmp',{recursive:true});
const entry=resolve('tmp/syln-dramabox-smoke-runtime.mjs');
await build({stdin:{contents:'export {miniStore} from "./db/miniseries.ts";export {MiniTransport} from "./lib/miniseries/transport.ts";export {MiniService} from "./lib/miniseries/service.ts";export {config} from "./lib/miniseries/policy.ts";export {sylnPlatforms,sylnLanguages,sylnPage,sylnCacheKey} from "./lib/miniseries/providers/syln.ts";',resolveDir:process.cwd()},outfile:entry,bundle:true,format:'esm',platform:'node',packages:'external'});
const {miniStore,MiniTransport,MiniService,config,sylnPlatforms,sylnLanguages,sylnPage,sylnCacheKey}=await import(pathToFileURL(entry).href);
const requests=[];
const transport=new MiniTransport(miniStore,async(address,init)=>{
 const url=new URL(address);
 if(url.hostname!=='api.syln.dev'||url.pathname.includes('/play/'))throw Error('Metadata smoke cannot contact another provider or request playback');
 const item={path:url.pathname,query:url.searchParams.toString(),status:0};requests.push(item);
 const response=await fetch(address,init);item.status=response.status;return response;
});
const c=config();const service=new MiniService(miniStore,c,transport);
const report={checkedAt:new Date().toISOString(),supplier:'syln',origin:'dramabox',mockResponses:false,directSdkEnabled:c.enabled.dramabox,directSdkExecuted:false,playbackTested:false,requests,operations:{}};
let code=0;
try {
 // Reuse the earlier real discovery responses without paying for identical calls.
 const seeds=[['platforms','syln:v3:platforms',sylnPlatforms],['languages','syln:v3:languages:dramabox',v=>sylnLanguages(v,'dramabox')],['catalog',await sylnCacheKey('catalog',new URLSearchParams({platform:'dramabox',content_type:'short_drama',has_media:'true',page:'1',limit:'24'})),v=>sylnPage(v,1,24,'dramabox')]];
 for(const [name,key,normalize] of seeds){
  const existing=await miniStore.get(key);const raw=await miniStore.get(`syln:discovery:v1:${name}`);
  if((!existing||existing.expiresAt<=Date.now())&&raw&&raw.expiresAt>Date.now())await miniStore.put(key,normalize(raw.value),raw.expiresAt-Date.now());
 }
 const platforms=await service.syln.platforms();const platform=platforms.find(p=>p.platform==='dramabox');
 report.operations.platforms={dramabox:platform||null};
 const languages=await service.syln.languages('dramabox');report.operations.languages={available:languages,portugueseAvailable:languages.some(l=>/^pt(?:-|$)/.test(l))};
 const refresh=await service.refresh(1,'syln','catalog',undefined,'dramabox');report.operations.catalog=refresh;
 const catalog=await service.catalog('',1,undefined,'dramabox');
 report.operations.localCatalog={countOnFirstPage:catalog.titles.length,hasMore:catalog.hasMore,firstLanguages:catalog.titles.slice(0,5).map(t=>t.languages)};
 const first=catalog.titles[0];if(!first)throw Error('No real DramaBox ID returned');
 const ref=first.refs.find(r=>r.provider==='syln'&&r.id.startsWith('dramabox:'));
 if(!ref)throw Error('No matching Syln source');
 const detail=await service.syln.detail(ref);await service.ingest([detail]);
 report.operations.details={id:ref.id,title:detail.title,language:ref.language,episodeCount:detail.episodeCount,posterPresent:!!detail.poster,synopsisPresent:!!detail.synopsis};
 const episodes=await service.syln.episodes(ref);
 report.operations.episodes={id:ref.id,total:episodes.length,withMedia:episodes.filter(e=>e.available).length,withoutMedia:episodes.filter(e=>!e.available).length,availableEpisodeNumbers:episodes.filter(e=>e.available).map(e=>e.number),unavailableEpisodeNumbers:episodes.filter(e=>!e.available).map(e=>e.number),resolutions:[...new Set(episodes.flatMap(e=>e.resolutions||[]))]};
 const query=detail.title.slice(0,100);
 const search=await service.searchSylnDramaBox(query,1);
 report.operations.search={query,count:search.titles.length,containsKnownId:search.titles.some(t=>t.refs.some(r=>r.provider==='syln'&&r.id===ref.id))};
 const publicDetail=await service.detail(first.id);
 report.operations.sources={labels:publicDetail.sources.map(s=>s.name),episodesBrowsable:publicDetail.sources.some(s=>s.episodesAvailable),publicPlaybackAuthorized:publicDetail.sources.some(s=>s.available),signedUrlsRequested:requests.some(r=>r.path.includes('/play/'))};
 const before=requests.length;const repeated=new MiniService(miniStore,config(),transport);
 await repeated.refresh(1,'syln','catalog',undefined,'dramabox');await repeated.catalog('',1,undefined,'dramabox');await repeated.syln.episodes(ref);await repeated.searchSylnDramaBox(query,1);
 report.operations.repeatedReads={additionalProviderRequests:requests.length-before};
 report.sampleTitles=catalog.titles.slice(0,5).map(t=>({id:t.refs.find(r=>r.provider==='syln'&&r.id.startsWith('dramabox:'))?.id,title:t.title,languages:t.languages}));
} catch(error){code=1;report.error={status:error.status||503,message:error.status?error.message:'Storage or normalization failure',code:error.cause?.code||error.code||null};}
await writeFile('docs/syln-dramabox-smoke.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));process.exit(code);
