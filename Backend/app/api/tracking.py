from fastapi import APIRouter, Request
from fastapi.responses import Response, RedirectResponse
from app.services.tracking_service import log_pixel_hit, log_click_and_redirect

router = APIRouter()

@router.get("/pixel/{token}")
async def track_open(token: str, request: Request):
    await log_pixel_hit(token, request)
    
    # THE MAGIC ARMOR: Forbids Gmail/Apple from caching the pixel
    headers = {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0"
    }
    
    return Response(
        content=b"\x47\x49\x46\x38\x39\x61\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00\x21\xf9\x04\x01\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b", 
        media_type="image/gif",
        headers=headers  # <-- Attach headers here!
    )

@router.get("/r/{click_token}")
async def track_click(click_token: str, request: Request):
    original_url = await log_click_and_redirect(click_token, request)
    return RedirectResponse(url=original_url)