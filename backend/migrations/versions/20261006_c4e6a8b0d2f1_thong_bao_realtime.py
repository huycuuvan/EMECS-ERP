"""thông báo: gửi riêng người, mã bản ghi để bấm mở; đã đọc theo từng người; đăng ký web push

Revision ID: c4e6a8b0d2f1
Revises: b3d5f7a9c1e2
Create Date: 2026-10-06 15:00:00
"""
import sqlalchemy as sa
from alembic import op


revision = "c4e6a8b0d2f1"
down_revision = "b3d5f7a9c1e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("notifications") as b:
        b.add_column(sa.Column("to_user", sa.String(120), nullable=True))
        b.add_column(sa.Column("ref_id", sa.String(32), nullable=True))
    op.create_table("notification_reads",
                    sa.Column("user_id", sa.String(32), primary_key=True),
                    sa.Column("notification_id", sa.Integer(), primary_key=True))
    op.create_table("push_subscriptions",
                    sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
                    sa.Column("user_id", sa.String(32), nullable=False, index=True),
                    sa.Column("endpoint", sa.Text(), nullable=False),
                    sa.Column("p256dh", sa.String(255), nullable=False),
                    sa.Column("auth", sa.String(255), nullable=False),
                    sa.Column("created_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_table("push_subscriptions")
    op.drop_table("notification_reads")
    with op.batch_alter_table("notifications") as b:
        b.drop_column("ref_id")
        b.drop_column("to_user")
