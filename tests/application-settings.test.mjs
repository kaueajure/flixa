import assert from 'node:assert/strict';
import test from 'node:test';
import appSettings from '../config/app.json' with {type:'json'};
import { criarUrlRecuperacao } from '../lib/password-reset-email.ts';

test('public app configuration: production reset links use the configured origin instead of request headers', () => {
  const old=process.env.NODE_ENV;process.env.NODE_ENV='production';
  try {
    const url=criarUrlRecuperacao(new Request('https://untrusted.example.test/login'), 'MOCK token');
    assert.equal(new URL(url).origin, new URL(appSettings.publicUrl).origin);
    assert.equal(new URL(url).searchParams.get('reset'), 'MOCK token');
  } finally {if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old}
});
test('public app configuration: local reset links retain the development server port', () => {
  const old=process.env.NODE_ENV;process.env.NODE_ENV='development';
  try {assert.equal(new URL(criarUrlRecuperacao(new Request('http://localhost:5173/login'), 'MOCK')).origin,'http://localhost:5173')}
  finally {if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old}
});
