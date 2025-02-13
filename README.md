# TOSCA-2

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
git clone https://github.com/digitalcityscience/TOSCA-2.git
cd your-repo
```

### **2. Install Dependencies**
```sh
npm install
```

### **3. Configure Environment Variables**
Create a `.env` file based on `.env.example` and set the required values.
```sh
cp .env.example .env
```

### **4. Run the Development Server**
```sh
npm run dev
```

The application will be available at `http://localhost:5173/` by default.

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

For a detailed breakdown, refer to the [Folder Structure](https://github.com/digitalcityscience/TOSCA-2/wiki/Folder-Structure) in the **GitHub Wiki**.

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

For more details, see the [Environment & Configuration Files](https://github.com/digitalcityscience/TOSCA-2/wiki/Environment-&-Configuration-Files) in the Wiki.

---

## API & Backend Integration
- **GeoServer API**: Fetches layers, styles, and features.
- **Django API**: Manages user participation and campaigns.
- **State Management**: Handled via Pinia.

For API details, refer to the [API & Backend Configuration](https://github.com/digitalcityscience/TOSCA-2/wiki/API-Configuration) in the Wiki.

---

## Testing
This project uses **Vitest** for unit and integration testing.

### **Run Tests**
```sh
npm run test
```

For testing strategy, see the [Testing & Debugging](https://github.com/digitalcityscience/TOSCA-2/wiki/Testing) documentation.

---

## Contributing
We welcome contributions! See the [Contributing Guide](https://github.com/digitalcityscience/TOSCA-2/CONTRIBUTING.md) for details.

---

## License
This project is licensed under the **MIT License**. See `LICENSE` for details.

