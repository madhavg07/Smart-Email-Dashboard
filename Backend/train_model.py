import os
from dotenv import load_dotenv

# Force load the .env file BEFORE doing anything else
load_dotenv() 

import pandas as pd
import xgboost as xgb
import joblib
from app.models.database import SessionLocal, Recipient

db = SessionLocal()
print("Connected to database successfully. Fetching data...")

recipients = db.query(Recipient).all()

data = []
for r in recipients:
    data.append({
        'total_received': r.total_emails_received,
        'opens': r.total_opens,
        'clicks': r.total_clicks,
        'is_suppressed': r.is_suppressed
    })
db.close()

if len(data) == 0:
    print("No recipient data found in the database yet!")
else:
    df = pd.DataFrame(data)
    X = df[['total_received', 'opens', 'clicks']]
    y = df['is_suppressed']

    model = xgb.XGBClassifier(eval_metric='logloss')
    model.fit(X, y)

    joblib.dump(model, 'xgboost_suppression_model.pkl')
    print("Success! xgboost_suppression_model.pkl has been created.")