# Aviation24 (A24)

Static A24 workspace with eight operational tabs: VFR, IFR, TAXI, DEP, APP,
LAND, PARK, and NOTES. Flight drafts, frequencies, and notes are stored in
browser localStorage. Readback validation reports missing and invalid entries
without changing the entered flight information.

Run locally:

```bash
PORT=4173
python3 -m http.server "$PORT"
```

Open `http://localhost:4173`. To use another port, set `PORT` to that number
before starting the server.

## GitHub Pages

The GitHub Actions workflow deploys this static site on pushes to `main` and
attempts to enable Pages automatically. If that is blocked by repository
permissions, select **Settings → Pages → Build and deployment → GitHub
Actions**. The default project URL is
<https://seandwaynedesuyoph-creator.github.io/IFR-READBACK/>.
