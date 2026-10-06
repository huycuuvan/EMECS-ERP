import os

# Tắt vòng lặp cảnh báo cuối ngày khi chạy test (test gọi trực tiếp POST /api/alerts/run-end-of-day).
os.environ.setdefault("ALERTS_ENABLED", "0")

# Không gửi Web Push khi chạy test.
os.environ.setdefault("PUSH_ENABLED", "0")
