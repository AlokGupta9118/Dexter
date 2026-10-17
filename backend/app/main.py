"""Nexus shared API core. Agent logic lives in separate modules under agents/."""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import firebase_admin
from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin import auth, credentials, firestore
from google.cloud.firestore_v1 import SERVER_TIMESTAMP
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    firebase_project_id: str = ""
    firebase_service_account_path: str = ""
    cors_origins: str = "http://localhost:5173"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]


settings = Settings()


def initialize_firebase():
    try:
        fb_app = firebase_admin.get_app()
    except ValueError:
        path = settings.firebase_service_account_path or os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
        options = {"projectId": settings.firebase_project_id} if settings.firebase_project_id else None
        if path:
            if not os.path.isfile(path):
                raise RuntimeError("Firebase service-account file not found; check backend/.env.")
            fb_app = firebase_admin.initialize_app(credentials.Certificate(path), options=options)
        else:
            fb_app = firebase_admin.initialize_app(options=options)
    return fb_app, firestore.client(app=fb_app)


firebase_app, db = initialize_firebase()
app = FastAPI(
    title="Nexus Shared API",
    version="2.0.0",
    description="Shared authentication, user profile, conversations and memory. Agent implementations are modular.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


async def current_user(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Firebase ID token required in Authorization: Bearer <token>.")
    try:
        claims = auth.verify_id_token(authorization.split(" ", 1)[1].strip(), check_revoked=True)
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid, expired, or revoked Firebase ID token.") from exc
    return {"uid": claims["uid"], "email": claims.get("email"), "name": claims.get("name"),
            "email_verified": claims.get("email_verified", False)}


def user_ref(uid: str):
    return db.collection("users").document(uid)


def owned_doc(uid: str, collection: str, doc_id: str):
    ref = user_ref(uid).collection(collection).document(doc_id)
    snap = ref.get()
    if not snap.exists:
        raise HTTPException(status_code=404, detail="Resource not found.")
    return ref, snap.to_dict() or {}


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    timezone: str | None = Field(default=None, max_length=80)
    preferences: dict[str, Any] | None = None
    goals: list[str] | None = None


class MemoryCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    category: str = "other"
    consented: bool = False


class MemoryUpdate(BaseModel):
    text: str | None = Field(default=None, min_length=1, max_length=2000)
    category: str | None = None


@app.get("/", include_in_schema=False)
async def root():
    return {"service": "Nexus Shared API", "docs": "/docs", "health": "/health"}


@app.get("/health", tags=["system"])
async def health():
    return {"ok": True, "service": "nexus-api", "utc": datetime.now(timezone.utc).isoformat()}


@app.get("/v1/me", tags=["account"])
async def get_me(user: dict = Depends(current_user)):
    snap = user_ref(user["uid"]).collection("profile").document("main").get()
    return {"user": user, "profile": snap.to_dict() if snap.exists else {}}


@app.patch("/v1/me/profile", tags=["account"])
async def update_profile(body: ProfileUpdate, user: dict = Depends(current_user)):
    data = body.model_dump(exclude_unset=True)
    data["updated_at"] = SERVER_TIMESTAMP
    user_ref(user["uid"]).collection("profile").document("main").set(data, merge=True)
    return {"ok": True}


# Shared message store: every agent uses the same conversation ID and message schema.
@app.get("/v1/conversations", tags=["shared-context"])
async def list_conversations(limit: int = Query(default=50, ge=1, le=100), user: dict = Depends(current_user)):
    docs = (user_ref(user["uid"]).collection("conversations")
            .order_by("updated_at", direction=firestore.Query.DESCENDING).limit(limit).stream())
    return {"items": [{"id": d.id, **(d.to_dict() or {})} for d in docs]}


@app.get("/v1/conversations/{conversation_id}/messages", tags=["shared-context"])
async def list_messages(conversation_id: str, limit: int = Query(default=500, ge=1, le=1000), user: dict = Depends(current_user)):
    conv_ref, _ = owned_doc(user["uid"], "conversations", conversation_id)
    docs = conv_ref.collection("messages").order_by("created_at").limit(limit).stream()
    return {"items": [{"id": d.id, **(d.to_dict() or {})} for d in docs]}


@app.delete("/v1/conversations/{conversation_id}", tags=["shared-context"])
async def delete_conversation(conversation_id: str, user: dict = Depends(current_user)):
    conv_ref, _ = owned_doc(user["uid"], "conversations", conversation_id)
    # Firestore does not cascade-delete subcollections.
    batch = db.batch()
    count = 0
    for msg in conv_ref.collection("messages").stream():
        batch.delete(msg.reference)
        count += 1
        if count % 400 == 0:
            batch.commit()
            batch = db.batch()
    batch.delete(conv_ref)
    batch.commit()
    return {"ok": True}


@app.get("/v1/memories", tags=["shared-context"])
async def list_memories(user: dict = Depends(current_user)):
    docs = (user_ref(user["uid"]).collection("memories")
            .order_by("updated_at", direction=firestore.Query.DESCENDING).limit(200).stream())
    return {"items": [{"id": d.id, **(d.to_dict() or {})} for d in docs]}


@app.post("/v1/memories", tags=["shared-context"])
async def create_memory(body: MemoryCreate, user: dict = Depends(current_user)):
    if not body.consented:
        raise HTTPException(status_code=400, detail="Explicit consent is required to save a memory.")
    ref = user_ref(user["uid"]).collection("memories").document()
    ref.set({"text": body.text.strip(), "category": body.category, "consented": True,
             "created_at": SERVER_TIMESTAMP, "updated_at": SERVER_TIMESTAMP})
    return {"id": ref.id, "ok": True}


@app.patch("/v1/memories/{memory_id}", tags=["shared-context"])
async def update_memory(memory_id: str, body: MemoryUpdate, user: dict = Depends(current_user)):
    ref, _ = owned_doc(user["uid"], "memories", memory_id)
    data = body.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields provided.")
    data["updated_at"] = SERVER_TIMESTAMP
    ref.update(data)
    return {"ok": True}


@app.delete("/v1/memories/{memory_id}", tags=["shared-context"])
async def delete_memory(memory_id: str, user: dict = Depends(current_user)):
    ref, _ = owned_doc(user["uid"], "memories", memory_id)
    ref.delete()
    return {"ok": True}



@app.delete("/v1/memories", tags=["shared-context"])
async def clear_memories(user: dict = Depends(current_user)):
    docs = list(user_ref(user["uid"]).collection("memories").stream())
    for start in range(0, len(docs), 400):
        batch = db.batch()
        for doc in docs[start:start + 400]:
            batch.delete(doc.reference)
        batch.commit()
    return {"ok": True, "deleted": len(docs)}


# Agent modules own their prompts, tools, provider fallback, and workflows.
# Keep main.py as the shared application shell; mount agents here without putting
# their implementation logic in this file.
# Specialist agents are isolated modules but share this app's verified Firebase
# identity, conversation collection, user profile and long-term memory collection.
try:
    from app.travel_agent import router as travel_router
    app.include_router(travel_router)
except ImportError as exc:
    print(f"[Nexus] Travel agent router not mounted: {exc}")

try:
    from app.tutor_agent import router as tutor_router
    app.include_router(tutor_router)
except ImportError as exc:
    print(f"[Nexus] Tutor agent router not mounted: {exc}")



# Third specialist: Builder Agent
try:
    from app.builder_agent import router as builder_router
    app.include_router(builder_router)
    print("[Nexus] Builder agent mounted successfully")
except ImportError as exc:
    print(f"[Nexus] Builder agent router not mounted: {exc}")


# Fourth specialist: Personal Assistant
from app.personal_agent import router as personal_router

app.include_router(personal_router)


# Unified entry point for frontend chat.
from app.orchestrator import router as orchestrator_router

app.include_router(orchestrator_router)

print("[Nexus] Unified orchestrator mounted at POST /v1/chat")

from fastapi import APIRouter

agents_router = APIRouter()

@agents_router.get("/v1/agents")
async def list_agents():
    return {
        "agents": [
            {"id": "personal", "name": "Personal Agent"},
            {"id": "tutor", "name": "Tutor Agent"},
            {"id": "builder", "name": "Builder Agent"},
            {"id": "travel", "name": "Travel Agent"},
        ]
    }

app.include_router(agents_router)