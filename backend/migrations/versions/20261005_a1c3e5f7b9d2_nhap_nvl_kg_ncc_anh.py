"""nhập nguyên liệu: KG theo bên cung cấp + ảnh chứng từ (KG cân thực tế giữ ở cột kg)

Revision ID: a1c3e5f7b9d2
Revises: f6b8d1a3c5e7
Create Date: 2026-10-05 10:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "a1c3e5f7b9d2"
down_revision = "f6b8d1a3c5e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("material_receipts") as b:
        b.add_column(sa.Column("kg_supplier", sa.Float(), nullable=True))
        b.add_column(sa.Column("photo", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("material_receipts") as b:
        b.drop_column("photo")
        b.drop_column("kg_supplier")
