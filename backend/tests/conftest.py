import os

# Tắt vòng lặp cảnh báo cuối ngày khi chạy test (test gọi trực tiếp POST /api/alerts/run-end-of-day).
os.environ.setdefault("ALERTS_ENABLED", "0")
