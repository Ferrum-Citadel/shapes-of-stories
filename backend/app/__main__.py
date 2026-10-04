import os

import uvicorn

from app.main import app_from_env

if __name__ == "__main__":
    uvicorn.run(
        app_from_env(),
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8000")),
        workers=1,
        proxy_headers=True,
        forwarded_allow_ips=os.environ.get("FORWARDED_ALLOW_IPS") or "127.0.0.1",
        log_level="info",
    )
