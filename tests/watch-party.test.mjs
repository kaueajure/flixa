import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { partyCapabilities, parsePartyRoomState, samePartyMedia, partyTargetTime, samePartyDuration, cineSrcCommand, parseCineSrcEvent } from "../lib/watch-party.ts";
import { newSession, signSession, verifySession, createAblyTokenRequest } from "../lib/watch-party-auth.ts";

const state = { providerId: "cinesrc", media: { id: "550", title: "Clube da Luta", kind: "movie" }, playback: { paused: false, currentTime: 15, updatedAt: 100000, sequence: 2 } };

test("guest can chat but cannot publish playback or control another room", () => {
  const caps = partyCapabilities("ABC234", "guest");
  assert.equal(caps["watch-party:ABC234"].includes("publish"), false);
  assert.equal(caps["watch-party:ABC234:chat"].includes("publish"), true);
  assert.equal(caps["watch-party:ABC234:chat"].includes("presence"), false);
  assert.deepEqual(Object.keys(caps), ["watch-party:ABC234", "watch-party:ABC234:chat"]);
  assert.equal(partyCapabilities("ABC234", "host")["watch-party:ABC234"].includes("publish"), true);
});

test("room state only accepts CineSrc with finite playback values", () => {
  assert.deepEqual(parsePartyRoomState(state), state);
  for (const playback of [null, { ...state.playback, paused: "false" }, { ...state.playback, currentTime: NaN }, { ...state.playback, currentTime: -1 }, { ...state.playback, updatedAt: Infinity }, { ...state.playback, sequence: -1 }, { ...state.playback, sequence: 1.2 }]) assert.equal(parsePartyRoomState({ ...state, playback }), null);
  assert.equal(parsePartyRoomState({ ...state, providerId: "vidzen" }), null);
  assert.equal(parsePartyRoomState({ ...state, media: { ...state.media, kind: "tv" } }), null);
});

test("different titles or episodes cannot share playback state", () => {
  assert.equal(samePartyMedia(state.media, { ...state.media }), true);
  assert.equal(samePartyMedia(state.media, { ...state.media, id: "551" }), false);
  const episode = { id: "1399", title: "Série", kind: "tv", season: 1, episode: 1 };
  assert.equal(samePartyMedia(episode, { ...episode, episode: 2 }), false);
  assert.equal(samePartyMedia(episode, { ...episode, season: 2 }), false);
  assert.notEqual(parsePartyRoomState({ ...state, media: episode }), null);
});

test("late participants account for elapsed playback but paused videos stay fixed", () => {
  assert.equal(partyTargetTime(state.playback, 105000), 20);
  assert.equal(partyTargetTime({ ...state.playback, paused: true }, 105000), 15);
  assert.equal(partyTargetTime(state.playback, 99000), 15);
});

test("CineSrc commands and actual events preserve the provider bridge format", () => {
  assert.deepEqual(cineSrcCommand("seek", 15), { type: "cinesrc:command", command: "seek", args: [15] });
  assert.equal(cineSrcCommand("getStatus").command, "getCurrentTime");
  assert.equal(parseCineSrcEvent({ type: "cinesrc:seeked", currentTime: 15 }).currentTime, 15);
  assert.equal(parseCineSrcEvent({ type: "cinesrc:pause" }).name, "pause");
  assert.equal(parseCineSrcEvent({ type: "PLAYER_EVENT" }), null);
  assert.equal(parseCineSrcEvent({ type: "cinesrc:timeupdate", currentTime: "invalid" }).currentTime, null);
});

test("signed room sessions preserve host identity and reject tampering or expiration", () => {
  const secret = "test-only-secret";
  const claims = newSession(1, "Anfitrião", "host", "");
  const session = signSession(claims, secret);
  assert.deepEqual(verifySession(session, secret), claims);
  assert.equal(verifySession(session, "another-secret"), null);
  const altered = Buffer.from(JSON.stringify({ ...claims, uid: 2 })).toString("base64url");
  assert.equal(verifySession(`${altered}.${session.split(".")[1]}`, secret), null);
  assert.equal(verifySession(signSession({ ...claims, exp: 1 }, secret), secret), null);
  assert.equal(verifySession(signSession({ ...claims, clientId: "guest:1:fake" }, secret), secret), null);
  assert.equal(newSession(2, "Convidado", "guest", "bad"), null);
});

test("Ably token request is signed with restricted capabilities without exposing key secret", () => {
  const token = createAblyTokenRequest("guest:2:random", "ABC234", "guest", "test.key:test-secret");
  const signature = `${token.keyName}\n${token.ttl}\n${token.capability}\n${token.clientId}\n${token.timestamp}\n${token.nonce}\n`;
  assert.equal(token.mac, createHmac("sha256", "test-secret").update(signature).digest("base64"));
  assert.equal(JSON.stringify(token).includes("test-secret"), false);
  assert.equal(JSON.parse(token.capability)["watch-party:ABC234"].includes("publish"), false);
  assert.throws(() => createAblyTokenRequest("host:1:random", "ABC234", "host", "invalid"));
});

test("different video durations cannot be silently synchronized", () => {
  assert.equal(samePartyDuration(7984, 8348), false);
  assert.equal(samePartyDuration(7984, 7984), true);
  assert.equal(samePartyDuration(undefined, 7984), true);
  assert.equal(partyTargetTime({ ...state.playback, durationSeconds: 18 }, 105000), 18);
  assert.equal(parsePartyRoomState({ ...state, playback: { ...state.playback, durationSeconds: Infinity } }), null);
});
