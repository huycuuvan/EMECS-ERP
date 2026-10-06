"""bỏ mã nội bộ mặc định "MOI" (đơn không nhập mã nội bộ thì để trống)

Revision ID: f7b9d1e3a5c4
Revises: e6a8c0d2f4b3
Create Date: 2026-10-06 19:00:00
"""
from alembic import op

revision = "f7b9d1e3a5c4"
down_revision = "e6a8c0d2f4b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE orders SET code = '' WHERE code = 'MOI'")
    op.execute("UPDATE contracts SET code = '' WHERE code = 'MOI'")


def downgrade() -> None:
    pass
