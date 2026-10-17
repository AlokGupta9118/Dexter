# Nexus Frontend

A modular React + Vite + TypeScript frontend for the existing Nexus multi-agent FastAPI backend.

## Setup

1. Install Node.js 20+.
2. Run `npm install` in this folder.
3. Copy `.env.example` to `.env` and fill in the Firebase web configuration values.
4. Set `VITE_API_BASE_URL` to your FastAPI backend (for local development, `http://127.0.0.1:8000`).
5. Run `npm run dev`.

## Structure

- `src/App.tsx`: authentication state, workspace state, API requests, and orchestration between screens.
- `src/components/AuthScreen.tsx`: Firebase sign-in, signup, and password reset UI.
- `src/components/layout/`: sidebar and top bar.
- `src/components/pages/WorkspacePages.tsx`: workspace page presentation.
- `src/components/ui/`: reusable UI components.
- `src/config/workspace.ts`: agent modes, navigation, and memory categories.
- `src/lib/workspace.ts`: API response normalization and formatting helpers.
- `src/types/workspace.ts`: shared TypeScript types.
- `src/firebase.ts`: Firebase app and auth initialization.
- `src/styles.css`: responsive workspace styling.

The Firebase config values are read from Vite environment variables. Do not commit `.env` or private server credentials.
