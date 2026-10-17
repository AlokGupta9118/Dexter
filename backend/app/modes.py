
import re
from typing import Optional

MODE_SYSTEMS = {
    "general": "You are Nexus General, a helpful general assistant. Be honest about uncertainty.",
    "tutor": "You are Nexus Tutor. Teach patiently in steps, explain why, use examples, and check understanding.",
    "researcher": "You are Nexus Researcher. Separate facts from assumptions. Never fabricate sources; disclose when live browsing is unavailable.",
    "builder": "You are Nexus Builder. Help implement, debug, test, and document software with concrete code and security notes.",
    "travel": "You are Nexus Travel. Plan realistic trips. Never claim a booking is complete without verified provider confirmation. Require explicit approval before purchases or reservations.",
    "personal": "You are Nexus Personal, a privacy-conscious assistant for user-approved goals, routines, events, reminders, and personal context. Do not infer sensitive traits.",
}

PATTERNS = [
    ("travel", r"\b(trip|travel|hotel|flight|itinerary|booking|book a table|reservation|vacation|train ticket|bus ticket|destination)\b"),
    ("tutor", r"\b(explain|teach me|learn|tutor|homework|study|quiz|concept|leetcode|dynamic programming|algorithm|what is|how does)\b"),
    ("builder", r"\b(code|debug|implement|build|frontend|backend|api|react|python|typescript|deploy|bug|stack trace|refactor|database schema)\b"),
    ("researcher", r"\b(research|compare|sources|evidence|latest|investigate|analysis|literature review|find papers|fact check)\b"),
    ("personal", r"\b(remind me|reminder|calendar|event|my goal|my routine|remember that|personal assistant|plan my week|relationship|my health|my habit|daily plan)\b"),
]

VALID_MODES = {"general", "tutor", "researcher", "builder", "travel", "personal"}

# Short follow-ups generally belong to the previous specialist.
FOLLOW_UP = re.compile(
    r"^\s*(continue|go on|explain more|elaborate|why|how so|"
    r"make it shorter|make it simpler|the first one|the second one|"
    r"yes|no|okay|ok|do that|try again|what about that)\s*[.!?]*\s*$",
    re.IGNORECASE,
)


def route_mode(
    message: str,
    previous_mode: Optional[str] = None,
    requested_mode: str = "auto",
) -> str:
    """
    Select a specialist deterministically.

    An explicit valid mode wins. For short follow-ups, keep the previous mode.
    Otherwise score the message against specialist patterns.
    """
    requested_mode = (requested_mode or "auto").lower().strip()

    if requested_mode in VALID_MODES:
        return requested_mode

    text = (message or "").strip().lower()

    if previous_mode in VALID_MODES and FOLLOW_UP.fullmatch(text):
        return previous_mode

    scores = {
        mode: sum(
            len(re.findall(pattern, text))
            for pattern_mode, pattern in PATTERNS
            if pattern_mode == mode
        )
        for mode in VALID_MODES
    }

    highest = max(scores.values(), default=0)
    if highest == 0:
        return previous_mode if previous_mode in VALID_MODES else "general"

    # Stable priority when multiple categories match.
    priority = ["travel", "builder", "tutor", "researcher", "personal", "general"]
    candidates = [mode for mode, score in scores.items() if score == highest]

    if previous_mode in candidates:
        return previous_mode

    return next(mode for mode in priority if mode in candidates)
