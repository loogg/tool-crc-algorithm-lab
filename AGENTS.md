# Repository Rules

## Scope

- This repository owns the CRC algorithm lab at `https://loogg.github.io/tool-crc-algorithm-lab/`.
- Keep CRC calculations browser-local; do not add a server, database, analytics, or data upload without an explicit requirement.
- `package.json.version` is the single source of truth for the displayed and released version.
- Functional releases must update the version and create the matching `v*.*.*` tag.
- Releasing this tool must not modify or deploy `toolbox` unless its name, description, category, icon, URL, or availability changes.

## Verification

- Run `npm ci`, `npm test`, `npm run lint`, and `npm run build` before committing.
- Keep standard CRC check-vector tests and direct/pre-xor/table equivalence tests passing.
- Verify desktop and mobile interactions when changing the visualizer.
- Confirm the built asset base matches the GitHub repository name.
- Do not commit `dist`, source maps, credentials, local environment files, exported source archives, or build caches.

## Release

- Follow semantic versioning: patch for compatible fixes, minor for compatible features, and major for incompatible changes.
- Create releases with `npm version patch|minor|major -m "chore(release): v%s"`.
- Push the release commit and tag with `git push origin main --follow-tags`.
- Never move or reuse an existing release tag. Rollbacks require a new patch version.
- Only `v*.*.*` tags deploy GitHub Pages; ordinary commits run CI only.
