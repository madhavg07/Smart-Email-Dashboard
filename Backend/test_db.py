import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
db_url = os.getenv("DATABASE_URL")

# Remove the SQLAlchemy specific prefix for the raw psycopg2 test
if db_url.startswith("postgresql+psycopg2://"):
    db_url = db_url.replace("postgresql+psycopg2://", "postgresql://")

print(f"Attempting to connect to: {db_url.split('@')[1]}...")

try:
    conn = psycopg2.connect(db_url)
    print("✅ SUCCESS! Connected to Neon Database!")
    conn.close()
except Exception as e:
    print(f"❌ FAILED: {e}")