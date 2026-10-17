// Real HTTP + configured MySQL. No video requests unless --authorize-title is explicit.
import { config } from 'dotenv';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
config({quiet:true});
await mkdir('tmp',{recursive:true});
const modulePath=resolve('tmp/reelshort-smoke-backend.mjs');
await build({stdin:{contents:'export {miniStore} from "./db/miniseries.ts"; export {MiniService} from "./lib/miniseries/service.ts"; export {MiniTransport} from "./lib/miniseries/transport.ts"; export {config,publicTitle,sourceStatus} from "./lib/miniseries/policy.ts";',resolveDir:process.cwd()},outfile:modulePath,bundle:true,platform:'node',format:'esm',packages:'external'});
const {miniStore,MiniService,MiniTransport,config:settings,publicTitle,sourceStatus}=await import(pathToFileURL(modulePath).href);
const requests=[];const transport=new MiniTransport(miniStore,async(url,init)=>{const r=await fetch(url,init);const u=new URL(url);requests.push({host:u.hostname,path:u.pathname,status:r.status});return r;});
const c=settings();const service=new MiniService(miniStore,c,transport);
const report={checkedAt:new Date().toISOString(),mockResponses:false,origin:'ReelShort',transport:'in-process Node; adapted upstream 95d04d0',requests,operations:{},videoTested:false,browserPlaybackTested:false};
const authorizedTitle=process.argv.find(a=>a.startsWith('--authorize-title='))?.slice('--authorize-title='.length);
try {
  for(const feed of ['newrelease','recommended','dramadub']) report.operations[feed]=await service.refreshExternal('reelshort','reelshort',feed,1);
  const query=authorizedTitle||'Casei-me com o mafioso que salvei';
  const result=await service.reelshort.list('newrelease',query);
  const persisted=await service.ingest(result.titles);
  const title=persisted.find(t=>t.title.toLocaleLowerCase()===query.toLocaleLowerCase());
  report.operations.search={count:result.titles.length,matchedTitle:title?.title,id:title?.refs.find(r=>r.provider==='reelshort')?.id};
  if(title){const ref=title.refs.find(r=>r.provider==='reelshort');const ep=await service.reelshort.episodes(ref);report.operations.episodes={total:ep.length,available:ep.filter(e=>e.available).length,blocked:ep.filter(e=>!e.available).length};
    if(authorizedTitle && process.argv.includes('--player')) {
      const accessible=ep.find(e=>e.available);
      if(!accessible) throw Error('No free accessible episode');
      const temporaryRef={...ref,distributionAuthorization:{reference:'User explicitly authorized a playback test for this exact title in this session',verifiedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString()}};
      // Not persisted as a public distribution grant. No signed URL is written to disk.
      const {verifyPlayer}=await import('./verify-miniseries-player.mjs');
      const qaTitle={...title,refs:title.refs.map(r=>r===ref?temporaryRef:r)};
      const qaStore={...miniStore,title:async id=>id===title.id?qaTitle:miniStore.title(id)};
      const qaService=new MiniService(qaStore,c,transport);
      report.operations.player=await verifyPlayer({
        detail:{title:publicTitle(c,qaTitle),sources:[sourceStatus(c,temporaryRef)]},
        episodes:()=>qaService.episodes(title.id,sourceStatus(c,temporaryRef).key),
        play:async episode=>{
          const media=await qaService.play(title.id,sourceStatus(c,temporaryRef).key,episode,0);
          report.videoTested=true;report.operations.video={episode:accessible.number,format:media.format,host:new URL(media.url).hostname,temporary:true};return media;
        }
      });
      report.browserPlaybackTested=report.operations.player.started&&report.operations.player.continued;
      if(!report.browserPlaybackTested) process.exitCode=1;
    }
  }
  const before=requests.length;
  await service.refreshExternal('reelshort','reelshort','newrelease',1);
  await service.reelshort.list('newrelease',query);
  report.operations.repeatedReads={additionalProviderRequests:requests.length-before};
} catch(e){report.error=e.message;process.exitCode=1;}
await writeFile('docs/reelshort-live-smoke.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
process.exit(process.exitCode||0);
