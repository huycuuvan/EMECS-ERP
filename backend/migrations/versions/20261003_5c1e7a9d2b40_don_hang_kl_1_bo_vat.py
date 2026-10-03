"""đơn hàng theo file Excel của khách: KL/1 bộ, ghi chú dòng, thuế VAT theo đơn

Revision ID: 5c1e7a9d2b40
Revises: eb80ae755cdf
Create Date: 2026-10-03 11:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "5c1e7a9d2b40"
down_revision = "eb80ae755cdf"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("orders") as b:
        b.add_column(sa.Column("vat_pct", sa.Float(), server_default="10", nullable=False))
    with op.batch_alter_table("order_items") as b:
        b.add_column(sa.Column("kg_per_unit", sa.Float(), nullable=True))
        b.add_column(sa.Column("note", sa.String(length=255), server_default="", nullable=False))
    # đơn cũ: KL/1 bộ = tổng KL / SL; VAT theo hợp đồng đã lập (nếu có)
    op.execute("UPDATE order_items SET kg_per_unit = kg / qty WHERE qty > 0")
    op.execute("UPDATE orders SET vat_pct = (SELECT c.vat_pct FROM contracts c WHERE c.order_id = orders.id) "
               "WHERE EXISTS (SELECT 1 FROM contracts c WHERE c.order_id = orders.id)")


def downgrade() -> None:
    with op.batch_alter_table("order_items") as b:
        b.drop_column("note")
        b.drop_column("kg_per_unit")
    with op.batch_alter_table("orders") as b:
        b.drop_column("vat_pct")
