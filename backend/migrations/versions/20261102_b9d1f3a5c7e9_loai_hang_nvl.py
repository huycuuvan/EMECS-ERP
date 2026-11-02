"""loại hàng nguyên liệu mua vào (danh mục cố định — anh Thắng 02/11), thay mác thép trên form

Revision ID: b9d1f3a5c7e9
Revises: a8c0e2f4b6d8
Create Date: 2026-11-02 10:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "b9d1f3a5c7e9"
down_revision = "a8c0e2f4b6d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("material_receipts") as b:
        b.add_column(sa.Column("category", sa.String(length=60), server_default="", nullable=False))
        b.create_index("ix_material_receipts_category", ["category"])


def downgrade() -> None:
    with op.batch_alter_table("material_receipts") as b:
        b.drop_index("ix_material_receipts_category")
        b.drop_column("category")
