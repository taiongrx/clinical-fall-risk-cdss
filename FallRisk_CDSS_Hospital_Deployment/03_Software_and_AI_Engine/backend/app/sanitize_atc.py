# -*- coding: utf-8 -*-
import re
import logging
from .database import SessionLocal, DrugAtcMapping

logger = logging.getLogger("fall_risk.sanitizer")

def sanitize_antihistamines_in_db():
    """
    Sanitizes drug_atc_mappings table to ensure clinical alignment with:
    - AGS Beers Criteria 2023
    - STOPPFall 2021
    
    2nd-generation antihistamines (Loratadine, Desloratadine, Cetirizine, Levocetirizine,
    Fexofenadine, Bilastine, Rupatadine) have negligible blood-brain barrier penetration
    and sedation, and must NEVER be classified as FRIDs (ANTIHISTAMINE).
    
    1st-generation antihistamines (CPM, Diphenhydramine, Dimenhydrinate, Hydroxyzine,
    Cyproheptadine, Brompheniramine) have significant central anticholinergic effects
    and are classified as FRIDs (ANTIHISTAMINE).
    """
    try:
        with SessionLocal() as db:
            recs = db.query(DrugAtcMapping).all()
            updated_count = 0
            for r in recs:
                d_name = r.drug_name or ""
                g_name = r.generic_name or ""
                d_text = f"{d_name} {g_name}".lower()
                atc = (r.atc_code or "").strip().upper()

                # Rule 1: Explicit 2nd-gen non-sedating antihistamines
                if re.search(r'\b(loratadine|cetirizine|fexofenadine|desloratadine|levocetirizine|bilastine|rupatadine)\b', d_text):
                    if r.frid_group != 'NON_FRID':
                        logger.info(f"[Sanitizer] Fixing 2nd-gen to NON_FRID: icode={r.icode}, drug={r.drug_name} (was {r.frid_group})")
                        r.frid_group = 'NON_FRID'
                        r.atc_description = 'Second-generation Non-sedating Antihistamines (Non-FRID)'
                        updated_count += 1
                # Rule 2: Explicit 1st-gen sedating antihistamines (e.g. Diphenhydramine misclassified as R06A)
                elif re.search(r'\b(diphenhydramine)\b', d_text):
                    if atc == 'R06A' or not atc:
                        logger.info(f"[Sanitizer] Fixing Diphenhydramine ATC: icode={r.icode}, drug={r.drug_name}")
                        r.atc_code = 'R06AA02'
                        r.frid_group = 'ANTIHISTAMINE'
                        r.atc_description = 'First-generation Sedating Antihistamines'
                        updated_count += 1
                # Rule 3: Any R06 that is not 1st-generation prefix should be NON_FRID
                elif atc.startswith('R06') and not any(atc.startswith(pfx) for pfx in ['R06AA', 'R06AB', 'R06AD', 'R06AX02']):
                    if r.frid_group != 'NON_FRID':
                        logger.info(f"[Sanitizer] Fixing R06 non-sedating ATC to NON_FRID: icode={r.icode}, atc={atc}, drug={r.drug_name}")
                        r.frid_group = 'NON_FRID'
                        r.atc_description = 'Second-generation Non-sedating Antihistamines (Non-FRID)'
                        updated_count += 1

            if updated_count > 0:
                db.commit()
                logger.info(f"[Sanitizer] Successfully sanitized {updated_count} drug records in database.")
            else:
                logger.info("[Sanitizer] All drug ATC/FRID records are already clinically clean.")
    except Exception as e:
        logger.error(f"[Sanitizer] Error sanitizing drug records: {e}")

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    sanitize_antihistamines_in_db()
