from google.cloud.firestore_v1 import SERVER_TIMESTAMP
from .firebase import db
from .config import settings
def user_ref(uid: str):
    return db.collection("users").document(uid)
def recent_memories(uid: str):
    docs = user_ref(uid).collection("memories").order_by("created_at", direction="DESCENDING").limit(settings.max_context_memories).stream()
    return [{"id":d.id,**d.to_dict()} for d in docs]
def save_memory(uid: str, text: str, category: str, consented: bool):
    if not consented: raise ValueError("Explicit consent is required to save long-term memory.")
    ref = user_ref(uid).collection("memories").document()
    ref.set({"text":text,"category":category,"consented":True,"created_at":SERVER_TIMESTAMP,"updated_at":SERVER_TIMESTAMP})
    return ref.id
def save_turn(uid: str, cid: str, role: str, content: str, mode: str):
    conv = user_ref(uid).collection("conversations").document(cid)
    conv.set({"updated_at":SERVER_TIMESTAMP},merge=True)
    conv.collection("messages").add({"role":role,"content":content,"mode":mode,"created_at":SERVER_TIMESTAMP})
