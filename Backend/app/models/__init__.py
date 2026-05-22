# Models package
from sqlalchemy import Column, Integer, String, Float
# Make sure this import perfectly matches where your Base is defined!
from app.models.database import Base 

class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    subject = Column(String)
    body_html = Column(String)
    status = Column(String, default="draft")
    total_sent = Column(Integer, default=0)
    open_rate = Column(Float, default=0.0)
    click_rate = Column(Float, default=0.0)