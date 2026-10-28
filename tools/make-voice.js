#!/usr/bin/env node
// narration.json -> voice track (exactly --video-secs long) + timed captions.
//   node tools/make-voice.js out/narration.json out/voice --video-secs 64 [--provider auto|google|edge|test] [--voice NAME] [--gender MALE|FEMALE]
// Provider order for "auto": Google Cloud Text-to-Speech (official, key in GOOGLE_TTS_KEY or GOOGLE_MAP_TILES_KEY) -> edge-tts (free, unofficial).
// Outputs: <out>/voice.wav, <out>/captions.json
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const [inFile, outDir] = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] || '').startsWith('--'));
const VIDEO = +opt('video-secs', 64), GAP = 0.25, END_PAD = 0.4;
const PROVIDER = opt('provider', 'auto'), RATE = +opt('rate', 1.08), PITCH = +opt('pitch', 2);
const GENDER = opt('gender', 'MALE'), VOICE = opt('voice', '');
const KEY = process.env.GOOGLE_TTS_KEY || process.env.GOOGLE_MAP_TILES_KEY || '';
const sh = (cmd, a, o) => { const r = spawnSync(cmd, a, { encoding: 'utf8', ...o }); return r; };
const dur = f => parseFloat(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).stdout);
fs.mkdirSync(outDir, { recursive: true });
let S = JSON.parse(fs.readFileSync(inFile, 'utf8')).sentences;
const used = { provider: null };

async function google(text, file) {
  const voice = { languageCode: 'en-US', name: VOICE || (GENDER === 'FEMALE' ? 'en-US-Neural2-F' : 'en-US-Neural2-D') };
  const r = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize?key=' + KEY, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: { text }, voice, audioConfig: { audioEncoding: 'MP3', speakingRate: RATE, pitch: PITCH, sampleRateHertz: 24000 } }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.audioContent) throw new Error('google tts ' + r.status + ' ' + JSON.stringify(j).slice(0, 200));
  fs.writeFileSync(file, Buffer.from(j.audioContent, 'base64'));
}
function edge(text, file) {
  const v = VOICE || (GENDER === 'FEMALE' ? 'en-US-AriaNeural' : 'en-US-GuyNeural');
  const pct = Math.round((RATE - 1) * 100);
  const r = sh('edge-tts', ['--voice', v, '--rate=' + (pct >= 0 ? '+' : '') + pct + '%', '--pitch=+' + Math.max(0, PITCH * 2) + 'Hz', '--text', text, '--write-media', file]);
  if (r.status !== 0 || !fs.existsSync(file)) throw new Error('edge-tts failed: ' + (r.stderr || r.error || '').toString().slice(0, 200));
}
function test(text, file) { const n = text.split(/\s+/).length; sh('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=220:duration=${(n * 0.4).toFixed(2)}`, '-q:a', '6', file]); }

(async () => {
  const order = PROVIDER === 'auto' ? (KEY ? ['google', 'edge'] : ['edge']) : [PROVIDER];
  let ok = false, lastErr = '';
  for (const prov of order) {
    try {
      for (let i = 0; i < S.length; i++) { const f = path.join(outDir, `s${i}.mp3`); fs.rmSync(f, { force: true });
        if (prov === 'google') await google(S[i].text, f); else if (prov === 'edge') edge(S[i].text, f); else test(S[i].text, f); S[i].file = f; S[i].d = dur(f); }
      used.provider = prov; ok = true; break;
    } catch (e) { lastErr = e.message; console.error('TTS provider ' + prov + ' failed: ' + e.message); }
  }
  if (!ok) { console.error('::error title=Narration failed::' + lastErr); process.exit(1); }
  console.log('voice provider:', used.provider);

  // ---- schedule: sentences run back to back (even small gaps) so the voice covers the whole video and finishes right at the end
  let tempo = 1, P;
  const build = () => { const n = S.length, avail = VIDEO - END_PAD - 0.3, sumd = S.reduce((a, s) => a + s.d / tempo, 0);
    const gap = n > 1 ? Math.min(1.2, (avail - sumd) / (n - 1)) : 0; if (gap < 0.15 && n > 1) return null;
    let t = 0.3; return S.map(s => { const d = s.d / tempo, x = { s, st: t, d }; t += d + gap; return x; }); };
  P = build();
  while (!P) {
    const sumd = S.reduce((a, s) => a + s.d, 0), need = sumd / (VIDEO - END_PAD - 0.3 - 0.15 * (S.length - 1));
    if (need <= 1.25) { tempo = need; P = build(); if (P) break; tempo = need * 1.01; P = build(); break; }
    const drop = S.filter(s => s.opt).sort((a, b) => b.opt - a.opt)[0]; if (!drop) { tempo = 1.25; P = build() || S.map(() => null); break; }
    console.log('dropping optional sentence:', drop.text.slice(0, 50)); S = S.filter(s => s !== drop); P = build();
  }
  console.log(P.map(x => `${x.st.toFixed(1)}-${(x.st + x.d).toFixed(1)}s  ${x.s.text.slice(0, 60)}`).join('\n'), '\ntempo', tempo.toFixed(2));

  // ---- mix into one track of exactly VIDEO seconds
  const inputs = P.flatMap(x => ['-i', x.s.file]);
  const filt = P.map((x, i) => `[${i}:a]${tempo !== 1 ? `atempo=${tempo.toFixed(3)},` : ''}aresample=44100,aformat=channel_layouts=mono,adelay=${Math.round(x.st * 1000)}:all=1[a${i}]`).join(';')
    + `;${P.map((_, i) => `[a${i}]`).join('')}amix=inputs=${P.length}:normalize=0:dropout_transition=0,apad=whole_dur=${VIDEO},atrim=0:${VIDEO},loudnorm=I=-15:TP=-1.5:LRA=9[out]`;
  const r = sh('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filt, '-map', '[out]', '-ar', '44100', path.join(outDir, 'voice.wav')]);
  if (r.status !== 0) { console.error('::error title=Voice mix failed::' + (r.stderr || '').slice(0, 400)); process.exit(1); }

  // ---- captions: split into short chunks at punctuation / ~60 chars; time proportional to length inside each sentence
  const caps = [];
  for (const x of P) {
    const words = x.s.text.split(/\s+/), chunks = []; let cur = '';
    for (const w of words) { if (cur && (cur + ' ' + w).length > 62) { chunks.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; if (/[,.!?;]$/.test(w) && cur.length > 28) { chunks.push(cur); cur = ''; } }
    if (cur) chunks.push(cur);
    if (chunks.length > 1 && chunks[chunks.length - 1].length < 18) chunks.push(chunks.splice(-2).join(' '));   // no tiny orphan caption at the end of a sentence
    const tot = chunks.reduce((n, c) => n + c.length, 0); let t = x.st;
    for (const c of chunks) { const d = x.d * c.length / tot; caps.push({ s: +t.toFixed(2), e: +(t + d).toFixed(2), text: c }); t += d; }
  }
  fs.writeFileSync(path.join(outDir, 'captions.json'), JSON.stringify(caps));
  console.log('captions:', caps.length, 'voice.wav', dur(path.join(outDir, 'voice.wav')).toFixed(2) + 's');
})();
