"""xin gia hạn trả hợp đồng: kế toán nhập lý do → Quản lý duyệt (+5 ngày) / từ chối

Revision ID: e6a8c0d2f4b3
Revises: d5f7b9c1e3a2
Create Date: 2026-10-06 17:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "e6a8c0d2f4b3"
down_revision = "d5f7b9c1e3a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("contract_extensions",
                    sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
                    sa.Column("contract_id", sa.String(32), nullable=False, index=True),
                    sa.Column("reason", sa.Text(), nullable=False),
                    sa.Column("requested_by", sa.String(120), nullable=False, server_default=""),
                    sa.Column("requested_at", sa.DateTime(), nullable=True),
                    sa.Column("status", sa.String(20), nullable=False, server_default="Chờ duyệt"),
                    sa.Column("days", sa.Integer(), nullable=False, server_default="5"),
                    sa.Column("old_by", sa.DateTime(), nullable=True),
                    sa.Column("new_by", sa.DateTime(), nullable=True),
                    sa.Column("decided_by", sa.String(120), nullable=True),
                    sa.Column("decided_at", sa.DateTime(), nullable=True),
                    sa.Column("reject_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_table("contract_extensions")
