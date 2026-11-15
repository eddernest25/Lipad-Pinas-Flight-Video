#!/usr/bin/env node
// Flight Viewer Buffer helper (uses BUFFER_API_KEY_FLIGHTVIEWER):
//   node tools/buffer-admin.js --schema            print the Buffer GraphQL pieces needed to list/delete posts
//   node tools/buffer-admin.js --list              list scheduled posts (all channels of the account)
//   node tools/buffer-admin.js --delete <postId>   delete one post
const a = process.argv.slice(2), opt = k => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : ''; };
const KEY = process.env.BUFFER_API_KEY_FLIGHTVIEWER;
const gql = async (query, variables) => { const r = await fetch('https://api.buffer.com', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY }, body: JSON.stringify({ query, variables }) }); const t = await r.text(); try { return JSON.parse(t); } catch { throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 300)); } };
const T = async n => (await gql(`{__type(name:"${n}"){name kind inputFields{name type{name kind ofType{name kind ofType{name kind}}}} fields{name args{name type{name kind ofType{name kind ofType{name kind}}}}} enumValues{name}}}`)).data?.__type;
(async () => {
  if (!KEY) { console.error('BUFFER_API_KEY_FLIGHTVIEWER is not set'); process.exit(2); }
  if (a.includes('--schema')) {
    const q = await T('Query'); console.log('Query fields:', JSON.stringify(q.fields.filter(f => /post|account|organi/i.test(f.name)).map(f => ({ n: f.name, args: f.args.map(x => x.name + ':' + (x.type.name || x.type.ofType?.name || x.type.ofType?.ofType?.name)) }))));
    const m = await T('Mutation'); console.log('Mutation fields:', JSON.stringify(m.fields.filter(f => /delete|post/i.test(f.name)).map(f => ({ n: f.name, args: f.args.map(x => x.name + ':' + (x.type.name || x.type.ofType?.name || x.type.ofType?.ofType?.name)) }))));
    for (const n of ['PostsInput', 'PostsFilterInput', 'PostFilterInput', 'DeletePostInput', 'PostStatus']) console.log(n, JSON.stringify(await T(n)));
    return;
  }
  const org = (await gql('{account{organizations{id name}}}')).data?.account?.organizations || [];
  console.log('organizations', JSON.stringify(org));
  if (a.includes('--list')) {
    for (const o of org) { const j = await gql(`query($i:PostsInput!){posts(input:$i, first:50){edges{node{id status dueAt channelId text}}}}`, { i: { organizationId: o.id, filter: { status: ['scheduled'] } } }); console.log(JSON.stringify(j).slice(0, 3000)); }
  }
  if (opt('delete')) console.log(JSON.stringify(await gql('mutation($i:DeletePostInput!){deletePost(input:$i){... on DeletePostSuccess{__typename} ... on MutationError{message}}}', { i: { id: opt('delete') } })));
})().catch(e => { console.error(e); process.exit(1); });
