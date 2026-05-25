from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import base64
import logging

from Backend.app.api import groups
from app.api import campaigns, recipients, tracking, ai_tools, analytics, webhooks, auth
from app.models.database import engine, Base
from app.services.auth_services import get_current_user
from fastapi import Depends

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create all tables
try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    logger.warning("Could not create DB tables on startup (continuing without DB): %s", e)

app = FastAPI(
    title="MailPulse API",
    description="AI-powered email campaign dashboard with ML engagement tracking",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://smart-email-dashboard.vercel.app", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(campaigns.router, prefix="/api/campaigns", tags=["campaigns"], dependencies=[Depends(get_current_user)])
app.include_router(recipients.router, prefix="/api/recipients", tags=["recipients"], dependencies=[Depends(get_current_user)])
app.include_router(tracking.router, prefix="/api/tracking", tags=["tracking"])
app.include_router(ai_tools.router, prefix="/api/ai", tags=["ai"], dependencies=[Depends(get_current_user)])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"], dependencies=[Depends(get_current_user)])
app.include_router(webhooks.router, prefix="/api/webhooks", tags=["webhooks"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(groups.router, prefix="/api/groups", tags=["groups"])


# 1x1 transparent PNG pixel (base64)
TRACKING_PIXEL = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)

@app.get("/pixel/{token}")
async def tracking_pixel(token: str, request: Request):
    """Serve the 1x1 tracking pixel and log the open event."""
    from app.services.tracking_service import log_pixel_hit
    await log_pixel_hit(token, request)
    return Response(
        content=TRACKING_PIXEL,
        media_type="image/png",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        }
    )

@app.get("/r/{token}")
async def click_redirect(token: str, request: Request):
    """Log click and redirect to original URL."""
    from app.services.tracking_service import log_click_and_redirect
    redirect_url = await log_click_and_redirect(token, request)
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=redirect_url)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "MailPulse API"}
