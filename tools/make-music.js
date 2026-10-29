#!/usr/bin/env node
// Music-only soundtrack (no voice) + captions for the "music" video style.
//   node tools/make-music.js out/narration.json out/voice --video-secs 64 [--track auto|<file>] [--index N]
// Tracks live in assets/music/*.mp3 (sorted by name). --track auto picks index N modulo count (workflow passes the run number) so the music rotates.
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const [inFile, outDir] = args.filter((a, i) => !a.startsWith('--') && !(args[i - 1] || '').startsWith('--'));
const VIDEO = +opt('video-secs', 64), LUFS = +opt('lufs', -14);
const dir = path.join(__dirname, '..', 'assets', opt('dir', 'music'));   // music = international rotation, music-local = domestic rotation
const all = fs.readdirSync(dir).filter(f => /\.(mp3|wav|m4a)$/i.test(f)).sort();
if (!all.length) { console.error('::error title=No music::music folder is empty'); process.exit(1); }
let track = opt('track', 'auto'); if (track === 'auto' || !all.includes(track)) track = all[(+opt('index', 0) % all.length + all.length) % all.length];
console.log('::notice title=Music track::' + track + ' (' + all.length + ' tracks in rotation)');
fs.mkdirSync(outDir, { recursive: true });
const fc = `[0:a]aresample=44100,aformat=channel_layouts=stereo,loudnorm=I=${LUFS}:TP=-1.5:LRA=9,atrim=0:${VIDEO},apad=whole_dur=${VIDEO},atrim=0:${VIDEO},afade=t=in:d=1.2,afade=t=out:st=${(VIDEO - 2.5).toFixed(2)}:d=2.5[out]`;
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, track), '-filter_complex', fc, '-map', '[out]', '-ar', '44100', path.join(outDir, 'voice.wav')], { encoding: 'utf8' });
if (r.status !== 0) { console.error('::error title=Music mix failed::' + (r.stderr || '').slice(0, 300)); process.exit(1); }
fs.writeFileSync(path.join(outDir, 'captions.json'), JSON.stringify(JSON.parse(fs.readFileSync(inFile, 'utf8')).captions));
console.log('music track + captions ready');
