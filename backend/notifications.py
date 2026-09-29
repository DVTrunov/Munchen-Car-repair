"""
Notifications module — stub for future GreenAPI (WhatsApp) integration.

Architecture note:
  The `send_notification` function is the single integration point for
  client notifications. Currently it only logs the call. When you're
  ready to enable real WhatsApp messages via GreenAPI:

  1. Register at https://green-api.com and get an instance
  2. Add GREENAPI_INSTANCE_ID and GREENAPI_API_TOKEN to your .env
  3. Uncomment the requests block below and add `requests` to requirements.txt

This function is called automatically when an order status changes to "done".
"""
import logging
import os

logger = logging.getLogger(__name__)


def send_notification(client_phone: str, client_name: str, message: str) -> None:
    """
    Send a WhatsApp notification to a client.

    Args:
        client_phone: Client phone in +7XXXXXXXXXX format
        client_name:  Client's full name (for logging)
        message:      Message text to send

    Currently: logs only.
    Future: sends via GreenAPI WhatsApp Business API.
    """
    logger.info(
        "[УВЕДОМЛЕНИЕ] Кому: %s (%s) | Сообщение: %s",
        client_phone,
        client_name,
        message,
    )

    # ─── Future GreenAPI integration ─────────────────────────────────────────
    # import requests
    #
    # instance_id = os.getenv("GREENAPI_INSTANCE_ID")
    # api_token = os.getenv("GREENAPI_API_TOKEN")
    #
    # if not instance_id or not api_token:
    #     logger.warning("GreenAPI не настроен (нет GREENAPI_INSTANCE_ID / GREENAPI_API_TOKEN)")
    #     return
    #
    # # GreenAPI uses phone without '+', with '@c.us' suffix
    # chat_id = client_phone.lstrip("+") + "@c.us"
    # url = (
    #     f"https://api.green-api.com/waInstance{instance_id}"
    #     f"/sendMessage/{api_token}"
    # )
    # payload = {"chatId": chat_id, "message": message}
    # try:
    #     response = requests.post(url, json=payload, timeout=10)
    #     response.raise_for_status()
    #     logger.info("Уведомление отправлено: %s", response.json())
    # except requests.RequestException as e:
    #     logger.error("Ошибка отправки уведомления: %s", e)
    # ─────────────────────────────────────────────────────────────────────────
