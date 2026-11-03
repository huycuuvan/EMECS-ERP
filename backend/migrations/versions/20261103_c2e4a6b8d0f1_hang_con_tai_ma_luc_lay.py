"""thẻ giao khách: hàng của HĐ còn tại mạ (ước tính sau mạ +3%) lúc lái xe điền phiếu giao nhận — anh Thắng 03/11:
lấy ra từ mạ được vượt số này (mạ có thể tăng hơn 3%), phần vượt là chênh lệch → Quản lý duyệt → kho ảo

Revision ID: c2e4a6b8d0f1
Revises: b9d1f3a5c7e9
Create Date: 2026-11-03 15:00:00
"""
import sqlalchemy as sa
from alembic import op

revision = "c2e4a6b8d0f1"
down_revision = "b9d1f3a5c7e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as b:
        b.add_column(sa.Column("kg_galv_left", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("tasks") as b:
        b.drop_column("kg_galv_left")
