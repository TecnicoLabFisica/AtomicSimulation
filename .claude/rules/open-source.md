# Open-source hygiene (always applies — this repo will be published)

- **Never commit LD Didactic material**: PDFs, page renders/screenshots, copied figures, or verbatim
  paragraphs. `refs/` is gitignored. Paraphrased facts, numerical values, and digitized *data points*
  (e.g. `fig4_digitized.csv`) are fine when cited ("LD Physics Leaflet P6.3.3.1, Fig. 4").
- Cite sources in the README and in docstrings: the LD leaflet P6.3.3.1, LD instruction sheet 554 800,
  xraylib, and literature values.
- No secrets, tokens, local absolute paths (`/home/...`), or machine-specific settings in committed
  files. `.claude/settings.local.json` stays local.
- Planned licensing: **MIT** for code and **CC BY 4.0** for educational content (texts, tasks,
  figures we create). New dependencies must be license-compatible (MIT/BSD/Apache/ISC); ask
  before adding GPL/AGPL or anything with unclear licensing.
- Prefer few, small, well-maintained dependencies. Every web dependency ships to students' phones.
- Write for strangers: clear README, reproducible setup (`environment.yml`, `package-lock.json`),
  and commit messages that explain *why*.
