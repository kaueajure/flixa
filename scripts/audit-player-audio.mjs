import { PLAYER_SERVERS } from "../lib/player-servers.ts";
import { testPlayerSource } from "../lib/player-server-health.ts";

const concurrency = Math.max(1, Math.min(6, Number(process.env.FLIXA_AUDIT_CONCURRENCY || 4)));
const jobs = PLAYER_SERVERS.flatMap((server) => server.audioTestUrls.map((sample) => ({ server, sample })));
const results = new Array(jobs.length);
let cursor = 0;

async function worker() {
  while (cursor < jobs.length) {
    const index = cursor++;
    const { server, sample } = jobs[index];
    const check = await testPlayerSource(server, "movie", sample.url);
    const hasPortuguese = check.evidence.mediaProbe?.hasPortugueseAudio;
    const audio = hasPortuguese === true ? "confirmed" : hasPortuguese === false ? "not-detected" : "unverified";
    results[index] = {
      provider: server.id,
      title: sample.title,
      tmdbId: sample.tmdbId,
      status: check.status,
      audio,
      httpStatus: check.httpStatus,
      message: check.message,
      languages: check.evidence.mediaProbe?.audioLanguages ?? [],
    };
    process.stderr.write(`${String(index + 1).padStart(2, "0")}/${jobs.length} ${server.id} · ${sample.title}: ${check.status}, ${audio}\n`);
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));

const providers = PLAYER_SERVERS.map((server) => {
  const samples = results.filter((result) => result.provider === server.id);
  return {
    id: server.id,
    name: server.name,
    playable: samples.filter((sample) => sample.status !== "offline").length,
    portugueseConfirmed: samples.filter((sample) => sample.audio === "confirmed").length,
    portugueseNotDetected: samples.filter((sample) => sample.audio === "not-detected").length,
    portugueseUnverified: samples.filter((sample) => sample.audio === "unverified").length,
    samples,
  };
});

process.stdout.write(`${JSON.stringify({ testedAt: new Date().toISOString(), totalTests: results.length, providers }, null, 2)}\n`);
