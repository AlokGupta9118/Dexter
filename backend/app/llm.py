import httpx
from .config import settings
async def complete(system: str, messages: list[dict]) -> str:
    if not settings.llm_api_key:
        return "Nexus API is connected, but no LLM provider is configured. Set LLM_API_KEY and LLM_MODEL in backend/.env."
    async with httpx.AsyncClient(timeout=httpx.Timeout(90, connect=10)) as client:
        response = await client.post(settings.llm_base_url.rstrip("/") + "/chat/completions",
          headers={"Authorization":f"Bearer {settings.llm_api_key}"},
          json={"model":settings.llm_model,"temperature":0.3,
                "messages":[{"role":"system","content":system},*messages]})
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
