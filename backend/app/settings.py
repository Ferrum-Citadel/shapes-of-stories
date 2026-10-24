import os
from dataclasses import dataclass, field


@dataclass
class Settings:
    database_url: str
    server_secret: str
    jev_mode: str = "synthetic"
    cors_origins: list[str] = field(default_factory=list)
    static_dir: str | None = None
    client_ip_header: str | None = None

    @classmethod
    def from_env(cls) -> Settings:
        secret = os.environ.get("SERVER_SECRET", "")
        # The example value is public, so anything encrypted under it is readable by anyone.
        if not secret or secret.startswith("change-me"):
            raise SystemExit("SERVER_SECRET is empty or the example value: set it to a secret")
        return cls(
            database_url=os.environ["DATABASE_URL"],
            server_secret=secret,
            jev_mode=os.environ.get("JEV_MODE", "synthetic"),
            cors_origins=[
                o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()
            ],
            static_dir=os.environ.get("STATIC_DIR"),
            client_ip_header=os.environ.get("CLIENT_IP_HEADER") or None,
        )
