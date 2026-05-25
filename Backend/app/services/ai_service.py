"""
AI Tools Service
-----------------
Uses OpenAI/Anthropic API to:
  1. Rephrase email body/subject for a specific recipient persona
  2. Generate A/B test variants
  3. Check spam score heuristics
  4. Suggest optimal send time

Set OPENAI_API_KEY or ANTHROPIC_API_KEY in your .env
"""

import os
import json
import httpx
import logging
from typing import Optional
import json


logger = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
AI_PROVIDER = os.getenv("AI_PROVIDER", "anthropic")  # "openai" | "anthropic"


async def call_llm(prompt: str, system: str = "") -> str:
    """Unified LLM caller supporting OpenAI and Anthropic."""
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
    # Groq works best when a system prompt is always provided
    if system:
        messages.append({"role": "system", "content": system})
    else:
        messages.append({"role": "system", "content": "You are a helpful AI assistant. Respond only with valid JSON."})
        
    messages.append({"role": "user", "content": prompt})

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
            # Updated to Groq's newest, most stable model
            json={"model": "llama-3.1-8b-instant", "messages": messages, "max_tokens": 1500},
        )
        
        # If Groq gets mad, this will throw the exact error to your frontend toast!
        if resp.status_code != 200:
            raise ValueError(f"Groq API Error: {resp.text}")
            
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]

async def personalize_email(subject: str, body: str, recipient_name: str, recipient_role: str = None, recipient_industry: str = None, recipient_company: str = None) -> dict:
    prompt = f"""
    Rewrite this email to personalize it for {recipient_name}.
    Role: {recipient_role}
    Industry: {recipient_industry}
    Company: {recipient_company}
    
    Original Subject: {subject}
    Original Body: {body}
    
    Respond ONLY with a valid JSON object containing "subject" and "body" keys. Do not include markdown formatting.
    """
    raw = await call_llm(prompt, "You are an expert email marketer. Output strictly in JSON format.")
    
    # Safety net: Strip markdown blocks if Groq adds them!
    raw = raw.strip().strip("```json").strip("```").strip()
    return json.loads(raw)

async def generate_ab_variants(subject: str, body: str, num_variants: int = 3) -> list:
    prompt = f"""
    Create {num_variants} different A/B test variants for this email.
    Original Subject: {subject}
    Original Body: {body}
    
    Respond ONLY with a valid JSON array of objects. Each object must have "subject", "angle", and "rationale". Do not include markdown formatting.
    """
    raw = await call_llm(prompt, "You are a conversion copywriter. Output strictly in JSON array format.")
    
    # Safety net: Strip markdown blocks
    raw = raw.strip().strip("```json").strip("```").strip()
    return json.loads(raw)

# async def generate_ab_variants(subject: str, body: str, num_variants: int = 3) -> list:
#     """
#     Generate N subject line variants for A/B testing.
#     Returns list of {"subject": "...", "rationale": "..."}
#     """
#     prompt = f"""Generate {num_variants} distinct subject line variants for A/B testing this email.

# ORIGINAL SUBJECT: {subject}

# EMAIL BODY SUMMARY:
# {body[:500]}

# For each variant, use a different psychological angle:
# - Curiosity gap
# - Direct benefit / ROI
# - Urgency / scarcity
# - Social proof / numbers
# - Question format

# Respond ONLY with valid JSON array, no markdown:
# [{{"subject": "...", "angle": "...", "rationale": "..."}}]"""

#     raw = await call_llm(prompt)
#     raw = raw.strip().strip("```json").strip("```").strip()
#     return json.loads(raw)


async def check_spam_score(subject: str, body: str) -> dict:
    """
    Heuristically score the email for spam likelihood.
    Returns {"score": 0-10, "issues": [...], "suggestions": [...]}
    """
    prompt = f"""Analyze this email for spam filter risk. Be a spam filter expert.

SUBJECT: {subject}

BODY:
{body[:1000]}

Check for:
- Spam trigger words (FREE, GUARANTEED, ACT NOW, etc.)
- Excessive capitalization
- Too many exclamation marks
- Missing unsubscribe language
- Suspicious link patterns
- Overly promotional language
- Subject line length (should be 30-60 chars)

Respond ONLY with valid JSON, no markdown:
{{"score": <0-10, where 10=definitely spam>, "issues": ["issue1", ...], "suggestions": ["fix1", ...]}}"""

    raw = await call_llm(prompt)
    raw = raw.strip().strip("```json").strip("```").strip()
    return json.loads(raw)


async def suggest_send_time(recipient_open_history: list) -> dict:
    """
    Given a list of past open timestamps, suggest the best send time.
    recipient_open_history: list of ISO datetime strings
    """
    if not recipient_open_history:
        return {"recommended_hour": 9, "recommended_day": "Tuesday", "confidence": "low", "reason": "No history available, using industry defaults"}

    prompt = f"""Analyze these email open timestamps and suggest the best time to send future emails.

Open timestamps (UTC): {json.dumps(recipient_open_history[:20])}

Identify:
- Most common hour of day they open emails
- Most common day of week
- Any patterns (morning checker? lunch reader? evening reader?)

Respond ONLY with valid JSON:
{{"recommended_hour": <0-23>, "recommended_day": "Monday|Tuesday|...", "confidence": "high|medium|low", "reason": "..."}}"""

    raw = await call_llm(prompt)
    raw = raw.strip().strip("```json").strip("```").strip()
    return json.loads(raw)
