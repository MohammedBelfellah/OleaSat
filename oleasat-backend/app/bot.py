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

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ParseMode
from telegram.ext import (
    Application,
    CallbackQueryHandler,
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
    """/start {payload} — deep-link binding + language choice.

    Supported payload formats:
    - `{farmer_id}` for a specific farm profile
    - `owner_{user_id}` for profile-level linking (all owned farms)
    """
    chat_id = str(update.effective_chat.id)

    payload: str | None = context.args[0] if context.args else None
    if not payload:
        await update.message.reply_text(
            link_error(), parse_mode=ParseMode.MARKDOWN_V2,
        )
        return

    db = SessionLocal()
    try:
        owner_id: str | None = None
        farmer_id_for_lang: str | None = None

        if payload.startswith("owner_"):
            owner_id = payload.removeprefix("owner_").strip()
            if not owner_id:
                await update.message.reply_text(link_error(), parse_mode=ParseMode.MARKDOWN_V2)
                return
            farmer = (
                db.query(FarmerProfile)
                .filter(FarmerProfile.owner_id == owner_id)
                .order_by(FarmerProfile.created_at.asc())
                .first()
            )
            farmer_id_for_lang = f"owner_{owner_id}"
        else:
            farmer = db.query(FarmerProfile).filter(FarmerProfile.id == payload).first()
            farmer_id_for_lang = payload
            owner_id = farmer.owner_id if farmer else None

        if not farmer:
            await update.message.reply_text(
                link_error(), parse_mode=ParseMode.MARKDOWN_V2,
            )
            return

        owner_farms = [farmer]
        if owner_id:
            owner_farms = db.query(FarmerProfile).filter(FarmerProfile.owner_id == owner_id).all()

        linked_farmer = db.query(FarmerProfile).filter(FarmerProfile.telegram_chat_id == chat_id).first()
        if linked_farmer and owner_id and linked_farmer.owner_id != owner_id:
            await update.message.reply_text(
                "This Telegram chat is already linked to another profile.",
            )
            return
        if linked_farmer and not owner_id and linked_farmer.id != farmer.id:
            await update.message.reply_text(
                "This Telegram chat is already linked to another farm profile.",
            )
            return

        already_linked_all = all(f.telegram_chat_id == chat_id for f in owner_farms)
        if already_linked_all:
            await update.message.reply_text(
                already_linked(farmer.farmer_name or "Agriculteur"),
                parse_mode=ParseMode.MARKDOWN_V2,
            )
            return

        owner_has_other_chat = any(
            f.telegram_chat_id is not None and f.telegram_chat_id != chat_id
            for f in owner_farms
        )
        if owner_has_other_chat:
            await update.message.reply_text(
                "This profile is already linked to another Telegram chat.",
            )
            return

        # Bind same chat to all farms in the same owner profile.
        for owner_farm in owner_farms:
            owner_farm.telegram_chat_id = chat_id
        db.commit()
        logger.info(
            "Linked owner profile %s (%d farms) → Telegram chat %s",
            owner_id or farmer.id,
            len(owner_farms),
            chat_id,
        )

        # Send welcome message
        await update.message.reply_text(
            welcome_linked(farmer.farmer_name or "Agriculteur"),
            parse_mode=ParseMode.MARKDOWN_V2,
        )

        # Ask language preference
        keyboard = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("🇫🇷 Français", callback_data=f"lang:FR:{farmer_id_for_lang}"),
                InlineKeyboardButton("🇲🇦 Darija", callback_data=f"lang:DARIJA:{farmer_id_for_lang}"),
            ],
        ])
        await update.message.reply_text(
            "🌐 *Choisissez votre langue / اختار اللغة ديالك :*",
            parse_mode=ParseMode.MARKDOWN_V2,
            reply_markup=keyboard,
        )
    finally:
        db.close()


async def _language_callback(update: Update, _context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle language selection button press."""
    query = update.callback_query
    await query.answer()

    data = query.data  # e.g. "lang:DARIJA:abc-123"
    if not data or not data.startswith("lang:"):
        return

    parts = data.split(":", 2)
    if len(parts) != 3:
        return

    _, lang, target_id = parts
    if lang not in ("FR", "DARIJA"):
        return

    db = SessionLocal()
    try:
        updated = 0
        if target_id.startswith("owner_"):
            owner_id = target_id.removeprefix("owner_").strip()
            farms = db.query(FarmerProfile).filter(FarmerProfile.owner_id == owner_id).all()
            if not farms:
                await query.edit_message_text("❌ Erreur — profil introuvable\\.", parse_mode=ParseMode.MARKDOWN_V2)
                return
            for farm in farms:
                farm.language = lang
            updated = len(farms)
            logger.info("Owner %s set language %s for %d farms", owner_id, lang, updated)
        else:
            farmer = db.query(FarmerProfile).filter(FarmerProfile.id == target_id).first()
            if not farmer:
                await query.edit_message_text("❌ Erreur — profil introuvable\\.", parse_mode=ParseMode.MARKDOWN_V2)
                return
            farmer.language = lang
            updated = 1
            logger.info("Farmer %s chose language: %s", target_id, lang)

        db.commit()

        if lang == "DARIJA":
            await query.edit_message_text(
                "✅ *تم الاختيار \\!*\nغادي تجيك الرسائل بالدارجة كل أسبوع 🇲🇦",
                parse_mode=ParseMode.MARKDOWN_V2,
            )
        else:
            await query.edit_message_text(
                "✅ *Langue choisie : Français*\nVous recevrez vos alertes en français chaque semaine 🇫🇷",
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


async def send_plain_message(chat_id: str, message: str) -> bool:
    """Send a plain text message to a chat. Returns True on success."""
    if _app is None:
        logger.error("Bot not initialised — cannot send direct message to %s", chat_id)
        return False
    try:
        await _app.bot.send_message(
            chat_id=int(chat_id),
            text=message,
        )
        return True
    except Exception as exc:
        logger.error("Failed to send direct message to %s: %s", chat_id, exc)
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
    _app.add_handler(CallbackQueryHandler(_language_callback, pattern=r"^lang:"))

    logger.info("Telegram bot built successfully")
    return _app


async def start_bot() -> None:
    """Initialize and start the bot (webhook-less polling mode)."""
    import asyncio
    from telegram.error import Conflict

    if _app is None:
        build_bot()
    if _app is None:
        return

    await _app.initialize()
    await _app.start()

    for attempt in range(3):
        try:
            await _app.updater.start_polling(drop_pending_updates=True)
            logger.info("Telegram bot polling started")
            return
        except Conflict:
            if attempt < 2:
                logger.warning("Telegram conflict (attempt %d/3), retrying in 30s...", attempt + 1)
                await asyncio.sleep(30)
            else:
                logger.error("Telegram conflict persists after 3 attempts — bot polling disabled")
                raise


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
