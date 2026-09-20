"""
KisanMind AWS Native Storage & Database Client
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Replaces external Supabase BaaS with 100% AWS-native stack:
- Database: Embedded SQLite WAL on EC2
- Object Storage: Amazon S3 (kisanmind-data-058264544789)
"""

from utils.aws_db_client import get_supabase, AWSAppClient

__all__ = ["get_supabase", "AWSAppClient"]
