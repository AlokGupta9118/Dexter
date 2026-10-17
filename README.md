# Nexus multi-agent starter

React + FastAPI + Firebase Auth/Firestore reference implementation.

## Run backend
`cd backend && pip install -r requirements.txt`, copy `.env.example` to `.env`, configure Firebase Admin credentials and LLM settings, then run `uvicorn app.main:app --reload --port 8000`.

## Frontend
Copy `frontend/src/lib/firebase.ts` and `nexusApi.ts` into your Vite React app; install `firebase`; configure `frontend/.env.example` as `.env.local`.

## Important
This is a starter, not a merge into your complete app. Your pasted Chat.tsx depends on store, graph, API helper, and backend files that were not provided. Do not replace the existing store blindly. The starter supports Firebase-token verification, per-user Firestore data, auto routing, consented memories, conversation persistence, and approval records. It does not execute actual bookings or deliver scheduled notifications until provider integrations and a scheduler are added. Never commit service-account keys.
