#!/usr/bin/env node
// Schedules one video on Facebook (Reel), YouTube (Short) and TikTok via the Buffer API.
//   node tools/buffer-post.js --video <public https url> --caption out/caption.json --due 2026-11-01T07:00:00Z [--dry]
//   node tools/buffer-post.js --introspect      (prints the metadata input types, to confirm field names)
// Needs env BUFFER_API_KEY (GitHub secret).
const fs = require('fs'), a = process.argv.slice(2), opt = k => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : ''; };
const KEY = process.env.BUFFER_API_KEY;
const CH = { facebook: '6a5901cd80cc80cdcac67cd2', youtube: '6ae245b12f1f5ed648009c3c', tiktok: '6ae249392f1f5ed648010d76' };
const gql = async (query, variables) => {
  const r = await fetch('https://api.buffer.com', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY }, body: JSON.stringify({ query, variables }) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { throw new Error('Buffer HTTP ' + r.status + ': ' + t.slice(0, 300)); }
  return j;
};
(async () => {
  if (!KEY) { console.error('BUFFER_API_KEY is not set'); process.exit(2); }
  if (a.includes('--introspect')) {
    for (const n of ['CreatePostInput', 'PostInputMetadata', 'FacebookPostMetadataInput', 'YoutubePostMetadataInput', 'TikTokPostMetadataInput']) {
      const j = await gql(`{__type(name:"${n}"){name inputFields{name type{name kind ofType{name kind}}} enumValues{name}}}`);
      console.log(n, JSON.stringify(j.data?.__type || j.errors?.[0]?.message));
    }
    return;
  }
  const C = JSON.parse(fs.readFileSync(opt('caption'), 'utf8')), video = opt('video'), due = opt('due');
  const posts = {
    facebook: { text: C.facebook, metadata: { facebook: { type: 'reel' } } },
    youtube: { text: C.youtube.text, metadata: { youtube: { title: C.youtube.title, categoryId: '19', privacy: 'public', madeForKids: false } } },
    tiktok: { text: C.tiktokText, metadata: { tiktok: { title: C.tiktok.title } } }
  };
  const M = 'mutation($input: CreatePostInput!){createPost(input:$input){... on PostActionSuccess{post{id dueAt}} ... on MutationError{message}}}';
  let bad = 0;
  for (const [k, p] of Object.entries(posts)) {
    const input = { channelId: CH[k], text: p.text, schedulingType: 'automatic', mode: 'customScheduled', dueAt: due, assets: [{ video: { url: video } }], metadata: p.metadata };
    if (a.includes('--dry')) { console.log(k, JSON.stringify(input).slice(0, 300)); continue; }
    const j = await gql(M, { input }), r = j.data?.createPost;
    if (r?.post) console.log(k, 'scheduled', r.post.id, r.post.dueAt); else { bad++; console.error(k, 'FAILED', JSON.stringify(r || j.errors || j).slice(0, 500)); }
  }
  if (bad) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
