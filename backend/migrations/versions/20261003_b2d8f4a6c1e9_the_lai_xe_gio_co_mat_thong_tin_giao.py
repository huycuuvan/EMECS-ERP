"""thẻ lái xe: ngày giờ phải có mặt; giao khách lấy thông tin khách hàng (địa chỉ, người nhận, người liên hệ)

Revision ID: b2d8f4a6c1e9
Revises: 9a4c2e7f1d63
Create Date: 2026-10-03 18:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "b2d8f4a6c1e9"
down_revision = "9a4c2e7f1d63"
branch_labels = None
depends_on = None

COLS = [("deliver_name", 200), ("receiver_name", 120), ("receiver_phone", 40), ("contact_name", 120), ("contact_phone", 40)]


def upgrade() -> None:
    with op.batch_alter_table("tasks") as b:
        b.add_column(sa.Column("arrive_at", sa.DateTime(), nullable=True))
        b.add_column(sa.Column("deliver_customer_id", sa.Integer(), nullable=True))
        b.add_column(sa.Column("deliver_address", sa.Text(), nullable=False, server_default=""))
        for name, n in COLS:
            b.add_column(sa.Column(name, sa.String(length=n), nullable=False, server_default=""))


def downgrade() -> None:
    with op.batch_alter_table("tasks") as b:
        for name, _ in COLS:
            b.drop_column(name)
        b.drop_column("deliver_address")
        b.drop_column("deliver_customer_id")
        b.drop_column("arrive_at")
