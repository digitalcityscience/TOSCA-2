# TOSCA Frontend

[![CI](https://github.com/digitalcityscience/TOSCA-Frontend/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/digitalcityscience/TOSCA-Frontend/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/digitalcityscience/TOSCA-Frontend?sort=semver)](https://github.com/digitalcityscience/TOSCA-Frontend/releases)
[![Image](https://img.shields.io/badge/image-ghcr.io%2Fdigitalcityscience%2Ftosca--frontend-blue?logo=docker)](https://github.com/digitalcityscience/TOSCA-Frontend/pkgs/container/tosca-frontend)
[![License: MIT](https://img.shields.io/github/license/digitalcityscience/TOSCA-Frontend)](LICENSE)

The web app of the [TOSCA platform](https://github.com/digitalcityscience/TOSCA).
To install TOSCA, start there ([Run TOSCA](https://github.com/digitalcityscience/TOSCA#run-tosca));
to work on the web app inside the whole platform, see
[Develop TOSCA](https://github.com/digitalcityscience/TOSCA#develop-tosca).

## Overview
This project is a **Vue 3** web application built with **TypeScript**, using **Pinia** for state management, **MapLibre** for mapping, and **GeoServer** for spatial data integration. The backend is powered by **Django**, handling user participation and campaign data.

## Features
- **Interactive Mapping**: MapLibre-powered maps with vector and raster layer support.
- **GeoServer Integration**: Fetch layers, metadata, and feature attributes.
- **Filtering & Analysis**: Attribute-based and geometry-based filtering using Turf.js.
- **State Management**: Modular stores using Pinia for efficient state handling.
- **Participation System**: Django-backed user participation and campaign tracking.
- **Vue Router**: Dynamic routing and named views.
- **TailwindCSS**: Custom UI styling with dark mode support.

---

## Installation & Setup

### **1. Clone the Repository**
```sh
git clone https://github.com/digitalcityscience/TOSCA-Frontend.git
cd TOSCA-Frontend
```

### **2. Install Dependencies**

Use the Node.js and npm versions configured for the project:

```sh
nvm use
```

Then install the locked dependencies:

```sh
npm ci
```

### **3. Configure Environment Variables**
Create `.env.development` from `.env.example` and set the values. The file is
gitignored; `npm run dev` reads it.
```sh
cp .env.example .env.development
```

### **4. Run the Development Server**
```sh
npm run dev
```

The application will be available at `http://localhost:5173/` by default.

---

## Docker

The image contains no environment-specific values. The container reads the same
`VITE_*` variables as `.env.example` from its environment when it starts,
checks them, and writes them to `/config.js`, which the app loads before it
starts. One image therefore serves every environment, and changing a value
needs a container restart, not a rebuild.

```sh
docker build -t tosca-frontend .
docker run --rm -p 8080:80 --env-file path/to/deployment.env tosca-frontend
```

- A missing or malformed required variable stops the container with a message
  in its log.
- Every `VITE_*` value is public: anyone who opens the app can read
  `/config.js`. Never put a secret in one.
- An `--env-file` takes values literally, so write `NAME=value` without quotes.
- The app is served from the web root; `VITE_BASE_URL` must be `/` or unset.
- `npm run build` and `npm run preview` on your own machine use production
  mode: they do not read `.env.development`, so the built app has no values.
  To check a production build locally, run the Docker image with an env file.
- On a read-only root filesystem, set `TOSCA_CONFIG_FILE` to a writable path
  and make nginx serve that file at `/config.js`.
- Released images are `ghcr.io/digitalcityscience/tosca-frontend:X.Y.Z`, for
  both `amd64` and `arm64` (Apple silicon); `docker pull` picks the right one.
  See [Versions and releases](#versions-and-releases).
- `/version.json` names the version and commit of the running image.

In the code, read these values with `getConfig()` from `src/core/config.ts`,
not from `import.meta.env`.

---

## Project Structure
```
📂 src
 ┣ 📂 components     # Vue UI components
 ┣ 📂 store         # Pinia state management
 ┣ 📂 views         # Page-level components
 ┣ 📂 router        # Vue Router configuration
 ┣ 📂 core          # Helpers and utilities
 ┣ 📂 assets        # Static assets
 ┣ 📜 main.ts       # Entry point
```

For a detailed breakdown, refer to the [Folder Structure](https://github.com/digitalcityscience/TOSCA-Frontend/wiki/Folder-Structure) in the **GitHub Wiki**.

---

## Configuration

### **1. TypeScript Configuration**
Defined in `tsconfig.json` and `tsconfig.node.json`.
- Supports module aliasing (`@components`, `@store`).
- Uses strict typing and ESNext features.

### **2. Vite Configuration**
Configured in `vite.config.ts`.
- Sets up **Vue plugin**.
- Defines module aliases.
- Runs on **port 5173** by default.

### **3. TailwindCSS & PostCSS**
- **Tailwind Config**: Custom theme settings, dark mode selector.
- **PostCSS**: CSS nesting and autoprefixing.

For more details, see the [Environment & Configuration Files](https://github.com/digitalcityscience/TOSCA-Frontend/wiki/Environment-&-Configuration-Files) in the Wiki.

---

## API & Backend Integration
- **GeoServer API**: Fetches layers, styles, and features.
- **Django API**: Manages user participation and campaigns.
- **State Management**: Handled via Pinia.

For API details, refer to the [API & Backend Configuration](https://github.com/digitalcityscience/TOSCA-Frontend/wiki/API-Configuration) in the Wiki.

---

## Testing
This project uses **Vitest** for unit and integration testing.

### **Run ESLint**
```sh
npm run lint
```

### **Run Tests**
```sh
npm run test
```

For testing strategy, see the [Testing & Debugging](https://github.com/digitalcityscience/TOSCA-Frontend/wiki/Testing) documentation.

---

## Contributing
We welcome contributions! See the [Contributing Guide](https://github.com/digitalcityscience/TOSCA-Frontend/CONTRIBUTING.md) for details.

---

## License
This project is licensed under the **MIT License**. See `LICENSE` for details.

---

## Versions and releases

The web app uses [Semantic Versioning](https://semver.org/). A release is a Git
tag `vX.Y.Z` (or `vX.Y.Z-rc.N` for a pre-release) on a commit of `main`.

| Workflow | Runs on | Does |
|---|---|---|
| [`ci.yml`](.github/workflows/ci.yml) | pull requests, pushes to `main` | secret scan, lint, unit tests, production build, image build, [smoke test](scripts/ci/smoke-image.sh) of the image — pushes nothing |
| [`release.yml`](.github/workflows/release.yml) | a `v*` tag | checks the tag, lint and tests, builds amd64 and arm64 once, smoke tests that build, pushes it as `tosca-frontend:X.Y.Z`, creates the GitHub Release |

To release:

1. Through a pull request to `main`, set `version` in `package.json` (and
   `package-lock.json`, e.g. `npm version X.Y.Z --no-git-tag-version`) and add a
   `## [X.Y.Z]` section to [CHANGELOG.md](CHANGELOG.md).
2. Tag the merged commit and push the tag:
   `git tag -a vX.Y.Z -m "tosca-frontend X.Y.Z" && git push origin vX.Y.Z`.

A published version is never overwritten: the release workflow stops if the
image tag already exists. Pushes to `main` no longer publish an image.

