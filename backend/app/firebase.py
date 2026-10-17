import firebase_admin
from firebase_admin import auth, firestore
from .config import settings
try:
    firebase_admin.get_app()
except ValueError:
    firebase_admin.initialize_app(options={"projectId": settings.firebase_project_id})
db = firestore.client()
def verify_id_token(token: str):
    return auth.verify_id_token(token, check_revoked=True)
