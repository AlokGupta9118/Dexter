from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException

from app.main import current_user, user_ref
from app.modes import route_mode
from app.schemas import ChatRequest

router = APIRouter(tags=["unified-chat"])


def _default_conversation_name(message: str) -> str:
    """Create a readable default title from the first user message."""
    name = " ".join(message.split()).strip()
    return name[:60].rstrip() or "New conversation"


@router.post("/v1/chat")
async def unified_chat(
    body: ChatRequest,
    user: dict = Depends(current_user),
):
    uid = user["uid"]
    conversation_id = body.conversation_id
    previous_mode = None
    conversation_name = None
    snapshot = None

    conversations_ref = user_ref(uid).collection("conversations")

    # Continue an existing conversation only if it belongs to this user.
    # conversations_ref is scoped to the authenticated user's document.
    if conversation_id:
        conv_ref = conversations_ref.document(conversation_id)
        snapshot = conv_ref.get()

        if snapshot.exists:
            conversation = snapshot.to_dict() or {}
            previous_mode = (
                conversation.get("last_agent")
                or conversation.get("last_mode")
            )
            conversation_name = conversation.get("name")
        else:
            # Missing conversation: start a new one instead of returning 404.
            conversation_id = str(uuid4())
            conv_ref = conversations_ref.document(conversation_id)
            snapshot = None
    else:
        conversation_id = str(uuid4())
        conv_ref = conversations_ref.document(conversation_id)

    # Optional user-provided name (add conversation_name to ChatRequest).
    # Only apply it if the conversation does not already have a saved name.
    requested_name = getattr(body, "conversation_name", None)
    if isinstance(requested_name, str):
        requested_name = " ".join(requested_name.split()).strip()
    else:
        requested_name = ""

    if not conversation_name:
        conversation_name = (
            requested_name[:120]
            if requested_name
            else _default_conversation_name(body.message)
        )

    # Merge metadata so existing agent-written fields are preserved.
    metadata = {"name": conversation_name}
    if snapshot is None or not snapshot.exists:
        metadata["created_at"] = datetime.now(timezone.utc).isoformat()
    conv_ref.set(metadata, merge=True)

    selected_mode = route_mode(
        body.message,
        previous_mode=previous_mode,
        requested_mode=body.mode,
    )

    history = [
        {"role": turn.role, "content": turn.content}
        for turn in body.history[-30:]
    ]

    try:
        if selected_mode == "tutor":
            from app.tutor_agent import tutor_chat, TutorChatRequest

            result = await tutor_chat(
                TutorChatRequest(
                    message=body.message,
                    conversation_id=conversation_id,
                    history=history,
                ),
                user,
            )

        elif selected_mode == "travel":
            from app.travel_agent import travel_chat, TravelChatRequest

            result = await travel_chat(
                TravelChatRequest(
                    message=body.message,
                    conversation_id=conversation_id,
                    history=history,
                ),
                user,
            )

        elif selected_mode == "builder":
            from app.builder_agent import builder_chat, BuilderChatRequest

            result = await builder_chat(
                BuilderChatRequest(
                    message=body.message,
                    conversation_id=conversation_id,
                    history=history,
                ),
                user,
            )

        elif selected_mode == "personal":
            from app.personal_agent import (
                personal_chat,
                ChatRequest as PersonalChatRequest,
            )

            result = await personal_chat(
                PersonalChatRequest(
                    message=body.message,
                    conversation_id=conversation_id,
                    history=history,
                ),
                user,
            )

        elif selected_mode in {"general", "researcher"}:
            from app.general_agent import answer_general

            answer = await answer_general(
                uid=uid,
                conversation_id=conversation_id,
                message=body.message,
                mode=selected_mode,
                history=history,
            )

            result = {
                "conversation_id": conversation_id,
                "agent": selected_mode,
                "answer": answer,
            }

        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported mode: {selected_mode}",
            )

    except HTTPException:
        raise

    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Could not load the {selected_mode} agent.",
        ) from exc

    if not isinstance(result, dict):
        raise HTTPException(
            status_code=502,
            detail="The selected agent returned an invalid response.",
        )

    result["mode"] = selected_mode
    result.setdefault("agent", selected_mode)
    result["conversation_id"] = conversation_id
    result["conversation_name"] = conversation_name

    return result
