from pydantic_settings import BaseSettings, SettingsConfigDict
class Settings(BaseSettings):
    firebase_project_id: str
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = ""
    llm_model: str = "gpt-4.1-mini"
    cors_origins: str = "http://localhost:5173"
    max_context_memories: int = 12
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    @property
    def allowed_origins(self):
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]
settings = Settings()
