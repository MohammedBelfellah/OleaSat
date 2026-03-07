"""AI-powered personalized message generation via Groq (Llama 3).

Calls Groq's API to generate natural, contextual Telegram messages
in the farmer's preferred language. Falls back to static templates
if the API is unavailable or not configured.
"""

from __future__ import annotations

import logging
from typing import Optional

import requests

from app.config import settings
from app.templates import get_alert_message, _escape_md

logger = logging.getLogger(__name__)

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"
GROQ_TIMEOUT = 15  # seconds


def _build_prompt(language: str, data: dict) -> str:
    """Build the AI prompt with real irrigation data."""

    lang_instruction = {
        "FR": (
            "Tu es un conseiller agricole marocain bienveillant. "
            "Écris un message Telegram COURT (max 15 lignes) en français pour un agriculteur. "
            "Utilise des emojis. Sois direct et pratique."
        ),
        "DARIJA": (
            "أنت مستشار فلاحي مغربي. اكتب رسالة Telegram قصيرة (ماكسيمم 15 سطر) بالدارجة المغربية. "
            "استعمل إيموجي. كن مباشر وعملي. ماشي عربية فصحى، دارجة مغربية عادية."
        ),
    }.get(language, "Write a short Telegram message in French for a farmer.")

    recommendation_label = {
        "URGENT": "URGENT - irrigation immédiate requise" if language == "FR" else "مستعجل - خاص تسقي دابا",
        "IRRIGATE": "Irrigation recommandée" if language == "FR" else "خاصك تسقي",
        "SKIP": "Pas d'irrigation nécessaire" if language == "FR" else "ماكاينش سقي هاد السيمانة",
    }.get(data.get("recommendation", "SKIP"), data.get("recommendation", "SKIP"))

    return f"""{lang_instruction}

Données réelles du calcul cette semaine :
- Nom de l'agriculteur : {data['farmer_name']}
- Recommandation : {recommendation_label}
- Litres par arbre : {data['litres_per_tree']}
- Total parcelle : {data['total_litres']} L ({data['total_m3']} m³)
- Phase de l'olivier : {data['phase_label']}
- ET₀ (évapotranspiration) : {data['et0_week']} mm
- Pluie cette semaine : {data['rain_week']} mm
- Pluie efficace : {data['p_eff']} mm
- NDVI (santé végétation) : {data['ndvi_current']}
- Kc appliqué : {data['kc_applied']}
- Mode sécheresse : {'OUI' if data.get('stress_mode') else 'NON'}
- Litres survie minimum : {data.get('survival_litres', 'N/A')}

RÈGLES IMPORTANTES :
1. Utilise EXACTEMENT les chiffres fournis, ne les invente pas
2. Commence par une salutation avec le nom de l'agriculteur
3. Donne la recommandation clairement (irriguer ou pas)
4. Si stress_mode=OUI, insiste sur l'urgence
5. Termine par le nom "OleaSat"
6. NE PAS utiliser de formatage Markdown (pas de *, pas de _, pas de `)
7. Utilise seulement des emojis et du texte simple"""


def generate_ai_message(language: str = "FR", **kwargs) -> str:
    """Generate a personalized alert message using Groq AI.

    Falls back to static template if:
    - GROQ_API_KEY is not set
    - API call fails
    - Response is empty or invalid

    Args:
        language: "FR" or "DARIJA"
        **kwargs: Same parameters as weekly_alert()

    Returns:
        MarkdownV2-escaped message string ready for Telegram
    """
    api_key = settings.groq_api_key
    if not api_key:
        logger.debug("GROQ_API_KEY not set — using static template")
        return get_alert_message(language=language, **kwargs)

    prompt = _build_prompt(language, kwargs)

    try:
        response = requests.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": "You are an agricultural advisor for Moroccan olive farmers."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.7,
                "max_tokens": 500,
            },
            timeout=GROQ_TIMEOUT,
        )
        response.raise_for_status()

        data = response.json()
        ai_text = data["choices"][0]["message"]["content"].strip()

        if not ai_text or len(ai_text) < 20:
            logger.warning("Groq returned empty/short response — using template fallback")
            return get_alert_message(language=language, **kwargs)

        # Escape for Telegram MarkdownV2
        escaped = _escape_md(ai_text)
        logger.info("AI message generated for %s (%s, %d chars)",
                     kwargs.get("farmer_name", "?"), language, len(ai_text))
        return escaped

    except requests.exceptions.Timeout:
        logger.warning("Groq API timeout — using template fallback")
        return get_alert_message(language=language, **kwargs)
    except requests.exceptions.RequestException as exc:
        logger.warning("Groq API error: %s — using template fallback", exc)
        return get_alert_message(language=language, **kwargs)
    except (KeyError, IndexError) as exc:
        logger.warning("Groq response parsing error: %s — using template fallback", exc)
        return get_alert_message(language=language, **kwargs)
