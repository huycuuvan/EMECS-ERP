"""kế toán: soạn thảo hợp đồng theo mẫu, trạng thái 4 bước, ngày hoàn thành đơn, tiền về chờ Quản lý duyệt

Revision ID: 7d3f1b2c8e55
Revises: 5c1e7a9d2b40
Create Date: 2026-10-03 14:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "7d3f1b2c8e55"
down_revision = "5c1e7a9d2b40"
branch_labels = None
depends_on = None

STATUS_MAP = [("Soạn thảo", "Chờ soạn thảo"), ("Đã trả khách", "Đã gửi khách hàng"), ("Đã ký", "Đã nhận về"),
              ("Đang triển khai", "Đã nhận về"), ("Hoàn thành", "Đã hoàn thành")]


def upgrade() -> None:
    with op.batch_alter_table("orders") as b:
        b.add_column(sa.Column("complete_by", sa.DateTime(), nullable=True))
    with op.batch_alter_table("contracts") as b:
        b.add_column(sa.Column("number", sa.String(length=64), server_default="", nullable=False))
        b.add_column(sa.Column("complete_by", sa.DateTime(), nullable=True))
        b.add_column(sa.Column("draft", sa.Text(), nullable=True))
        b.add_column(sa.Column("drafted_at", sa.DateTime(), nullable=True))
        b.add_column(sa.Column("completed_at", sa.DateTime(), nullable=True))
    with op.batch_alter_table("payments") as b:
        b.add_column(sa.Column("status", sa.String(length=20), server_default="Đã duyệt", nullable=False))
        b.add_column(sa.Column("created_by", sa.String(length=120), server_default="", nullable=False))
        b.add_column(sa.Column("approved_by", sa.String(length=120), nullable=True))
        b.add_column(sa.Column("approved_at", sa.DateTime(), nullable=True))
        b.add_column(sa.Column("reject_reason", sa.Text(), nullable=True))
    op.create_table("settings", sa.Column("key", sa.String(length=64), primary_key=True),
                    sa.Column("value", sa.Text(), nullable=False))
    for old, new in STATUS_MAP:
        op.execute(sa.text("UPDATE contracts SET status = :new WHERE status = :old").bindparams(old=old, new=new))
    op.execute("UPDATE contracts SET number = order_id WHERE number = ''")
    # tiền về đã có trước khi áp dụng duyệt → coi như đã duyệt
    op.execute("UPDATE payments SET approved_at = date WHERE approved_at IS NULL")


def downgrade() -> None:
    for old, new in reversed(STATUS_MAP):
        op.execute(sa.text("UPDATE contracts SET status = :old WHERE status = :new").bindparams(old=old, new=new))
    op.drop_table("settings")
    with op.batch_alter_table("payments") as b:
        for col in ("reject_reason", "approved_at", "approved_by", "created_by", "status"):
            b.drop_column(col)
    with op.batch_alter_table("contracts") as b:
        for col in ("completed_at", "drafted_at", "draft", "complete_by", "number"):
            b.drop_column(col)
    with op.batch_alter_table("orders") as b:
        b.drop_column("complete_by")
