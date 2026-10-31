"""góp ý anh Thắng 31/10: tên đơn hàng nhập tay · xưởng xin gia hạn lệnh SX · Quản lý duyệt phiếu nhập NVL ·
(kho ảo ghi mọi chênh lệch kể cả trong dung sai: services.sync_auto_vloss, không cần cột mới)

Revision ID: a8c0e2f4b6d8
Revises: f7b9d1e3a5c4
Create Date: 2026-10-31 14:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "a8c0e2f4b6d8"
down_revision = "f7b9d1e3a5c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("orders") as b:
        b.add_column(sa.Column("name", sa.String(length=255), server_default="", nullable=False))
    with op.batch_alter_table("lsx") as b:
        b.add_column(sa.Column("ext_req_reason", sa.Text(), nullable=True))
        b.add_column(sa.Column("ext_req_days", sa.Integer(), nullable=True))
        b.add_column(sa.Column("ext_req_by", sa.String(length=120), nullable=True))
        b.add_column(sa.Column("ext_req_at", sa.DateTime(), nullable=True))
    # phiếu nhập NVL đã có trước khi có bước duyệt: coi như đã duyệt
    with op.batch_alter_table("material_receipts") as b:
        b.add_column(sa.Column("status", sa.String(length=20), server_default="Đã duyệt", nullable=False))
        b.add_column(sa.Column("approved_by", sa.String(length=120), nullable=True))
        b.add_column(sa.Column("approved_at", sa.DateTime(), nullable=True))
        b.add_column(sa.Column("reject_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("material_receipts") as b:
        for c in ("reject_reason", "approved_at", "approved_by", "status"):
            b.drop_column(c)
    with op.batch_alter_table("lsx") as b:
        for c in ("ext_req_at", "ext_req_by", "ext_req_days", "ext_req_reason"):
            b.drop_column(c)
    with op.batch_alter_table("orders") as b:
        b.drop_column("name")
