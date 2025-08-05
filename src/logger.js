import {bufToB64, strToBuf} from './utils.js';

export async function logToGitHub(message, {storage = chrome?.storage?.local, fetchImpl = fetch} = {}) {
  if (!storage) {
    return;
  }
  const creds = await new Promise(resolve =>
    storage.get({githubToken: '', githubOwner: '', githubRepo: ''}, resolve)
  );
  const {githubToken, githubOwner, githubRepo} = creds;
  if (!githubToken || !githubOwner || !githubRepo) {
    return;
  }
  const path = `logs/log-${Date.now()}.txt`;
  const content = bufToB64(strToBuf(message));
  await fetchImpl(`https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: `Add log ${path}`,
      content
    })
  });
  return path;
}
