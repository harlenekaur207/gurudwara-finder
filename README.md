# Sangat — Global Gurudwara Finder

A responsive web app for discovering Gurudwaras around the world. Visitors can search by name or location, sort by distance, explore a map, save favorites, view events, get directions, and open broadcast links.

## Features

- Global search by Gurudwara, city, or country
- Browser-based location sorting; coordinates never leave the device
- Interactive OpenStreetMap map powered by Leaflet
- Profiles with address, phone, hours, recurring events, and directions
- Broadcast discovery links and browser-saved favorites
- Community suggestion form saved locally in the prototype
- Responsive design with no build step or API key required

## Run locally

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## GitHub Pages

In **Settings → Pages**, choose **Deploy from a branch**, then select `main` and `/ (root)`. The site will appear at `https://harlenekaur207.github.io/gurudwara-finder/`.

## Data note

This starter directory uses public-facing information. Contact details, hours, events, and broadcasts change, so visitors should verify details before travelling. A production release should use a moderated database and allow Gurudwaras to manage their profiles.
