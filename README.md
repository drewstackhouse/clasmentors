# CLAS Mentor Match

Suggests alumni mentors for students, starting from an Airtable People export, for staff to review.

Everything runs in the browser. The uploaded file never leaves the computer it's opened on, and the site makes
no requests to anyone else: the embedding model and its runtime are served from this site.

## How it works

1. **Upload** the People export: one CSV with both Current Students and Alumni Mentors.
2. **Check and set up.** The app flags duplicate records, empty profiles and links it can't read, and lets you
   leave people out of a run. Choose the most students per mentor, and whether every mentor should get a
   student before anyone gets a second.
3. **Suggestions.** Students who already have a mentor are left alone. Everyone else gets a suggested mentor
   and a ranked list of alternatives.

Under the hood:

- Each answer is embedded with [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
  (int8 ONNX, via transformers.js), one answer at a time, capped at 256 tokens as in sentence-transformers.
  Batching would change results: the quantized model's scales depend on padding.
- A student and a mentor are compared on weighted pairs of questions. A blank answer counts as an average match
  for that question, so it neither helps nor hurts.
- Suggestions come from a capacity-aware assignment (Jonker-Volgenant) that maximizes overall closeness. With
  caseload levelling on, it runs in rounds so no mentor gets a second student before every mentor has a first.

## Participant data

**This repository is public. Never commit participant data.** `.gitignore` excludes every `*.csv`, and the
tests use synthetic records only.

## Development

Requires Node 24.

```sh
npm install
npm run dev      # first run downloads the model (~24 MB, pinned revision, SHA-256 verified)
npm test
npm run build    # output in dist/
```

| Path | What's there |
| --- | --- |
| `src/data/` | CSV parsing, roster building, data checks |
| `src/embed/` | The embedding worker and its page-side client |
| `src/matching/` | Scoring, assignment, and the end-to-end run |
| `src/components/` | Interface |
| `scripts/fetch-model.mjs` | Downloads the pinned model into `public/models/` |

## Deployment

Every push to `main` runs the tests, builds, and publishes `dist/` to GitHub Pages
(`.github/workflows/deploy.yml`). The site is served from `/clasmentors/`, set as `base` in `vite.config.ts`.

## Expected columns

| Column | Used for |
| --- | --- |
| `Full Name`, `Role`, `Person ID` | Required. `Role` is `Current Student` or `Alumni Mentor`. |
| `Email` | Spotting duplicate records |
| `Career/Goals Statement`, `What You Seek in a Mentor`, `Activities/Clubs` | Student answers |
| `Job Title and Employer`, `Why Mentor Statement` | Mentor answers |
| `Majors`, `Minors` | Both |
| `Matched Alumni`, `Matched Student` | Airtable record ids of current matches |
