# League HQ

A fan-made, unofficial app for the "Monday Madness" FPL mini-league. Not connected to the Premier League or Fantasy Premier League.

- `scripts/build_data.py` reads the public FPL API (standard library only) and writes `site/data.json`.
- `.github/workflows/update.yml` runs it every 10 minutes and publishes `site/` to GitHub Pages when the data changes. League data is never committed to this repository.
- `config/league.json` holds the league id, each manager's club, and `exclude_entries`: add an entry id there to remove someone from the site at the next update.

Team names chosen by managers are only ever shown as plain text.
