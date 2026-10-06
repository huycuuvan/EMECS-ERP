"""2 mốc của đơn / hợp đồng: complete_by = hạn trả hợp đồng (kế toán), deliver_by = hạn giao hàng cho khách

Revision ID: d5f7b9c1e3a2
Revises: c4e6a8b0d2f1
Create Date: 2026-10-06 16:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "d5f7b9c1e3a2"
down_revision = "c4e6a8b0d2f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for t in ("orders", "contracts"):
        with op.batch_alter_table(t) as b:
            b.add_column(sa.Column("deliver_by", sa.DateTime(), nullable=True))


def downgrade() -> None:
    for t in ("contracts", "orders"):
        with op.batch_alter_table(t) as b:
            b.drop_column("deliver_by")
