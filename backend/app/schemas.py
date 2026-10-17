
from typing import Any, Literal
from pydantic import BaseModel, Field

Mode = Literal[
    "auto", "general", "tutor", "researcher",
    "builder", "travel", "personal"
]

class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=20000)

class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=20000)
    conversation_id: str | None = None
    mode: Mode = "auto"
    history: list[ChatTurn] = Field(default_factory=list, max_length=40)

conversation_name: str | None = Field(
    default=None,
    min_length=1,
    max_length=120,
)

class ConversationRename(BaseModel):
    name: str = Field(min_length=1, max_length=120)

class MemoryCreate(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    category: Literal[
        "preference", "goal", "habit",
        "context", "relationship", "other"
    ] = "other"
    consented: bool = False

class ActionRequest(BaseModel):
    kind: Literal["event", "reminder", "booking", "external_action"]
    title: str = Field(min_length=1, max_length=240)
    details: dict[str, Any] = Field(default_factory=dict)
    scheduled_at: str | None = None

class ApprovalDecision(BaseModel):
    approved: bool
    note: str | None = Field(default=None, max_length=1000)
