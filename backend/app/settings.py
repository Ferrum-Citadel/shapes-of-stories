import os
from dataclasses import dataclass, field


@dataclass
class Settings:
    database_url: str
    server_secret: str
    jev_mode: str = "synthetic"
    cors_origins: list[str] = field(default_factory=list)
    static_dir: str | None = None

    @classmethod
    def from_env(cls) -> Settings:
        return cls(
            database_url=os.environ["DATABASE_URL"],
            server_secret=os.environ["SERVER_SECRET"],
            jev_mode=os.environ.get("JEV_MODE", "synthetic"),
            cors_origins=[
                o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()
            ],
            static_dir=os.environ.get("STATIC_DIR"),
        )
