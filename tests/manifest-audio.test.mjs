import assert from "node:assert/strict";
import test from "node:test";

import { inspectEmbedPolicy, inspectManifestAudio } from "../lib/player-server-health.ts";

test("detects Portuguese only in HLS audio tracks", () => {
  const manifest = `#EXTM3U
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",LANGUAGE="pt-BR",NAME="Português",URI="subs/pt.vtt"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE="en",NAME="English",URI="audio/en.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE="pt-BR",NAME="Português Brasil",URI="audio/pt.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=2500000,AUDIO="audio",SUBTITLES="subs"
video/main.m3u8`;

  assert.deepEqual(inspectManifestAudio(manifest, "hls"), {
    audioLanguages: ["en", "pt-BR"],
    hasPortugueseAudio: true,
    audioMetadataSource: "hls",
  });
});

test("does not mistake Portuguese subtitles for Portuguese audio", () => {
  const manifest = `#EXTM3U
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",LANGUAGE="pt-BR",NAME="Português",URI="subs/pt.vtt"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE="en",NAME="English",URI="audio/en.m3u8"`;

  assert.equal(inspectManifestAudio(manifest, "hls").hasPortugueseAudio, false);
});

test("detects DASH audio AdaptationSet language metadata", () => {
  const manifest = `<?xml version="1.0"?>
<MPD><Period>
  <AdaptationSet contentType="video"><Representation id="v1" /></AdaptationSet>
  <AdaptationSet mimeType="audio/mp4" lang="por"><Representation id="a1" /></AdaptationSet>
</Period></MPD>`;

  assert.deepEqual(inspectManifestAudio(manifest, "dash"), {
    audioLanguages: ["pt"],
    hasPortugueseAudio: true,
    audioMetadataSource: "dash",
  });
});

test("returns unknown when a manifest does not declare audio language", () => {
  const manifest = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nvideo.m3u8";
  assert.equal(inspectManifestAudio(manifest, "hls").hasPortugueseAudio, null);
});

test("rejects embeds that require popup sandbox permissions", () => {
  assert.deepEqual(inspectEmbedPolicy(`
    <div>Seu sandbox está bloqueando o player.</div>
    <code>sandbox="allow-scripts allow-same-origin allow-popups"</code>
  `), {
    code: "SANDBOX_REQUIRES_POPUPS",
    message: "O provedor exige permissão de pop-up incompatível com o sandbox protegido",
    evidence: "allow-popups",
  });
});

test("rejects forced pop-under and smartlink scripts", () => {
  const violation = inspectEmbedPolicy(`
    <script>window.aclib?.runPop({ zoneId: "11201262" });</script>
    <script id="adcash-popunder-init"></script>
  `);
  assert.equal(violation?.code, "FORCED_POPUP_ADVERTISING");
});

test("allows a regular embedded player document", () => {
  assert.equal(inspectEmbedPolicy(`
    <video controls></video>
    <script>window.parent.postMessage({ type: "PLAYER_EVENT" }, "https://flixa.app")</script>
  `), null);
});
