# ✉️ MailPulse — AI Email Intelligence Dashboard

A full-stack email campaign platform with ML engagement scoring, AI personalization, 1×1 pixel tracking, A/B testing, and automated recipient suppression.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        MailPulse                            │
├──────────────┬───────────────────────┬───────────────────── │
│   Frontend   │      Backend API      │   Background Jobs    │
│  React/Vite  │  FastAPI (Python)     │  Celery + Redis      │
│  Port 3000   │  Port 8000            │                      │
├──────────────┴───────────────────────┴──────────────────────┤
│              PostgreSQL (persistent storage)                 │
│              Redis (task queue + cache)                      │
└─────────────────────────────────────────────────────────────┘
```

### Email Tracking Flow
```
Send Campaign
     │
     ▼
Celery Worker
     │
     ├── AI Personalizes subject/body per recipient
     ├── Injects 1×1 tracking pixel  → GET /pixel/{token}
     ├── Rewrites all links          → GET /r/{click_token}
     └── Sends via SMTP/SendGrid/SES
     
Recipient opens email
     │
     ▼
Email client downloads pixel image
     │
     ▼
/pixel/{token} → logs OpenEvent → updates seriousness score
```

---

## 🚀 Quick Start

### Option A: Docker (recommended)

```bash
git clone <your-repo>
cd email-dashboard

# Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your API keys and email credentials

# Start everything
docker compose up --build
```

- Frontend: http://localhost:3000
- API docs: http://localhost:8000/docs

### Option B: Manual

**Prerequisites:** Python 3.12+, Node 20+, PostgreSQL, Redis

```bash
# 1. Backend (Linux / macOS)
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env       # Fill in your config
uvicorn app.main:app --reload

# 1a. Backend (PowerShell)
cd backend
python -m venv venv
# Activate venv
.\venv\Scripts\Activate.ps1
# If execution policy blocks scripts (runs just for this session):
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload

# 1b. Backend (CMD)
cd backend
python -m venv venv
venv\Scripts\activate.bat
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload

# 2. Celery worker (new terminal)
# PowerShell
cd backend
.\venv\Scripts\Activate.ps1
# On Windows, use the solo pool to avoid billiard semaphore permission issues:
celery -A celery_tasks.tasks worker --loglevel=info --pool=solo --concurrency=1

# CMD
cd backend
venv\Scripts\activate.bat
# On Windows, use the solo pool to avoid billiard semaphore permission issues:
celery -A celery_tasks.tasks worker --loglevel=info --pool=solo --concurrency=1

# 3. Celery beat scheduler (new terminal)
# PowerShell
cd backend
.\venv\Scripts\Activate.ps1
celery -A celery_tasks.tasks beat --loglevel=info

# CMD
cd backend
venv\Scripts\activate.bat
celery -A celery_tasks.tasks beat --loglevel=info

# 4. Frontend (new terminal)
cd frontend
npm install
npm run dev
```

---

## ⚙️ Configuration (`backend/.env`)

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | ✅ |
| `REDIS_URL` | Redis connection string | ✅ |
| `AI_PROVIDER` | `anthropic` or `openai` | ✅ |
| `ANTHROPIC_API_KEY` | Your Anthropic API key | ✅ (if anthropic) |
| `OPENAI_API_KEY` | Your OpenAI API key | ✅ (if openai) |
| `EMAIL_PROVIDER` | `smtp` or `sendgrid` | ✅ |
| `SMTP_USER` | Gmail address | ✅ (if smtp) |
| `SMTP_PASS` | Gmail App Password | ✅ (if smtp) |
| `SENDGRID_API_KEY` | SendGrid key | ✅ (if sendgrid) |
| `BASE_URL` | Your server's public URL | ✅ |
| `FROM_EMAIL` | Sender email address | ✅ |

> **Gmail SMTP Note:** Use an [App Password](https://support.google.com/accounts/answer/185833), not your real password. Enable 2FA first.

---

## 📡 API Endpoints

### Campaigns
| Method | Path | Description |
|---|---|---|
| GET | `/api/campaigns/` | List all campaigns |
| POST | `/api/campaigns/` | Create campaign |
| POST | `/api/campaigns/{id}/send` | Queue campaign for sending |
| DELETE | `/api/campaigns/{id}` | Delete campaign |

### Recipients
| Method | Path | Description |
|---|---|---|
| GET | `/api/recipients/` | List all recipients |
| POST | `/api/recipients/` | Add recipient |
| POST | `/api/recipients/bulk` | Bulk import |
| PATCH | `/api/recipients/{id}/suppress` | Suppress/restore |

### AI Tools
| Method | Path | Description |
|---|---|---|
| POST | `/api/ai/personalize` | Personalize subject+body |
| POST | `/api/ai/ab-variants` | Generate A/B subject lines |
| POST | `/api/ai/spam-check` | Spam risk analysis |
| POST | `/api/ai/send-time` | Optimal send time |

### Analytics
| Method | Path | Description |
|---|---|---|
| GET | `/api/analytics/overview` | Dashboard stats |
| GET | `/api/analytics/opens-over-time` | Open trend data |
| GET | `/api/analytics/top-campaigns` | Top performing |

### Tracking (auto)
| Method | Path | Description |
|---|---|---|
| GET | `/pixel/{token}` | 1×1 open tracking pixel |
| GET | `/r/{token}` | Click redirect + logging |

Full interactive docs: `http://localhost:8000/docs`

---

## 🤖 ML Seriousness Scoring

Each recipient gets a **0.0–1.0 engagement score** recalculated on every open/click:

| Score | Label | Description |
|---|---|---|
| ≥ 0.75 | 🔥 Hot | Opens, clicks, recent activity |
| ≥ 0.50 | ☀️ Warm | Occasional engagement |
| ≥ 0.25 | 🌧 Cold | Rarely engages |
| < 0.25 | 💤 Inactive | Auto-suppressed after 3+ emails |

**Features used:**
- `open_rate` = opens ÷ emails received (weight: 30%)
- `click_rate` = clicks ÷ emails received (weight: 35%)
- `click_open_ratio` = clicks ÷ opens (weight: 20%)
- `recency_bonus` = opened in last 7 days (weight: 15%)

Auto-suppression kicks in when score < 0.20 and they've received 3+ emails.

---

## 🧪 A/B Testing Flow

```
Campaign Recipients (100%)
        │
   ┌────┴────┐
   │ Shuffle │
   └────┬────┘
        │
   ┌────┼──────────┐
  10%  10%  10%   70%
   A    B    C   (held)
        │
   [Send A, B, C]
        │
   [Wait 1 hour — Celery scheduled task]
        │
   [Check open rates → pick winner]
        │
   [Send winner to remaining 70%]
```

---

## 📁 Project Structure

```
email-dashboard/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + pixel/click routes
│   │   ├── api/
│   │   │   ├── campaigns.py     # Campaign CRUD + send
│   │   │   ├── recipients.py    # Recipient management
│   │   │   ├── tracking.py      # Event queries
│   │   │   ├── ai_tools.py      # AI endpoints
│   │   │   └── analytics.py     # Dashboard stats
│   │   ├── models/
│   │   │   └── database.py      # SQLAlchemy models
│   │   ├── services/
│   │   │   ├── email_service.py # Send + pixel injection
│   │   │   ├── tracking_service.py # Open/click logging
│   │   │   └── ai_service.py    # LLM calls
│   │   └── ml/
│   │       └── scorer.py        # Engagement ML scorer
│   ├── celery_tasks/
│   │   └── tasks.py             # Bulk send, A/B check, nightly rescore
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Full dashboard (all pages)
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
└── docker-compose.yml
```

---

## 💡 Future Enhancements

- **Predictive send-time**: Schedule emails per recipient based on historical open timestamps
- **XGBoost scorer**: Replace weighted formula with trained ML model
- **CSV bulk import UI**: Drag & drop recipient list upload
- **Unsubscribe flow**: Auto-generate unsubscribe links per recipient
- **Webhook integrations**: Slack/Discord alerts on campaign milestones
- **Template library**: Save and reuse email templates
- **Domain warmup**: Gradually ramp sending volume for new domains

---

## 📚 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Recharts |
| Backend | Python 3.12, FastAPI, SQLAlchemy |
| Database | PostgreSQL 16 |
| Queue | Celery 5, Redis 7 |
| AI | Anthropic Claude / OpenAI GPT-4o |
| Email | SMTP / SendGrid / AWS SES |
| Containers | Docker + Docker Compose |
