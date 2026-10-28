# Lipad Pinas flight route videos

Flat, north-up satellite-map flight timelapse (Google 2D Map Tiles) with country / sea / city labels.

raw track JSON -> `tools/process-track.js` (clean, resample, pacing) -> `render-flat.js` (Playwright + canvas) -> ffmpeg MP4.

## Run in GitHub (no PC needed)
1. Repo -> Settings -> Secrets and variables -> Actions -> New repository secret: `GOOGLE_MAP_TILES_KEY`
2. Actions tab -> "Render flight video" -> Run workflow. The finished video link appears in the run summary
   (a public Release) and as a downloadable artifact.

## Run locally
    npm install && npx playwright install chromium
    GOOGLE_MAP_TILES_KEY=... node tools/process-track.js data/mnl-ceb-raw.json out/t.json --pacing uniform
    GOOGLE_MAP_TILES_KEY=... node render-flat.js --track out/t.json --out out/v.mp4 --fps 15 --out-fps 30 --zoom-cruise 8.2

## Cost guard
The renderer counts unique tiles first and prints the estimate (Google: 100,000 free tile requests/month, then $0.60 per 1,000).
It aborts above `--max-tiles` (6000 in the workflow) unless `--force` is passed.

## Data
`data/*-raw.json` are SYNTHETIC test tracks, not real flights. Raw format:
`{ meta:{airline,flight,reg,aircraft,date,from,fromCity,fromCountry,to,toCity,toCountry,source}, points:[{t,lat,lon,alt,gs}] }`
(t seconds, alt metres, gs knots). A flight-data adapter (FlightAware / Flightradar24 / OpenSky) is the next piece.

Check Google's current terms on recording Map Tiles output before posting monetized videos. Never commit API keys.
