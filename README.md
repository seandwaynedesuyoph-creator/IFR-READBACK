# Aviation24 (A24)

Static A24 workspace with eight operational tabs: VFR, IFR, TAXI, DEP, APP,
LAND, PARK, and NOTES. Flight drafts, frequencies, and notes are stored in
browser localStorage. Readback validation reports missing and invalid entries
without changing the entered flight information.

Run locally:

```bash
python3 dev_server.py
```

Open `http://localhost:4173`. The page refreshes automatically when you change
an HTML, CSS, or JavaScript file. To use another port, set `PORT` before
starting the server, for example `PORT=8080 python3 dev_server.py`.

## GitHub Pages

GitHub Pages is enabled for this repository. The workflow deploys this static
site on pushes to `main`. The project URL is
<https://seandwaynedesuyoph-creator.github.io/IFR-READBACK/>.
