"""Telegram message templates for OleaSat alerts (Spec §4.3-4.4).

All messages are in French (default language for Moroccan olive farmers).
Uses Telegram MarkdownV2 formatting.
"""

from __future__ import annotations

from typing import Optional


def _escape_md(text: str) -> str:
    """Escape special characters for Telegram MarkdownV2."""
    special = r"_*[]()~`>#+-=|{}.!"
    for ch in special:
        text = text.replace(ch, f"\\{ch}")
    return text


# ---------------------------------------------------------------------------
# Weekly irrigation alert
# ---------------------------------------------------------------------------

def weekly_alert(
    farmer_name: str,
    recommendation: str,
    litres_per_tree: float,
    total_litres: float,
    total_m3: float,
    et0_week: float,
    rain_week: float,
    p_eff: float,
    kc_applied: float,
    phase_label: str,
    ndvi_current: float,
    stress_mode: bool = False,
    survival_litres: Optional[float] = None,
) -> str:
    """Build the weekly Telegram alert message."""

    # Header emoji based on recommendation
    emoji = {"URGENT": "🔴", "IRRIGATE": "🟡", "SKIP": "🟢"}.get(recommendation, "ℹ️")
    status = {
        "URGENT": "URGENT — Irrigation requise",
        "IRRIGATE": "Irrigation recommandée",
        "SKIP": "Pas d'irrigation nécessaire",
    }.get(recommendation, recommendation)

    name_esc = _escape_md(farmer_name)
    phase_esc = _escape_md(phase_label)

    lines = [
        f"{emoji} *Alerte Irrigation Hebdomadaire*",
        "",
        f"Bonjour {name_esc},",
        "",
        f"📊 *Statut :* {_escape_md(status)}",
        "",
        "📋 *Détails du calcul :*",
        f"  • Phase : {phase_esc} \\(Kc\\={_escape_md(str(kc_applied))}\\)",
        f"  • ET₀ semaine : {_escape_md(str(et0_week))} mm",
        f"  • Pluie semaine : {_escape_md(str(rain_week))} mm",
        f"  • Pluie efficace : {_escape_md(str(p_eff))} mm",
        f"  • NDVI : {_escape_md(str(ndvi_current))}",
        "",
        "💧 *Recommandation :*",
        f"  • Par arbre : *{_escape_md(str(litres_per_tree))} L*",
        f"  • Total parcelle : *{_escape_md(str(total_litres))} L* \\({_escape_md(str(total_m3))} m³\\)",
    ]

    if stress_mode and survival_litres is not None:
        lines.extend([
            "",
            "⚠️ *Mode sécheresse activé\\!*",
            f"Irrigation de survie minimale : *{_escape_md(str(survival_litres))} L/arbre*",
            "Protégez vos oliviers en priorité\\.",
        ])

    lines.extend([
        "",
        "—",
        "🤖 _OleaSat — Système d'irrigation intelligent_",
    ])

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Deep-link confirmation (sent after /start {farmer_id})
# ---------------------------------------------------------------------------

def welcome_linked(farmer_name: str) -> str:
    """Confirmation message when a farmer links their Telegram account."""
    name_esc = _escape_md(farmer_name)
    lines = [
        "✅ *Compte lié avec succès\\!*",
        "",
        f"Bonjour {name_esc},",
        "",
        "Votre compte Telegram est maintenant connecté à OleaSat\\.",
        "Vous recevrez automatiquement vos alertes d'irrigation",
        "chaque semaine\\.",
        "",
        "💡 Pour plus d'informations, visitez votre tableau de bord OleaSat\\.",
        "",
        "🤖 _OleaSat — Système d'irrigation intelligent_",
    ]
    return "\n".join(lines)


def already_linked(farmer_name: str) -> str:
    """Message when a farmer's Telegram is already linked."""
    name_esc = _escape_md(farmer_name)
    return (
        f"ℹ️ Bonjour {name_esc}, votre compte est déjà lié\\.\n"
        "Vous recevez les alertes sur ce chat\\."
    )


def link_error() -> str:
    """Message when the deep-link farmer_id is invalid."""
    return (
        "❌ *Erreur de liaison*\n\n"
        "L'identifiant fourni est invalide ou introuvable\\.\n"
        "Veuillez vérifier le lien depuis votre tableau de bord OleaSat\\."
    )


def help_message() -> str:
    """Response to /help command."""
    return (
        "🫒 *OleaSat Bot*\n\n"
        "Ce bot vous envoie des alertes d'irrigation\n"
        "hebdomadaires pour vos oliviers\\.\n\n"
        "📌 *Commandes :*\n"
        "  /start — Lier votre compte\n"
        "  /help — Afficher ce message\n"
        "  /status — Voir le dernier calcul\n\n"
        "Pour gérer votre exploitation, utilisez\n"
        "le tableau de bord web OleaSat\\."
    )
