import os
import json
import httpx
import logging
import asyncio
import re
from typing import Optional

logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
AI_PROVIDER = os.getenv("AI_PROVIDER", "anthropic")

def extract_safe_json(raw_text: str):
    """Bulletproof JSON extractor that survives AI hallucinations and literal newlines."""
    try:
        clean = raw_text.strip().strip("```json").strip("```").strip()
        # ADD strict=False right here!
        return json.loads(clean, strict=False) 
    except json.JSONDecodeError:
        logger.warning("Standard JSON parse failed, attempting Regex extraction.")
        match = re.search(r'(\{.*\}|\[.*\])', raw_text, re.DOTALL)
        if match:
            try:
                # ADD strict=False here too!
                return json.loads(match.group(1), strict=False)
            except Exception as e:
                logger.error(f"Regex JSON parse failed: {str(e)}")
        
        raise ValueError(f"AI failed to return valid JSON. Raw output: {raw_text}")

async def call_llm(prompt: str, system: str = "") -> str:
    if AI_PROVIDER == "anthropic" and ANTHROPIC_API_KEY:
        return await _call_anthropic(prompt, system)
    elif OPENAI_API_KEY:
        return await _call_openai(prompt, system)
    else:
        raise ValueError("No AI API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.")

async def _call_anthropic(prompt: str, system: str) -> str:
    async with httpx.AsyncClient(timeout=30) as client:
        payload = {
            "model": "claude-sonnet-4-20250514",
            "max_tokens": 1500,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            payload["system"] = system

        resp = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["content"][0]["text"]

async def _call_openai(prompt: str, system: str) -> str:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    else:
        messages.append({"role": "system", "content": "You are a helpful AI assistant. Respond only with valid JSON."})
        
    messages.append({"role": "user", "content": prompt})

    async with httpx.AsyncClient(timeout=30) as client:
        # Retries for BOTH Rate Limits (429) AND Server Overloads (500, 502, 503)
        for attempt in range(3):
            resp = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                json={"model": "llama-3.1-8b-instant", "messages": messages, "max_tokens": 1500},
            )
            
            if resp.status_code in [429, 500, 502, 503, 529]:
                logger.warning(f"Groq API Overloaded/Rate Limited (HTTP {resp.status_code}). Retrying in 2.5s...")
                await asyncio.sleep(2.5)
                continue
                
            if resp.status_code != 200:
                raise ValueError(f"Groq API Error: {resp.text}")
                
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]
            
        raise ValueError("Groq API failed after 3 retries. The servers are currently too busy.")
import re

def ensure_html_links(text: str) -> str:
    """Fallback: Forcefully convert any raw (https://...) into an HTML <a> tag so tracking works!"""
    # Finds URLs inside parentheses (https://...) or raw URLs and wraps them in HTML
    url_pattern = r'(?<!href=")(https?://[^\s<)\]]+)'
    return re.sub(url_pattern, r'<a href="\1">\1</a>', text)

async def personalize_email(subject: str, body: str, recipient_name: str, recipient_role: str = None, recipient_industry: str = None, recipient_company: str = None) -> dict:
    prompt = f"Rewrite this FULL email to personalize it for {recipient_name}.\n"
    if recipient_role: prompt += f"Role: {recipient_role}\n"
    if recipient_industry: prompt += f"Industry: {recipient_industry}\n"
    if recipient_company: prompt += f"Company: {recipient_company}\n"
        
    prompt += f"\nOriginal Subject: {subject}\nOriginal Body: {body}\n\nRespond ONLY with a valid JSON object containing 'subject' and 'body' keys."
    
    system = f"""
    You are a professional email assistant. Your job is to slightly personalize the provided email draft for a specific recipient.

    Here are the strict rules for the identities:
    1. THE RECIPIENT: Their name is {recipient_name}. If provided, they work at {recipient_company} as a {recipient_role}.
    2. THE SENDER: You represent the sender. You DO NOT work at {recipient_company}. 
    3. RULE: Never start the email with "Greetings from {recipient_company}". 
    4. RULE: Do not change the core meaning or links of the original draft.

    If you mention their company, do it naturally in the context of the recipient (e.g., "I hope things are going well at {recipient_company}").
    """
    raw = await call_llm(prompt, system)
    data = extract_safe_json(raw)
    data['body'] = ensure_html_links(data.get('body', '')) # Force link conversion
    return data

async def generate_ab_variants(subject: str, body: str, num_variants: int = 3) -> list:
    prompt = f"""
    Create {num_variants} different A/B test variants for this email.
    Original Subject: {subject}
    Original Body: {body}
    
    Respond ONLY with a valid JSON array of objects. Each object must have "subject", "body", "angle", and "rationale".
    """
    system = """
    You are a conversion copywriter. Output strictly in JSON array format.
    CRITICAL INSTRUCTIONS:
    1. FULL LENGTH: The "body" MUST contain the FULL email. DO NOT summarize it into a single line. Keep all bullet points and details.
    2. HTML FORMATTING: The "body" MUST be formatted as structured HTML using <p>, <ul>, <li>, and <strong>.
    3. LINK CONSERVATION: You MUST wrap all URLs in <a href="..."> HTML tags.
    """
    raw = await call_llm(prompt, system)
    variants = extract_safe_json(raw)
    for v in variants:
        v['body'] = ensure_html_links(v.get('body', '')) # Force link conversion
    return variants

async def check_spam_score(subject: str, body: str) -> dict:
    prompt = f"""Analyze this email for spam filter risk. Be a spam filter expert.
    SUBJECT: {subject}
    BODY: {body[:1000]}
    Respond ONLY with valid JSON:
    {{"score": <0-10, where 10=definitely spam>, "issues": ["issue1", ...], "suggestions": ["fix1", ...]}}"""
    raw = await call_llm(prompt)
    return extract_safe_json(raw)

async def suggest_send_time(recipient_open_history: list) -> dict:
    if not recipient_open_history:
        return {"recommended_hour": 9, "recommended_day": "Tuesday", "confidence": "low", "reason": "No history available"}
    prompt = f"""Analyze these email open timestamps and suggest the best time to send future emails.
    Open timestamps (UTC): {json.dumps(recipient_open_history[:20])}
    Respond ONLY with valid JSON:
    {{"recommended_hour": <0-23>, "recommended_day": "Monday|Tuesday|...", "confidence": "high|medium|low", "reason": "..."}}"""
    raw = await call_llm(prompt)
    return extract_safe_json(raw)