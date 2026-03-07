"""Telegram bot for OleaSat — notification-only architecture.

Handles:
- /start {farmer_id}  — deep-link to bind Telegram chat to a farmer profile
- /help               — show available commands
- /status             — show last alert for the linked farmer

Sending weekly alerts is done by the scheduler (app/scheduler.py) calling
`send_alert()` from this module.
"""

from __future__ import annotations

import logging
from typing import Optional

from telegram import Update
from telegram.constants import ParseMode
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
)

from app.config import settings
from app.database import SessionLocal
from app.models import AlertRecord, FarmerProfile
from app.templates import (
    already_linked,
    help_message,
    link_error,
    welcome_linked,
    weekly_alert,
)

logger = logging.getLogger(__name__)

# Module-level reference to the running Application (set in start_bot)
_app: Optional[Application] = None


# ---------------------------------------------------------------------------
# Command handlers
# ---------------------------------------------------------------------------

async def _start_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """/start {farmer_id} — deep-link binding."""
    chat_id = str(update.effective_chat.id)

    # Extract farmer_id from deep-link payload
    farmer_id: str | None = context.args[0] if context.args else None
    if not farmer_id:
        await update.message.reply_text(
            link_error(), parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    db = SessionLocal()
    try:
        farmer = db.query(FarmerProfile).filter(FarmerProfile.id == farmer_id).first()
        if not farmer:
            await update.message.reply_text(
                link_error(), parse_mode=ParseMode.MARKDOWN_V2,
            )
            return

        if farmer.telegram_chat_id == chat_id:
            await update.message.reply_text(
                already_linked(farmer.farmer_name or "Agriculteur"),
                parse_mode=ParseMode.MARKDOWN_V2,
            )
            return

        # Bind chat_id to farmer
        farmer.telegram_chat_id = chat_id
        db.commit()
        logger.info("Linked farmer %s → Telegram chat %s", farmer_id, chat_id)

        await update.message.reply_text(
            welcome_linked(farmer.farmer_name or "Agriculteur"),
            parse_mode=ParseMode.MARKDOWN_V2,
        )
    finally:
        db.close()


async def _help_handler(update: Update, _context: ContextTypes.DEFAULT_TYPE) -> None:
    """/help — display available commands."""
    await update.message.reply_text(
        help_message(), parse_mode=ParseMode.MARKDOWN_V2,
    )


async def _status_handler(update: Update, _context: ContextTypes.DEFAULT_TYPE) -> None:
    """/status — show the most recent alert for the linked farmer."""
    chat_id = str(update.effective_chat.id)
    db = SessionLocal()
    try:
        farmer = (
            db.query(FarmerProfile)
            .filter(FarmerProfile.telegram_chat_id == chat_id)
            .first()
        )
        if not farmer:
            await update.message.reply_text(
                "⚠️ Aucun compte lié à ce chat\\.\n"
                "Utilisez le lien depuis votre tableau de bord OleaSat\\.",
                parse_mode=ParseMode.MARKDOWN_V2,
            )
            return

        last_alert: AlertRecord | None = (
            db.query(AlertRecord)
            .filter(AlertRecord.farmer_id == farmer.id)
            .order_by(AlertRecord.sent_at.desc())
            .first()
        )
        if not last_alert:
            await update.message.reply_text(
                "ℹ️ Aucune alerte n'a encore été envoyée pour votre parcelle\\.",
                parse_mode=ParseMode.MARKDOWN_V2,
            )
            return

        from app.templates import _escape_md
        msg = (
            f"📊 *Dernière alerte* \\({_escape_md(last_alert.sent_at.strftime('%d/%m/%Y'))}\\)\n\n"
            f"  • ET₀ : {_escape_md(str(last_alert.et0_weekly_mm))} mm\n"
            f"  • Pluie : {_escape_md(str(last_alert.rain_weekly_mm))} mm\n"
            f"  • Kc : {_escape_md(str(last_alert.kc_applied))}\n"
            f"  • Litres/arbre : *{_escape_md(str(last_alert.litres_per_tree))}*\n"
            f"  • Total : *{_escape_md(str(last_alert.total_litres))} L*\n"
            f"  • Stress : {'🔴 Oui' if last_alert.stress_mode else '🟢 Non'}\n"
        )
        await update.message.reply_text(msg, parse_mode=ParseMode.MARKDOWN_V2)
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Send alert (called by scheduler)
# ---------------------------------------------------------------------------

async def send_alert(chat_id: str, message: str) -> bool:
    """Send a MarkdownV2 message to a chat. Returns True on success."""
    if _app is None:
        logger.error("Bot not initialised — cannot send alert to %s", chat_id)
        return False
    try:
        await _app.bot.send_message(
            chat_id=int(chat_id),
            text=message,
            parse_mode=ParseMode.MARKDOWN_V2,
        )
        return True
    except Exception as exc:
        logger.error("Failed to send alert to %s: %s", chat_id, exc)
        return False


# ---------------------------------------------------------------------------
# Bot lifecycle
# ---------------------------------------------------------------------------

def build_bot() -> Application | None:
    """Build the Telegram Application (does NOT start polling yet)."""
    global _app

    token = settings.telegram_bot_token
    if not token:
        logger.warning("TELEGRAM_BOT_TOKEN not set — bot disabled")
        return None

    _app = (
        Application.builder()
        .token(token)
        .build()
    )

    _app.add_handler(CommandHandler("start", _start_handler))
    _app.add_handler(CommandHandler("help", _help_handler))
    _app.add_handler(CommandHandler("status", _status_handler))

    logger.info("Telegram bot built successfully")
    return _app


async def start_bot() -> None:
    """Initialize and start the bot (webhook-less polling mode)."""
    if _app is None:
        build_bot()
    if _app is None:
        return

    await _app.initialize()
    await _app.start()
    await _app.updater.start_polling(drop_pending_updates=True)
    logger.info("Telegram bot polling started")


async def stop_bot() -> None:
    """Gracefully stop the bot."""
    if _app is None:
        return
    try:
        if _app.updater and _app.updater.running:
            await _app.updater.stop()
        if _app.running:
            await _app.stop()
        await _app.shutdown()
        logger.info("Telegram bot stopped")
    except Exception as exc:
        logger.warning("Error stopping bot: %s", exc)
