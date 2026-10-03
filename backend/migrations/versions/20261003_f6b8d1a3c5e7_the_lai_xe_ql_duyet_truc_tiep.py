"""thẻ lái xe: phiếu lệch → lý do → Quản lý duyệt / từ chối trực tiếp (không biên bản sai lệch)

Revision ID: f6b8d1a3c5e7
Revises: e5a7c9b2d4f6
Create Date: 2026-10-03 22:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "f6b8d1a3c5e7"
down_revision = "e5a7c9b2d4f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as b:
        b.add_column(sa.Column("reason", sa.Text(), nullable=True))
        b.add_column(sa.Column("reason_note", sa.Text(), nullable=True))
        b.add_column(sa.Column("approved_by", sa.String(length=120), nullable=True))
        b.add_column(sa.Column("approved_at", sa.DateTime(), nullable=True))
        b.add_column(sa.Column("reject_reason_ql", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("tasks") as b:
        for col in ("reject_reason_ql", "approved_at", "approved_by", "reason_note", "reason"):
            b.drop_column(col)
