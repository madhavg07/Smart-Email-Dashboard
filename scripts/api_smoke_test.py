import json, urllib.request, urllib.error, os
import jwt
from dotenv import load_dotenv

BASE='http://127.0.0.1:8000'

# Load SECRET_KEY from Backend/.env and build a token without importing the app package
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'Backend', '.env'))
SECRET_KEY = os.getenv('SECRET_KEY', 'super_secret_dev_key')
TOKEN = jwt.encode({'sub': 'smoketest'}, SECRET_KEY, algorithm='HS256')
HEADERS = {'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'}


def http(path, method='GET', data=None):
    req = urllib.request.Request(BASE+path, method=method)
    for k,v in HEADERS.items():
        req.add_header(k,v)
    if data is not None:
        body = json.dumps(data).encode()
    else:
        body = None
    try:
        with urllib.request.urlopen(req, data=body, timeout=10) as resp:
            print(path, resp.status)
            print(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(path, 'HTTPError', e.code, e.read().decode())
    except Exception as e:
        print(path, 'ERR', e)


if __name__ == '__main__':
    print('TOKEN:', TOKEN)
    http('/health')
    http('/api/recipients/', 'GET')
    http('/api/recipients/', 'POST', {'email': 'smoke+1@example.com', 'name': 'Smoke Test'})
    http('/api/recipients/', 'GET')
