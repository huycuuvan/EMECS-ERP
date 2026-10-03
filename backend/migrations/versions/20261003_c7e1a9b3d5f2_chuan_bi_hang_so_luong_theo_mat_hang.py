"""chuẩn bị hàng: số lượng theo từng mặt hàng của đơn (lũy tiến thành tổng KL)

Revision ID: c7e1a9b3d5f2
Revises: b2d8f4a6c1e9
Create Date: 2026-10-03 19:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "c7e1a9b3d5f2"
down_revision = "b2d8f4a6c1e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("receipts") as b:
        b.add_column(sa.Column("items", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("receipts") as b:
        b.drop_column("items")
