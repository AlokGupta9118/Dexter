from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from .firebase import verify_id_token
bearer = HTTPBearer(auto_error=False)
async def current_user(creds: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not creds or creds.scheme.lower() != "bearer":
        raise HTTPException(401, "Firebase Bearer token required")
    try:
        claims = verify_id_token(creds.credentials)
    except Exception:
        raise HTTPException(401, "Invalid or expired Firebase token")
    return {"uid": claims["uid"], "email": claims.get("email"), "name": claims.get("name")}
