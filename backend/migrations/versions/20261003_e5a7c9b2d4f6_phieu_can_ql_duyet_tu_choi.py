"""phiếu cân từ Chuẩn bị hàng: lý do lệch, Quản lý duyệt / từ chối

Revision ID: e5a7c9b2d4f6
Revises: d4f6b8a1c3e7
Create Date: 2026-10-03 21:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "e5a7c9b2d4f6"
down_revision = "d4f6b8a1c3e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("weighings") as b:
        b.add_column(sa.Column("reason", sa.Text(), nullable=True))
        b.add_column(sa.Column("reason_note", sa.Text(), nullable=True))
        b.add_column(sa.Column("approved_by", sa.String(length=120), nullable=True))
        b.add_column(sa.Column("approved_at", sa.DateTime(), nullable=True))
        b.add_column(sa.Column("reject_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("weighings") as b:
        for col in ("reject_reason", "approved_at", "approved_by", "reason_note", "reason"):
            b.drop_column(col)
