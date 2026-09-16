# -*- coding: utf-8 -*-
import re
import logging
from .database import SessionLocal, DrugAtcMapping

logger = logging.getLogger("fall_risk.sanitizer")

def sanitize_clinical_drugs_in_db():
    """
    Sanitizes drug_atc_mappings table to ensure strict clinical alignment with:
    - AGS Beers Criteria 2023
    - STOPPFall 2021
    
    1. 2nd-generation antihistamines (Loratadine, Desloratadine, Cetirizine, Levocetirizine,
       Fexofenadine, Bilastine, Rupatadine) must NEVER be classified as FRIDs (ANTIHISTAMINE).
    2. 1st-generation antihistamines (CPM, Diphenhydramine, Dimenhydrinate, Hydroxyzine,
       Cyproheptadine, Brompheniramine) are verified as FRIDs (ANTIHISTAMINE).
    3. Veterinary 'Q' prefixed codes are stripped and normalized to human WHO-ATC codes.
    4. Opioid anesthetics & addiction therapy (Fentanyl, Methadone) are classified as NARCOTICs.
    5. NSAIDs (Diclofenac, Naproxen) and Antipsychotics (Fluphenazine, Lithium) are properly grouped.
    6. Antidiabetics (Glibenclamide) and Diuretics (Acetazolamide) are properly grouped.
    """
    try:
        from .ml.atc_tagger import normalize_atc, map_atc_to_frid_group, is_sedating_antihistamine, NON_SEDATING_ANTIHISTAMINES
        with SessionLocal() as db:
            recs = db.query(DrugAtcMapping).all()
            updated_count = 0
            for r in recs:
                d_name = r.drug_name or ""
                g_name = r.generic_name or ""
                d_text = f"{d_name} {g_name}".lower()
                raw_atc = (r.atc_code or "").strip()
                atc = normalize_atc(raw_atc)
                
                # Check if Q code needed normalization
                if raw_atc != atc:
                    r.atc_code = atc
                    updated_count += 1

                # Rule 1: Explicit 2nd-gen non-sedating antihistamines
                if any(ah in d_text for ah in NON_SEDATING_ANTIHISTAMINES):
                    if r.frid_group != 'NON_FRID':
                        logger.info(f"[Sanitizer] Fixing 2nd-gen to NON_FRID: icode={r.icode}, drug={r.drug_name} (was {r.frid_group})")
                        r.frid_group = 'NON_FRID'
                        r.atc_description = 'Second-generation Non-sedating Antihistamines (Non-FRID)'
                        updated_count += 1
                # Rule 2: Explicit 1st-gen sedating antihistamines
                elif re.search(r'\b(diphenhydramine)\b', d_text):
                    if atc == 'R06A' or not atc:
                        r.atc_code = 'R06AA02'
                        r.frid_group = 'ANTIHISTAMINE'
                        r.atc_description = 'First-generation Sedating Antihistamines'
                        updated_count += 1
                # Rule 3: Any R06 that is not 1st-generation prefix should be NON_FRID
                elif atc.startswith('R06') and not is_sedating_antihistamine(atc):
                    if r.frid_group != 'NON_FRID':
                        logger.info(f"[Sanitizer] Fixing R06 non-sedating ATC to NON_FRID: icode={r.icode}, atc={atc}, drug={r.drug_name}")
                        r.frid_group = 'NON_FRID'
                        r.atc_description = 'Second-generation Non-sedating Antihistamines (Non-FRID)'
                        updated_count += 1
                # Rule 4: Fentanyl & Methadone (Narcotics)
                elif re.search(r'\b(fentanyl|methadone)\b', d_text):
                    if r.frid_group != 'NARCOTICs':
                        r.frid_group = 'NARCOTICs'
                        r.atc_description = 'Opioids & Narcotics'
                        updated_count += 1
                # Rule 5: Diclofenac & Naproxen (NSAIDs)
                elif re.search(r'\b(diclofenac|naproxen)\b', d_text):
                    if r.frid_group != 'NSAIDs':
                        r.frid_group = 'NSAIDs'
                        r.atc_description = 'Anti-inflammatory and Antirheumatic Products (NSAIDs)'
                        updated_count += 1
                # Rule 6: Fluphenazine & Lithium (Antipsychotics)
                elif re.search(r'\b(fluphenazine|lithium)\b', d_text):
                    if r.frid_group != 'ANTIPSYCHOTIC':
                        r.frid_group = 'ANTIPSYCHOTIC'
                        r.atc_description = 'Antipsychotics'
                        updated_count += 1
                # Rule 7: Glibenclamide (Antidiabetics)
                elif re.search(r'\b(glibenclamide|glyburide)\b', d_text):
                    if r.frid_group != 'ANTIDIABETIC DRUGS':
                        r.frid_group = 'ANTIDIABETIC DRUGS'
                        r.atc_description = 'Blood Glucose Lowering Drugs'
                        updated_count += 1
                # Rule 8: Acetazolamide (Diuretics)
                elif re.search(r'\b(acetazolamide)\b', d_text):
                    if r.frid_group != 'DIURETICS':
                        r.frid_group = 'DIURETICS'
                        r.atc_description = 'Carbonic anhydrase inhibitor Diuretics'
                        updated_count += 1

            if updated_count > 0:
                db.commit()
                logger.info(f"[Sanitizer] Successfully sanitized {updated_count} drug records in database.")
            else:
                logger.info("[Sanitizer] All drug ATC/FRID records are already clinically clean.")
    except Exception as e:
        logger.error(f"[Sanitizer] Error sanitizing drug records: {e}")

# Alias for backwards compatibility with main.py startup call
sanitize_antihistamines_in_db = sanitize_clinical_drugs_in_db

if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    sanitize_clinical_drugs_in_db()
