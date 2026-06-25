import subprocess
import sys

def main():
    print("Starting Celery Worker...")
    subprocess.Popen(["celery", "-A", "app.celery_tasks.tasks", "worker", "--loglevel=info"])
    
    print("Starting Celery Beat Clock...")
    subprocess.Popen(["celery", "-A", "app.celery_tasks.tasks", "beat", "--loglevel=info"])
    
    print("Starting FastAPI Server...")
    # We use subprocess.run here so the script stays alive and doesn't exit
    subprocess.run(["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "10000"])

if __name__ == "__main__":
    main()