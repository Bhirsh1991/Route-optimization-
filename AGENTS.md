# Instructions for Codex

## Overview
This repository hosts a simple web application for calculating optimized travel routes.

Key files and directories:
- `index.html` – main page and client-side code
- `src/` – JavaScript modules (`optimizer.js`, `geocode.js`)
- `tests/` – Jest unit tests
- `test.sh` – lightweight sanity script

## Testing
Codex should replicate the GitHub Actions workflow by running:

```bash
npm install        # install devDependencies (e.g. Jest)
npm test           # run unit tests
bash test.sh       # verify index.html and title tag
```

## Coding style
- Use vanilla JavaScript and keep the interface in Hebrew.
- Follow the module pattern used in `src/optimizer.js` and `src/geocode.js`.
- Keep the main HTML in a single `index.html` file.

## Pull Request guidelines
- Provide a short summary of the change in English.
- Include a **Testing** section listing the commands above and their results.
