import smtplib
import os
import socket
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Force IPv4 because Render sometimes has no IPv6 route, leading to 'Network is unreachable'
old_getaddrinfo = socket.getaddrinfo
def new_getaddrinfo(*args, **kwargs):
    responses = old_getaddrinfo(*args, **kwargs)
    return [response for response in responses if response[0] == socket.AF_INET]
socket.getaddrinfo = new_getaddrinfo

def send_email(to_email: str, subject: str, body: str):
    """
    Sends an email using SMTP.
    Requires SMTP_USER and SMTP_PASSWORD to be set in the environment or .env file.
    Defaults to Gmail's SMTP server.
    """
    smtp_server = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", 587))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_password = os.environ.get("SMTP_PASSWORD")

    if not smtp_user or not smtp_password:
        print("--- SMTP CREDENTIALS NOT CONFIGURED ---")
        print("Please set SMTP_USER and SMTP_PASSWORD in Backend/.env to send real emails.")
        print(f"Mocking email to: {to_email}")
        print(f"Subject: {subject}")
        print(f"Body: {body}")
        print("---------------------------------------")
        return

    msg = MIMEMultipart()
    msg['From'] = smtp_user
    msg['To'] = to_email
    msg['Subject'] = subject

    msg.attach(MIMEText(body, 'plain'))

    try:
        if smtp_port == 465:
            # Port 465 uses SSL directly
            server = smtplib.SMTP_SSL(smtp_server, smtp_port)
        else:
            # Port 587 uses TLS
            server = smtplib.SMTP(smtp_server, smtp_port)
            server.starttls()
            
        server.login(smtp_user, smtp_password)
        server.send_message(msg)
        server.quit()
        print(f"Successfully sent email to {to_email}")
    except Exception as e:
        print(f"Failed to send email: {e}")
        raise e
