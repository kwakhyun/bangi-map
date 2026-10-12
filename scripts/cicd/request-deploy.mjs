import { publicEncrypt, constants, createHash } from 'node:crypto';
import { readFile, appendFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const { GITHUB_REPOSITORY: repo, GITHUB_SHA: sha, GITHUB_RUN_ID: runId,
  GITHUB_RUN_ATTEMPT: runAttempt, GH_TOKEN: token, RELEASE_TAG: releaseTag } = process.env;
assert.equal(repo, 'kwakhyun/bangi-map');
assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
assert.ok(['push', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME));
assert.match(sha, /^[0-9a-f]{40}$/);
assert.equal(releaseTag, `ncp-${sha}-${runId}-${runAttempt}`);
assert.ok(token && Buffer.byteLength(token) <= 446, 'Callback token exceeds RSA-OAEP capacity');
const bytes = await readFile('.runtime/release/manifest.json');
assert.equal(JSON.parse(bytes).sha, sha);
const sealedToken = publicEncrypt({
  key: await readFile('infra/cicd/ncp-callback-public.pem'),
  padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256',
}, Buffer.from(token)).toString('base64');
const api = async (path, body) => {
  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`GitHub deployment request returned HTTP ${response.status}`);
  return response.json();
};
const branch = await api('/branches/main');
assert.equal(branch.commit.sha, sha, 'A newer main commit is waiting; stale deployment rejected');
const deployment = await api('/deployments', {
  ref: sha, task: 'bangi:deploy', environment: 'ncp-staging',
  auto_merge: false, required_contexts: [], production_environment: false,
  description: `Verified main ${sha.slice(0, 12)}`,
  payload: { protocol: 1, runId: Number(runId), runAttempt: Number(runAttempt), releaseTag,
    manifestSha256: createHash('sha256').update(bytes).digest('hex'),
    expiresAt: new Date(Date.now() + 20 * 60000).toISOString(), sealedToken },
});
const path = `/deployments/${deployment.id}/statuses`;
console.log(`Deployment ${deployment.id} queued for NCP (${sha.slice(0, 12)})`);
await api(path, { state: 'queued', description: 'Waiting for the NCP pull agent', auto_inactive: false });
const deadline = Date.now() + 18 * 60000;
try {
  while (Date.now() < deadline) {
    const statuses = await api(path + '?per_page=1');
    const status = statuses[0];
    if (status?.state === 'success') {
      console.log(status.description);
      await appendFile(process.env.GITHUB_STEP_SUMMARY,
        `### NCP deployment passed\n\n- Commit: \`${sha}\`\n- Deployment: ${deployment.id}\n- ${status.description}\n- Access remains through the existing SSH tunnel.\n`);
      process.exit(0);
    }
    if (['failure', 'error', 'inactive'].includes(status?.state)) throw new Error(status.description);
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  throw new Error('NCP deployment acknowledgement timed out; inspect the server before retrying');
} catch (error) {
  await api(path, { state: 'failure', description: String(error.message).slice(0, 140), auto_inactive: false }).catch(() => {});
  throw error;
}
