"""hợp đồng: bản scan hợp đồng đã ký (file PDF/ảnh tải lên)

Revision ID: b3d5f7a9c1e2
Revises: a1c3e5f7b9d2
Create Date: 2026-10-05 14:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "b3d5f7a9c1e2"
down_revision = "a1c3e5f7b9d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("contracts") as b:
        b.add_column(sa.Column("signed_file", sa.String(255), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("contracts") as b:
        b.drop_column("signed_file")
