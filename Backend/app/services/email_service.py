"""
Email Sending Service
----------------------
- Injects 1×1 tracking pixel into HTML
- Rewrites links to go through click tracker
- Supports SendGrid, AWS SES, SMTP
- Used by Celery tasks for bulk sending
"""

import os
import uuid
import re
import logging
from typing import Optional
from datetime import datetime
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)

# Config — set in .env
EMAIL_PROVIDER = os.getenv("EMAIL_PROVIDER", "smtp")  # smtp | sendgrid | ses
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@mailpulse.dev")
FROM_NAME = os.getenv("FROM_NAME", "MailPulse")
BASE_URL = os.getenv("BASE_URL", "http://localhost:8000")

SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "")
AWS_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY", "")
AWS_SECRET_KEY = os.getenv("AWS_SECRET_KEY", "")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")


def inject_tracking_pixel(html_body: str, tracking_token: str) -> str:
    """Insert a 1×1 invisible tracking pixel before </body>."""
    pixel_url = f"{BASE_URL}/pixel/{tracking_token}"
    pixel_tag = f'<img src="{pixel_url}" width="1" height="1" style="display:none;border:0;" alt="" />'

    if "</body>" in html_body.lower():
        html_body = re.sub(r"</body>", f"{pixel_tag}</body>", html_body, flags=re.IGNORECASE)
    else:
        html_body += pixel_tag

    return html_body


def rewrite_links(html_body: str, send_log_id: str, recipient_id: str, campaign_id: str, db) -> str:
    """Replace all href links with tracked redirect URLs."""
    from app.models.database import ClickEvent

    def replace_link(match):
        original_url = match.group(1)
        # Skip mailto, pixel urls, unsubscribe links
        if original_url.startswith("mailto:") or "/pixel/" in original_url or "/r/" in original_url:
            return match.group(0)

        click_token = str(uuid.uuid4())

        # Store the click token mapping
        click_record = ClickEvent(
            send_log_id=send_log_id,
            recipient_id=recipient_id,
            campaign_id=campaign_id,
            original_url=original_url,
            click_token=click_token,
        )
        db.add(click_record)

        tracked_url = f"{BASE_URL}/r/{click_token}"
        return f'href="{tracked_url}"'

    html_body = re.sub(r'href="([^"]+)"', replace_link, html_body)
    return html_body


def build_html_email(body_html: str, subject: str, recipient_name: str = "") -> str:
    """Wrap the body in a clean, minimal email HTML template."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>{subject}</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background:#f6f9fc; margin:0; padding:0; }}
    .wrapper {{ max-width:600px; margin:40px auto; background:#fff;
                border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.08); }}
    .header {{ background:#0f172a; padding:24px 32px; }}
    .header h1 {{ color:#fff; margin:0; font-size:20px; font-weight:600; }}
    .body {{ padding:32px; color:#1e293b; line-height:1.7; font-size:15px; }}
    .footer {{ background:#f1f5f9; padding:16px 32px; font-size:12px;
               color:#94a3b8; border-top:1px solid #e2e8f0; }}
    a {{ color:#6366f1; }}
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header"><h1>MailPulse</h1></div>
    <div class="body">{body_html}</div>
    <div class="footer">
      You received this email because you opted in. 
      <a href="{{unsubscribe_link}}">Unsubscribe</a>
    </div>
  </div>
</body>
</html>"""


async def send_email_smtp(
    to_email: str,
    to_name: str,
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
) -> bool:
    """Send a single email via SMTP."""
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{FROM_NAME} <{FROM_EMAIL}>"
        msg["To"] = f"{to_name} <{to_email}>"

        if text_body:
            msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(FROM_EMAIL, to_email, msg.as_string())

        logger.info(f"Email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"SMTP error sending to {to_email}: {e}")
        return False


async def send_email_sendgrid(
    to_email: str,
    to_name: str,
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
) -> bool:
    """Send via SendGrid HTTP API."""
    import httpx
    try:
        # 1. Dynamically build the content array to avoid empty strings
        email_content = []
        if text_body:
            email_content.append({"type": "text/plain", "value": text_body})
            
        email_content.append({"type": "text/html", "value": html_body})

        # 2. Build the payload safely
        payload = {
            "personalizations": [{"to": [{"email": to_email, "name": to_name}]}],
            "from": {"email": FROM_EMAIL, "name": FROM_NAME},
            "subject": subject,
            "content": email_content,
        }
        
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://api.sendgrid.com/v3/mail/send",
                headers={"Authorization": f"Bearer {SENDGRID_API_KEY}"},
                json=payload,
                timeout=10,
            )
            if resp.status_code in (200, 202):
                logger.info(f"SendGrid: sent to {to_email}")
                return True
            else:
                logger.error(f"SendGrid error: {resp.status_code} {resp.text}")
                return False
    except Exception as e:
        logger.error(f"SendGrid exception: {e}")
        return False

async def send_single_email(
    to_email: str,
    to_name: str,
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
) -> bool:
    """Dispatch email via configured provider."""
    if EMAIL_PROVIDER == "sendgrid":
        return await send_email_sendgrid(to_email, to_name, subject, html_body, text_body)
    else:
        return await send_email_smtp(to_email, to_name, subject, html_body, text_body)
