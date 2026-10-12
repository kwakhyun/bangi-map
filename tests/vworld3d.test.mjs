import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {renderPage, validateConfig} from '../scripts/prepare-vworld3d.mjs';

const config = {
  apiKey: 'TEST-KEY-NOT-A-REAL-CREDENTIAL',
  registeredDomain: 'https://localhost:8444',
  allowedOrigin: 'https://localhost:8444',
};

test('missing credentials produce no SDK request or credential placeholder', () => {
  const {html, loader} = renderPage();
  assert.equal(loader, '');
  assert.doesNotMatch(html, /webglMapInit|sdk-loader\.js|apiKey=/);
  assert.match(html, /data-connection="unconfigured"/);
});

test('SDK gate only emits an official HTTPS script at the configured origin', () => {
  const {loader} = renderPage(config);
  const output = [];
  const context = {location: {origin: 'https://example.org'}, document: {write: value => output.push(value)}};
  vm.runInNewContext(loader, context);
  assert.equal(output.length, 0);
  context.location.origin = config.allowedOrigin;
  vm.runInNewContext(loader, context);
  assert.equal(output.length, 1);
  assert.match(output[0], /^<script src="https:\/\/map\.vworld\.kr\/js\/webglMapInit\.js\.do\?/);
  assert.match(output[0], /version=3\.0/);
});

test('reject mixed content, origin spoofing, injected markup and URL credentials', () => {
  for (const override of [
    {allowedOrigin: 'http://localhost:8444'},
    {registeredDomain: 'https://example.org'},
    {allowedOrigin: 'https://localhost:8444/path'},
    {registeredDomain: 'https://localhost:8444/?key=secret'},
    {allowedOrigin: 'https://user:password@localhost:8444'},
    {apiKey: '\"></script><script>alert(1)</script>'},
  ]) assert.throws(() => validateConfig({...config, ...override}));
});
