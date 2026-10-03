"""cân xuất: tổng xe + hàng, trọng lượng xe, giờ cân vào / ra, biển số, phiếu chuẩn bị hàng gốc

Revision ID: d4f6b8a1c3e7
Revises: c7e1a9b3d5f2
Create Date: 2026-10-03 20:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "d4f6b8a1c3e7"
down_revision = "c7e1a9b3d5f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("weighings") as b:
        b.add_column(sa.Column("receipt_id", sa.String(length=32), nullable=True))
        b.add_column(sa.Column("gross_kg", sa.Float(), nullable=True))
        b.add_column(sa.Column("tare_kg", sa.Float(), nullable=True))
        b.add_column(sa.Column("weigh_in_at", sa.DateTime(), nullable=True))
        b.add_column(sa.Column("weigh_out_at", sa.DateTime(), nullable=True))
        b.add_column(sa.Column("vehicle_plate", sa.String(length=20), nullable=True))
    op.create_index("ix_weighings_receipt_id", "weighings", ["receipt_id"])


def downgrade() -> None:
    op.drop_index("ix_weighings_receipt_id", table_name="weighings")
    with op.batch_alter_table("weighings") as b:
        for col in ("vehicle_plate", "weigh_out_at", "weigh_in_at", "tare_kg", "gross_kg", "receipt_id"):
            b.drop_column(col)
