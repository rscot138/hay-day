# Hay Decision Engine

Mobile-first Next.js App Router application for deciding when to cut, ted, and bale hay using live Open-Meteo weather data.

## What It Does

- Uses browser geolocation or saved field coordinates.
- Fetches real hourly weather from Open-Meteo through `/api/weather`.
- Calculates a field-specific hay decision through `/api/hay-decision`.
- Produces a Hay Score, cut recommendation, best future cut window, action timeline, tedding option, drying estimate, bale window, and with/without tedding comparison.
- Saves field profile locally in the browser.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deploy

This app is Vercel-ready. Push the repository and import it as a Next.js project. No API keys are required for Open-Meteo.

## Notes

The app does not use mock weather. If location permission is denied, enter latitude and longitude in Field Setup so the API can fetch live data before making a recommendation.
