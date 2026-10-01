# Backend STEEL ONE — FastAPI + Alembic (migration tự chạy khi khởi động)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 TZ=Asia/Ho_Chi_Minh
WORKDIR /app

COPY requirements.txt .
RUN sed -n '1,/^# dev/p' requirements.txt | grep -v '^#' > req-prod.txt && pip install -r req-prod.txt

COPY alembic.ini .
COPY migrations ./migrations
COPY app ./app

RUN useradd --create-home --uid 1000 steel && mkdir -p /app/uploads /app/data && chown -R steel /app
USER steel

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"
# 1 worker: vòng lặp cảnh báo cuối ngày chạy trong tiến trình; tăng worker thì tách cảnh báo ra job riêng
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
