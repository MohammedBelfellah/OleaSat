"""APScheduler-based weekly irrigation alert scheduler (Spec §5.4).

Runs every Sunday at 07:00 (Africa/Casablanca):
1. Query all ACTIVE farmers with a telegram_chat_id
2. For each farmer, run the FAO-56 pipeline
3. Build a message using the weekly_alert template
4. Send via Telegram bot
5. Log an AlertRecord to the database
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.database import SessionLocal
from app.models import AlertRecord, FarmerProfile
from app.services import run_pipeline
from app.templates import get_alert_message

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def _weekly_job() -> None:
    """Process all active farmers and send weekly alerts."""
    from app.bot import send_alert

    logger.info("=== Weekly irrigation job started ===")
    db = SessionLocal()
    sent = 0
    failed = 0

    try:
        farmers = (
            db.query(FarmerProfile)
            .filter(
                FarmerProfile.state == "ACTIVE",
                FarmerProfile.telegram_chat_id.isnot(None),
                FarmerProfile.polygon_json.isnot(None),
                FarmerProfile.tree_age.isnot(None),
                FarmerProfile.soil_type.isnot(None),
                FarmerProfile.tree_count.isnot(None),
            )
            .all()
        )

        logger.info("Found %d active farmers with Telegram linked", len(farmers))

        for farmer in farmers:
            try:
                polygon = json.loads(farmer.polygon_json)

                result = run_pipeline(
                    farm_id=farmer.id,
                    polygon=polygon,
                    tree_count=farmer.tree_count,
                    tree_age=farmer.tree_age,
                    soil_type=farmer.soil_type,
                    spacing_m2=farmer.spacing_m2 or 100.0,
                )

                # Build message in farmer's preferred language
                message = get_alert_message(
                    language=farmer.language or "FR",
                    farmer_name=farmer.farmer_name or "Agriculteur",
                    recommendation=result["recommendation"],
                    litres_per_tree=result["litres_per_tree"],
                    total_litres=result["total_litres"],
                    total_m3=result["total_m3"],
                    et0_week=result["et0_week"],
                    rain_week=result["rain_week"],
                    p_eff=result["p_eff"],
                    kc_applied=result["kc_applied"],
                    phase_label=result["phase_label"],
                    ndvi_current=result["ndvi_current"],
                    stress_mode=result["stress_mode"],
                    survival_litres=result.get("survival_litres"),
                )

                # Send via Telegram
                success = await send_alert(farmer.telegram_chat_id, message)

                # Log alert record
                delivery_status = "SENT" if success else "FAILED"
                alert = AlertRecord(
                    farmer_id=farmer.id,
                    et0_weekly_mm=result["et0_week"],
                    rain_weekly_mm=result["rain_week"],
                    kc_applied=result["kc_applied"],
                    litres_per_tree=result["litres_per_tree"],
                    total_litres=result["total_litres"],
                    stress_mode=result["stress_mode"],
                    delivery_status=delivery_status,
                )
                db.add(alert)
                farmer.last_alert_at = datetime.now(timezone.utc)
                farmer.alert_failed = not success
                db.commit()

                if success:
                    sent += 1
                else:
                    failed += 1

            except Exception as exc:
                logger.error("Failed to process farmer %s: %s", farmer.id, exc)
                failed += 1

    finally:
        db.close()

    logger.info("=== Weekly job done: %d sent, %d failed ===", sent, failed)


def start_scheduler() -> AsyncIOScheduler:
    """Create and start the APScheduler.

    Schedule: every Sunday at 07:00 Africa/Casablanca.
    """
    global _scheduler

    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(
        _weekly_job,
        trigger=CronTrigger(
            day_of_week="sun",
            hour=7,
            minute=0,
            timezone="Africa/Casablanca",
        ),
        id="weekly_irrigation_alert",
        name="Weekly irrigation alert",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("Scheduler started — next run: Sunday 07:00 Africa/Casablanca")
    return _scheduler


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler."""
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
        _scheduler = None


async def trigger_manual_run() -> dict:
    """Manually trigger the weekly job (for testing / admin endpoints)."""
    await _weekly_job()
    return {"status": "ok", "message": "Manual weekly job completed"}
