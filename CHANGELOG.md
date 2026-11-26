# Changelog

All notable changes to the TOSCA web app. The project uses
[Semantic Versioning](https://semver.org/); see
[Versions and releases](README.md#versions-and-releases).

## [Unreleased]

### Added
- Runtime configuration: the image holds no environment-specific values; the
  container checks its `VITE_*` variables at start and writes `/config.js`.
  Keycloak settings are optional as a group; without them the app runs without
  sign-in.
- `/version.json` and OCI labels name the version and commit of the image.
- CI on pull requests and `main`: secret scan, lint, unit tests, build, image
  build and an image smoke test (config.js, version.json, refusal of an
  incomplete configuration).
- Release workflow: images are published to GHCR only from a `v*` tag, after
  the tests and smoke test pass on the exact build that is pushed, together
  with a GitHub Release.

### Changed
- Pushes to `main` no longer publish `:main`, `:latest` or `:sha-*` images.
