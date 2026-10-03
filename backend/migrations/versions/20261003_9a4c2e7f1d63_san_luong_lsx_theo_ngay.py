"""sản xuất: sản lượng lệnh SX nhập theo từng ngày (kg), giờ nhập / giờ sửa

Revision ID: 9a4c2e7f1d63
Revises: 7d3f1b2c8e55
Create Date: 2026-10-03 16:00:00
"""
from datetime import datetime, timedelta, timezone

import sqlalchemy as sa
from alembic import op

revision = "9a4c2e7f1d63"
down_revision = "7d3f1b2c8e55"
branch_labels = None
depends_on = None

VN = timezone(timedelta(hours=7))


def upgrade() -> None:
    op.create_table(
        "lsx_daily",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("lsx_id", sa.String(length=32), sa.ForeignKey("lsx.id"), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("kg", sa.Float(), nullable=False, server_default="0"),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("updated_by", sa.String(length=120), nullable=True),
        sa.Column("prev_kg", sa.Float(), nullable=True),
        sa.UniqueConstraint("lsx_id", "day", name="uq_lsx_daily_day"),
    )
    op.create_index("ix_lsx_daily_lsx_id", "lsx_daily", ["lsx_id"])
    # lệnh đang có số lũy kế → 1 dòng ngày (ngày cập nhật tiến độ gần nhất), để tổng các ngày = lũy kế cũ
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, kg_done, accepted_at, assigned_at, accepted_by FROM lsx WHERE kg_done > 0")).all()
    for lid, kg, accepted, assigned, by in rows:
        last = bind.execute(sa.text("SELECT max(at) FROM lsx_logs WHERE lsx_id = :i AND text LIKE 'Cập nhật tiến độ%'"),
                            {"i": lid}).scalar()
        at = last or accepted or assigned or datetime.now(timezone.utc).replace(tzinfo=None)
        # dòng "số dư đầu" ghi tối đa tới HÔM QUA — để hôm nay xưởng nhập số của ngày mà không đè lên lũy kế cũ
        day = min(at.replace(tzinfo=timezone.utc).astimezone(VN).date(), datetime.now(VN).date() - timedelta(days=1))
        bind.execute(sa.text("INSERT INTO lsx_daily (lsx_id, day, kg, note, created_at, created_by) "
                             "VALUES (:i, :d, :kg, :n, :at, :by)"),
                     {"i": lid, "d": day, "kg": kg, "at": at, "by": by or "",
                      "n": "Lũy kế trước khi chuyển sang nhập theo ngày (số dư đầu)"})


def downgrade() -> None:
    op.drop_index("ix_lsx_daily_lsx_id", table_name="lsx_daily")
    op.drop_table("lsx_daily")
