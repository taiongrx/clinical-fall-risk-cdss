# -*- coding: utf-8 -*-
import os
import re
import pandas as pd

# Load CHABA manual mapping CSV
manual_dict = {}
csv_path = os.path.join(os.path.dirname(__file__), 'manual_atc_mapping.csv')
if os.path.exists(csv_path):
    try:
        df_m = pd.read_csv(csv_path)
        manual_dict = dict(zip(df_m['icode'].astype(str).str.strip(), df_m['specify_atc'].astype(str).str.strip()))
        print(f"[ATCTagger] Loaded {len(manual_dict)} manual ATC mappings from CHABA.")
    except Exception as e:
        print(f"[ATCTagger] Error loading manual_atc_mapping.csv: {e}")

# Regex-based ATC Matching Rules for Hospital Formulary
ATC_REGEX_RULES = [
    # 1. Sedatives & Hypnotics (N05BA, N05CD, N05CF)
    (r'\b(diazepam|lorazepam|clonazepam|alprazolam|midazolam|zolpidem|clobazam|flurazepam|nitrazepam|triazolam|estazolam|chlordiazepoxide)\b', 'N05BA', 'sedative / hypnotics', 'Anxiolytics, Sedatives & Hypnotics'),
    # 2. Antipsychotics (N05A)
    (r'\b(haloperidol|risperidone|quetiapine|olanzapine|chlorpromazine|perphenazine|trifluoperazine|aripiprazole|clozapine|sulpiride|fluphenazine|zuclopenthixol)\b', 'N05A', 'ANTIPSYCHOTIC', 'Antipsychotics'),
    # 3. Antidepressants (N06A)
    (r'\b(sertraline|fluoxetine|amitriptyline|nortriptyline|escitalopram|citalopram|venlafaxine|duloxetine|mirtazapine|trazodone|fluvoxamine|paroxetine|imipramine|clomipramine)\b', 'N06A', 'Antidepressant', 'Antidepressants'),
    # 4. Antiepileptics / Anticonvulsants (N03A)
    (r'\b(gabapentin|pregabalin|valproate|valproic|phenytoin|carbamazepine|levetiracetam|topiramate|lamotrigine|phenobarbital|oxcarbazepine|zonisamide|lacosamide)\b', 'N03A', 'ANTIEPILEPTIC', 'Antiepileptics'),
    # 5. Narcotics & Opioids (N02A)
    (r'\b(tramadol|morphine|fentanyl|pethidine|codeine|methadone|oxycodone|buprenorphine|hydromorphone|pethidine)\b', 'N02A', 'NARCOTICs', 'Opioids & Narcotics'),
    # 6. NSAIDs (M01A)
    (r'\b(ibuprofen|naproxen|diclofenac|celecoxib|etoricoxib|mefenamic|meloxicam|piroxicam|indomethacin|ketorolac|nabumetone|sulindac|aspirin 300|aspirin 500)\b', 'M01A', 'NSAIDs', 'Anti-inflammatory and Antirheumatic Products (NSAIDs)'),
    # 7. Antihistamines (1st Generation Sedating only per AGS Beers 2023 / STOPPFall 2021)
    (r'\b(chlorpheniramine|cpm|hydroxyzine|diphenhydramine|dimenhydrinate|cyproheptadine|brompheniramine|dexchlorpheniramine|triprolidine|carbinoxamine|clemastine|promethazine)\b', 'R06AB', 'ANTIHISTAMINE', 'First-generation Sedating Antihistamines'),
    # 8. Diuretics (C03)
    (r'\b(furosemide|spironolactone|hydrochlorothiazide|hctz|indapamide|amiloride|acetazolamide|mannitol|torasemide)\b', 'C03', 'DIURETICS', 'Diuretics'),
    # 9. Alpha-1 Adrenergic Antagonists (G04CA, C02CA)
    (r'\b(doxazosin|prazosin|alfuzosin|tamsulosin|silodosin|terazosin)\b', 'G04CA', 'Alpha-1 adrenergic antagonist', 'Alpha-adrenoreceptor Antagonists'),
    # 10. Beta-blocking Agents (C07A)
    (r'\b(atenolol|propranolol|metoprolol|carvedilol|bisoprolol|labetalol|nebivolol|timolol|sotalol)\b', 'C07A', 'BETA-BLOCKING AGENTS', 'Beta Blocking Agents'),
    # 11. Antihypertensives / CCB / ACEi / ARB (C02, C08, C09)
    (r'\b(amlodipine|felodipine|manidipine|lercanidipine|verapamil|diltiazem|nicardipine|nifedipine|hydralazine|methyldopa|clonidine)\b', 'C08CA', 'ANTIHYPERTENSIVE', 'Calcium Channel Blockers & Antihypertensives'),
    (r'\b(enalapril|lisinopril|ramipril|losartan|valsartan|candesartan|irbesartan|telmisartan|captopril|perindopril|olmesartan)\b', 'C09AA', 'ANTIHYPERTENSIVE', 'ACE Inhibitors & Angiotensin II Antagonists'),
    # 12. Antidiabetic Drugs (A10)
    (r'\b(metformin|glipizide|glimepiride|gliclazide|pioglitazone|linagliptin|sitagliptin|vildagliptin|empagliflozin|dapagliflozin|insulin|mixtard|lantus|novorapid|humalog|ryzodeg)\b', 'A10B', 'ANTIDIABETIC DRUGS', 'Blood Glucose Lowering Drugs'),
]

# ATC Prefix to FRID Group Mapping
# Note: R06 is restricted to 1st-generation sedating antihistamines (R06AA, R06AB, R06AD, R06AX02)
# 2nd-generation antihistamines (R06AE cetirizine, R06AX13 loratadine, R06AX26 fexofenadine, etc.) are NOT FRIDs.
ATC_PREFIX_TO_FRID = {
    'N05B': ('sedative / hypnotics', 'Sedatives & Anxiolytics'),
    'N05C': ('sedative / hypnotics', 'Hypnotics & Sedatives'),
    'N05A': ('ANTIPSYCHOTIC', 'Antipsychotics'),
    'N06A': ('Antidepressant', 'Antidepressants'),
    'N03A': ('ANTIEPILEPTIC', 'Antiepileptics'),
    'N02A': ('NARCOTICs', 'Opioids'),
    'M01A': ('NSAIDs', 'NSAIDs'),
    'R06AA': ('ANTIHISTAMINE', '1st-gen Antihistamines (Aminoalkyl ethers)'),
    'R06AB': ('ANTIHISTAMINE', '1st-gen Antihistamines (Substituted alkylamines)'),
    'R06AD': ('ANTIHISTAMINE', '1st-gen Antihistamines (Phenothiazine derivatives)'),
    'R06AX02': ('ANTIHISTAMINE', '1st-gen Antihistamines (Cyproheptadine)'),
    'C03':  ('DIURETICS', 'Diuretics'),
    'G04CA':('Alpha-1 adrenergic antagonist', 'Alpha-1 Blockers'),
    'C02CA':('Alpha-1 adrenergic antagonist', 'Alpha-1 Blockers'),
    'C07':  ('BETA-BLOCKING AGENTS', 'Beta-Blockers'),
    'C08':  ('ANTIHYPERTENSIVE', 'Calcium Channel Blockers'),
    'C09':  ('ANTIHYPERTENSIVE', 'ACEi / ARB'),
    'C02':  ('ANTIHYPERTENSIVE', 'Antihypertensives'),
    'A10':  ('ANTIDIABETIC DRUGS', 'Antidiabetics'),
}

def map_atc_to_frid_group(atc_code: str):
    if not atc_code or not isinstance(atc_code, str):
        return None, None
    atc_clean = atc_code.strip().upper()
    for pfx, (grp, desc) in ATC_PREFIX_TO_FRID.items():
        if atc_clean.startswith(pfx):
            return grp, desc
    return None, None

def reload_db_mappings(db=None):
    """
    Refreshes in-memory manual_dict from database table drug_atc_mappings
    """
    global manual_dict
    try:
        from ..database import SessionLocal, DrugAtcMapping
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True
        mappings = db.query(DrugAtcMapping).all()
        for m in mappings:
            if m.icode:
                manual_dict[str(m.icode).strip()] = str(m.atc_code).strip().upper()
        if close_db:
            db.close()
    except Exception as e:
        # If DB not yet ready or during startup
        pass

# Initial load from DB
try:
    reload_db_mappings()
except Exception:
    pass

def save_drug_atc_mapping(
    icode: str, 
    atc_code: str, 
    atc_desc: str = '', 
    frid_group: str = '', 
    drug_name: str = '', 
    generic_name: str = '', 
    tmt_code: str = '',
    did: str = '',
    source: str = 'API',
    db = None
):
    """
    Saves an accepted ATC mapping for a drug icode to database, updates manual_dict,
    and appends/updates manual_atc_mapping.csv. Supports TMT code and DID 24 digits.
    """
    global manual_dict
    from ..database import SessionLocal, DrugAtcMapping
    from ..config import settings
    from datetime import datetime

    icode_clean = str(icode).strip()
    atc_clean = str(atc_code).strip().upper()
    tmt_clean = str(tmt_code).strip() if tmt_code else None
    did_clean = str(did).strip() if did else None

    if not frid_group:
        inferred_grp, inferred_desc = map_atc_to_frid_group(atc_clean)
        frid_group = inferred_grp or 'OTHER'
        if not atc_desc:
            atc_desc = inferred_desc or ''

    # 1. Update in-memory dict
    manual_dict[icode_clean] = atc_clean

    # 2. Update Database
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
    try:
        record = db.query(DrugAtcMapping).filter(DrugAtcMapping.icode == icode_clean).first()
        if record:
            record.atc_code = atc_clean
            record.atc_description = atc_desc
            record.frid_group = frid_group
            record.drug_name = drug_name or record.drug_name
            record.generic_name = generic_name or record.generic_name
            if tmt_clean: record.tmt_code = tmt_clean
            if did_clean: record.did = did_clean
            record.source = source
            record.hospital_code = settings.HOSPITAL_CODE
            record.updated_at = datetime.utcnow()
        else:
            record = DrugAtcMapping(
                icode=icode_clean,
                drug_name=drug_name,
                generic_name=generic_name,
                atc_code=atc_clean,
                atc_description=atc_desc,
                frid_group=frid_group,
                tmt_code=tmt_clean,
                did=did_clean,
                hospital_code=settings.HOSPITAL_CODE,
                source=source,
                updated_at=datetime.utcnow()
            )
            db.add(record)
        db.commit()
    except Exception as e:
        print(f"[ATCTagger Save DB Error] {e}")
        db.rollback()
    finally:
        if close_db:
            db.close()

    # 3. Persist to CSV as persistent backup
    try:
        if os.path.exists(csv_path):
            df_m = pd.read_csv(csv_path)
            df_m['icode'] = df_m['icode'].astype(str).str.strip()
            if icode_clean in df_m['icode'].values:
                df_m.loc[df_m['icode'] == icode_clean, 'specify_atc'] = atc_clean
            else:
                new_row = pd.DataFrame([{'icode': icode_clean, 'specify_atc': atc_clean}])
                df_m = pd.concat([df_m, new_row], ignore_index=True)
            df_m.to_csv(csv_path, index=False)
    except Exception as e:
        print(f"[ATCTagger Save CSV Warning] {e}")

    return {
        'icode': icode_clean,
        'atc_code': atc_clean,
        'atc_description': atc_desc,
        'frid_group': frid_group,
        'drug_name': drug_name,
        'generic_name': generic_name,
        'tmt_code': tmt_clean,
        'did': did_clean
    }

def update_drug_tmt_mapping(icode: str, tmt_code: str = '', did: str = '', atc_code: str = '', db = None):
    """
    Directly updates TMT Code and DID 24-digit for an existing drug.
    """
    from ..database import SessionLocal, DrugAtcMapping
    from datetime import datetime
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
        icode_clean = str(icode).strip()
        record = db.query(DrugAtcMapping).filter(DrugAtcMapping.icode == icode_clean).first()
        if record:
            if tmt_code: record.tmt_code = str(tmt_code).strip()
            if did: record.did = str(did).strip()
            if atc_code:
                record.atc_code = str(atc_code).strip().upper()
                grp, desc = map_atc_to_frid_group(record.atc_code)
                record.frid_group = grp or record.frid_group
                record.atc_description = desc or record.atc_description
            record.updated_at = datetime.utcnow()
            db.commit()
            return {"status": "success", "icode": icode_clean, "tmt_code": record.tmt_code, "did": record.did, "atc_code": record.atc_code}
        else:
            return {"status": "not_found", "icode": icode_clean}
    except Exception as e:
        db.rollback()
        return {"status": "error", "error": str(e)}
    finally:
        if close_db:
            db.close()

def sync_all_tmt_codes_from_his(db = None):
    """
    Scans HIS drugitems table and syncs all DID (24-digit) and TMT codes
    into local DrugAtcMapping table automatically.
    """
    from ..adapters.factory import get_his_adapter
    from ..database import SessionLocal, DrugAtcMapping
    from ..config import settings
    from datetime import datetime

    adapter = get_his_adapter()
    df_his = adapter.fetch_hospital_formulary(limit=5000)
    if df_his.empty:
        return {"status": "no_data", "count": 0}

    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    synced = 0
    newly_mapped = 0

    try:
        for _, r in df_his.iterrows():
            ic = str(r['icode']).strip()
            dname = str(r.get('drug_name', ''))
            gname = str(r.get('generic_name', ''))
            did_val = str(r['did']).strip() if pd.notna(r.get('did')) and str(r.get('did')).strip() != '' else None
            tmt_val = str(r['tmt_tp_code']).strip() if pd.notna(r.get('tmt_tp_code')) and str(r.get('tmt_tp_code')).strip() != '' else None
            if not tmt_val and pd.notna(r.get('tmt_gp_code')) and str(r.get('tmt_gp_code')).strip() != '':
                tmt_val = str(r.get('tmt_gp_code')).strip()

            rec = db.query(DrugAtcMapping).filter(DrugAtcMapping.icode == ic).first()
            if rec:
                updated = False
                if did_val and rec.did != did_val:
                    rec.did = did_val
                    updated = True
                if tmt_val and rec.tmt_code != tmt_val:
                    rec.tmt_code = tmt_val
                    updated = True
                if updated:
                    rec.updated_at = datetime.utcnow()
                    synced += 1
            else:
                # Resolve ATC via tag_drug_atc
                atc, grp, desc = tag_drug_atc(ic, drug_name=dname, generic_name=gname, did=did_val or '', tmt_code=tmt_val or '')
                if atc:
                    new_rec = DrugAtcMapping(
                        icode=ic,
                        drug_name=dname,
                        generic_name=gname,
                        atc_code=atc,
                        atc_description=desc,
                        frid_group=grp,
                        tmt_code=tmt_val,
                        did=did_val,
                        hospital_code=settings.HOSPITAL_CODE,
                        source='TMT_SYNC',
                        updated_at=datetime.utcnow()
                    )
                    db.add(new_rec)
                    manual_dict[ic] = atc
                    newly_mapped += 1

        db.commit()
        return {"status": "success", "updated_tmt_count": synced, "newly_mapped_count": newly_mapped, "total_scanned": len(df_his)}
    except Exception as e:
        db.rollback()
        return {"status": "error", "error": str(e)}
    finally:
        if close_db:
            db.close()

def clean_drug_search_term(raw_term: str) -> str:
    """Cleans drug string from dosages, forms, and special characters for API searching."""
    if not raw_term:
        return ""
    q = str(raw_term).strip()
    # Remove strength / units (e.g. 500 mg, 5mg, 10 ml, 100 iu, 2.5mg, 0.5%)
    q = re.sub(r'\b\d+(\.\d+)?\s*(mg|g|ml|mcg|iu|%)\b', '', q, flags=re.I)
    # Remove formulation words (tab, cap, inj, susp, etc.)
    q = re.sub(r'\b(tablet|tab|capsule|cap|injection|inj|syrup|susp|suspension|cream|gel|drop|drops|sol|solution|oint|ointment|eye|ear)\b', '', q, flags=re.I)
    # Remove punctuation
    q = re.sub(r'[\(\)\[\]\/\,\+\-\*\#\:]', ' ', q)
    # Remove standalone numbers
    q = re.sub(r'\b\d+\b', '', q)
    return " ".join(q.split())

def search_atc_from_api(query: str, generic_name: str = '') -> list:
    """
    Searches WHO-ATC classification using NIH NLM RxNav (RxClass) API
    with fallback to local formulation matching.
    """
    import urllib.request
    import urllib.parse
    import json

    results = []
    seen_atc = set()

    def add_result(atc_code, class_name, match_term="", source="NIH RxNav (WHO-ATC)"):
        if not atc_code:
            return
        code = str(atc_code).strip().upper()
        if code in seen_atc:
            return
        seen_atc.add(code)
        
        frid_grp, frid_desc = map_atc_to_frid_group(code)
        results.append({
            'atc_code': code,
            'class_name': class_name or frid_desc or 'WHO-ATC Classified',
            'matched_term': match_term,
            'frid_group': frid_grp,
            'frid_desc': frid_desc,
            'is_frid': frid_grp is not None,
            'source': source
        })

    # Prepare search terms
    search_candidates = []
    if generic_name and str(generic_name).strip():
        search_candidates.append(clean_drug_search_term(generic_name))
        search_candidates.append(str(generic_name).strip())
    if query and str(query).strip():
        search_candidates.append(clean_drug_search_term(query))
        search_candidates.append(str(query).strip())

    # De-duplicate search terms while preserving order
    clean_terms = []
    for t in search_candidates:
        if t and len(t) >= 2 and t.lower() not in clean_terms:
            clean_terms.append(t.lower())

    # 1. Query NIH NLM RxNav API
    for term in clean_terms[:2]:
        # Fast guard: RxNav only indexes English characters, skip non-ascii (Thai)
        if any(ord(c) > 127 for c in term):
            continue

        encoded = urllib.parse.quote(term)
        # 1a. Try byDrugName
        try:
            url_by_name = f"https://rxnav.nlm.nih.gov/REST/rxclass/class/byDrugName.json?drugName={encoded}&relaSource=ATC"
            req = urllib.request.Request(url_by_name, headers={'User-Agent': 'SaiBuri-FallRisk-CDS/1.0'})
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                data = json.loads(resp.read().decode())
                info_list = data.get('rxclassDrugInfoList', {}).get('rxclassDrugInfo', [])
                for info in info_list:
                    item = info.get('rxclassMinConceptItem', {})
                    c_id = item.get('classId')
                    c_name = item.get('className')
                    add_result(c_id, c_name, match_term=term)
        except Exception:
            pass

        # 1b. Try approximateTerm to resolve brand to generic RxCUI
        if len(results) < 2:
            try:
                url_approx = f"https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term={encoded}&maxEntries=2"
                req = urllib.request.Request(url_approx, headers={'User-Agent': 'SaiBuri-FallRisk-CDS/1.0'})
                with urllib.request.urlopen(req, timeout=2.0) as resp:
                    data = json.loads(resp.read().decode())
                    candidates = data.get('approximateGroup', {}).get('candidate', [])
                    for cand in candidates:
                        if cand.get('source') == 'ATC' and cand.get('rxcui'):
                            rxcui = cand.get('rxcui')
                            c_url = f"https://rxnav.nlm.nih.gov/REST/rxclass/class/byRxcui.json?rxcui={rxcui}&relaSource=ATC"
                            req_c = urllib.request.Request(c_url, headers={'User-Agent': 'SaiBuri-FallRisk-CDS/1.0'})
                            with urllib.request.urlopen(req_c, timeout=2.0) as c_resp:
                                c_data = json.loads(c_resp.read().decode())
                                for c_info in c_data.get('rxclassDrugInfoList', {}).get('rxclassDrugInfo', []):
                                    c_item = c_info.get('rxclassMinConceptItem', {})
                                    add_result(c_item.get('classId'), c_item.get('className'), match_term=cand.get('name') or term)
            except Exception:
                pass

        if len(results) >= 3:
            break


    # 2. Local Formulary & Regex Rules Fallback
    full_text = f"{query} {generic_name}".lower()
    for pattern, atc_pfx, frid_grp, desc in ATC_REGEX_RULES:
        if re.search(pattern, full_text, re.IGNORECASE):
            add_result(atc_pfx, desc, match_term=pattern, source="Hospital Formulary Rules")

    # Sort results: FRID groups first, then by code length
    results.sort(key=lambda x: (not x['is_frid'], len(x['atc_code'])))

    return results

def tag_drug_atc(
    icode: str, 
    drug_name: str = '', 
    generic_name: str = '', 
    raw_group: str = '',
    did: str = '',
    tmt_code: str = ''
):
    """
    Converts patient drug into standard ATC Code & FRID Group using 
    CHABA manual mapping, TMT/DID standard codes, regex, and therapeutic groups.
    """
    icode_str = str(icode).strip()
    
    # 1. Check CHABA manual mapping dictionary first
    if icode_str in manual_dict:
        atc_code = manual_dict[icode_str]
        frid_grp, desc = map_atc_to_frid_group(atc_code)
        if frid_grp:
            return atc_code, frid_grp, desc
        return atc_code, raw_group or 'OTHER', desc or 'ATC Mapped'

    # 1.1 Check cross-hospital DID 24-digit or TMT code if provided
    did_clean = str(did).strip() if did else ''
    tmt_clean = str(tmt_code).strip() if tmt_code else ''
    if did_clean or tmt_clean:
        try:
            from ..database import SessionLocal, DrugAtcMapping
            with SessionLocal() as db:
                q = db.query(DrugAtcMapping)
                if did_clean:
                    match_rec = q.filter(DrugAtcMapping.did == did_clean, DrugAtcMapping.atc_code.isnot(None)).first()
                elif tmt_clean:
                    match_rec = q.filter(DrugAtcMapping.tmt_code == tmt_clean, DrugAtcMapping.atc_code.isnot(None)).first()
                else:
                    match_rec = None
                
                if match_rec and match_rec.atc_code:
                    manual_dict[icode_str] = match_rec.atc_code
                    return match_rec.atc_code, match_rec.frid_group or 'OTHER', match_rec.atc_description or 'TMT Mapped'
        except Exception:
            pass

    # 2. Match against formulation regex rules
    search_text = f"{drug_name} {generic_name} {raw_group}".lower()
    for pattern, atc_pfx, frid_grp, desc in ATC_REGEX_RULES:
        if re.search(pattern, search_text, re.IGNORECASE):
            return atc_pfx, frid_grp, desc

    # 3. Fallback to existing therapeutic group
    if raw_group and str(raw_group).strip():
        rg_upper = str(raw_group).strip().upper()
        if 'SEDATIVE' in rg_upper or 'HYPNOTIC' in rg_upper:
            return 'N05BA', 'sedative / hypnotics', 'Sedatives & Hypnotics'
        elif 'PSYCHOTIC' in rg_upper:
            return 'N05A', 'ANTIPSYCHOTIC', 'Antipsychotics'
        elif 'DEPRESS' in rg_upper:
            return 'N06A', 'Antidepressant', 'Antidepressants'
        elif 'EPILEPTIC' in rg_upper or 'CONVULS' in rg_upper:
            return 'N03A', 'ANTIEPILEPTIC', 'Antiepileptics'
        elif 'NARCOTIC' in rg_upper or 'OPIOID' in rg_upper:
            return 'N02A', 'NARCOTICs', 'Opioids'
        elif 'NSAID' in rg_upper:
            return 'M01A', 'NSAIDs', 'NSAIDs'
        elif 'HISTAMINE' in rg_upper:
            # Per AGS Beers 2023: Only 1st generation / sedating antihistamines are FRIDs
            if any(term in rg_upper for term in ['1ST', 'FIRST', 'SEDAT', 'CPM', 'CHLORPHEN']):
                return 'R06AB', 'ANTIHISTAMINE', 'First-generation Sedating Antihistamines'
            else:
                return 'R06A', 'NON_FRID', 'Non-sedating Antihistamines (Non-FRID)'
        elif 'DIURETIC' in rg_upper:
            return 'C03', 'DIURETICS', 'Diuretics'
        elif 'BETA' in rg_upper:
            return 'C07A', 'BETA-BLOCKING AGENTS', 'Beta-Blockers'
        elif 'HYPERTENS' in rg_upper:
            return 'C08CA', 'ANTIHYPERTENSIVE', 'Antihypertensives'
        elif 'DIABET' in rg_upper:
            return 'A10B', 'ANTIDIABETIC DRUGS', 'Antidiabetics'

    return None, raw_group or 'NON_FRID', 'Unclassified'


def resolve_atc_from_tmt_gpu(gpu_name: str = '', substance_name: str = '', generic_name: str = '', drug_name: str = '', session_cache: dict = None) -> tuple:
    """
    Resolves WHO-ATC Code and FRID group from TMT GPU and substance using RxNav API and fallback rules.
    Returns: (atc_code, frid_group, description, source)
    """
    if session_cache is None:
        session_cache = {}

    candidates = []
    if substance_name and str(substance_name).strip():
        candidates.append(str(substance_name).strip().lower())
    if gpu_name and str(gpu_name).strip():
        cleaned_gpu = clean_drug_search_term(gpu_name).lower()
        if cleaned_gpu and cleaned_gpu not in candidates:
            candidates.append(cleaned_gpu)
    if generic_name and str(generic_name).strip():
        cleaned_gen = clean_drug_search_term(generic_name).lower()
        if cleaned_gen and cleaned_gen not in candidates:
            candidates.append(cleaned_gen)
    if drug_name and str(drug_name).strip():
        cleaned_drg = clean_drug_search_term(drug_name).lower()
        if cleaned_drg and cleaned_drg not in candidates:
            candidates.append(cleaned_drg)

    for term in candidates:
        if not term or len(term) < 2:
            continue
        if term in session_cache:
            res = session_cache[term]
            if res:
                return res
            continue

        # Try API search
        api_results = search_atc_from_api(term, generic_name=term)
        if api_results:
            best = api_results[0]
            atc = best['atc_code']
            grp = best.get('frid_group') or 'OTHER'
            desc = best.get('class_name') or best.get('frid_desc') or 'WHO-ATC Classified'
            src = best.get('source') or 'NIH RxNav (WHO-ATC)'
            res = (atc, grp, desc, src)
            session_cache[term] = res
            return res

        session_cache[term] = None

    # Fallback to formulation regex
    full_text = f"{substance_name} {gpu_name} {generic_name} {drug_name}".lower()
    for pattern, atc_pfx, frid_grp, desc in ATC_REGEX_RULES:
        if re.search(pattern, full_text, re.IGNORECASE):
            return atc_pfx, frid_grp, desc, "Hospital Formulary Rules"

    return None, None, None, None


TMT_RESOLVE_PROGRESS = {
    "is_running": False,
    "status": "idle",
    "current_index": 0,
    "total": 0,
    "percent": 0.0,
    "current_drug": "",
    "has_tmt_count": 0,
    "resolved_atc_count": 0,
    "newly_mapped_count": 0,
    "frid_mapped_count": 0,
    "message": "พร้อมสำหรับการประมวลผล",
    "error": None,
    "started_at": None,
    "completed_at": None
}

def get_auto_resolve_progress() -> dict:
    """Returns a snapshot of the current auto-resolve progress."""
    global TMT_RESOLVE_PROGRESS
    return dict(TMT_RESOLVE_PROGRESS)

def run_batch_auto_resolve_task(force_remap: bool = False, limit: int = 5000):
    """
    Safely executes batch_auto_resolve_hospital_tmt in a background thread.
    Manages dedicated SQLAlchemy session from pool and guarantees closure.
    """
    global TMT_RESOLVE_PROGRESS
    if TMT_RESOLVE_PROGRESS.get("is_running"):
        return {"status": "already_running", "message": "งานกำลังประมวลผลอยู่แล้ว"}

    from ..database import SessionLocal
    db = SessionLocal()
    try:
        return batch_auto_resolve_hospital_tmt(force_remap=force_remap, limit=limit, db=db)
    finally:
        db.close()


def batch_auto_resolve_hospital_tmt(force_remap: bool = False, limit: int = 5000, db = None) -> dict:
    """
    Automated pipeline (Version 1.3.0):
    1. Fetches drugs with TMT hierarchy (TPU -> GPU -> Substance) from HIS adapter.
    2. Maps unmapped drugs or all (if force_remap) using NIH RxNav API + local formulation rules.
    3. Saves results into PostgreSQL drug_atc_mappings and memory dictionary.
    4. Continuously updates TMT_RESOLVE_PROGRESS for real-time frontend monitoring.
    """
    global TMT_RESOLVE_PROGRESS
    from ..adapters.factory import get_his_adapter
    from ..database import SessionLocal, DrugAtcMapping
    from ..config import settings
    from datetime import datetime

    TMT_RESOLVE_PROGRESS.update({
        "is_running": True,
        "status": "running",
        "current_index": 0,
        "total": 0,
        "percent": 0.0,
        "current_drug": "กำลังโหลดข้อมูลบัญชียาจาก HIS...",
        "has_tmt_count": 0,
        "resolved_atc_count": 0,
        "newly_mapped_count": 0,
        "frid_mapped_count": 0,
        "message": "กำลังโหลดข้อมูลบัญชียาจาก HIS...",
        "error": None,
        "started_at": datetime.utcnow().isoformat(),
        "completed_at": None
    })

    adapter = get_his_adapter()
    df_tmt = adapter.fetch_drugs_with_tmt_hierarchy(limit=limit)
    if df_tmt.empty:
        res = {
            "status": "no_data",
            "total_drugs": 0,
            "has_tmt_count": 0,
            "resolved_atc_count": 0,
            "newly_mapped_count": 0,
            "frid_mapped_count": 0,
            "message": "ไม่พบรายการยาจากฐานข้อมูล HIS"
        }
        TMT_RESOLVE_PROGRESS.update({
            "is_running": False,
            "status": "completed",
            "percent": 100.0,
            "message": "ไม่พบรายการยาจากฐานข้อมูล HIS",
            "completed_at": datetime.utcnow().isoformat()
        })
        return res

    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    total_drugs = len(df_tmt)
    has_tmt_count = 0
    resolved_atc_count = 0
    newly_mapped_count = 0
    frid_mapped_count = 0

    TMT_RESOLVE_PROGRESS.update({
        "total": total_drugs,
        "message": f"เริ่มวิเคราะห์รายการยา {total_drugs} รายการ..."
    })

    session_cache = {}

    try:
        existing_records = {r.icode: r for r in db.query(DrugAtcMapping).all()}

        for idx, (_, row) in enumerate(df_tmt.iterrows()):
            curr_idx = idx + 1
            icode = str(row['icode']).strip()
            drug_name = str(row.get('drug_name', '')).strip()
            generic_name = str(row.get('generic_name', '')).strip()
            did = str(row.get('did', '')).strip() if pd.notna(row.get('did')) else None
            tpu_code = str(row.get('tpu_code', '')).strip() if pd.notna(row.get('tpu_code')) else None
            gpu_code = str(row.get('gpu_code', '')).strip() if pd.notna(row.get('gpu_code')) else None
            gpu_name = str(row.get('gpu_name', '')).strip() if pd.notna(row.get('gpu_name')) else ''
            substance_name = str(row.get('substance_name', '')).strip() if pd.notna(row.get('substance_name')) else ''

            # Update live progress
            disp_drug = drug_name
            if generic_name:
                disp_drug += f" ({generic_name})"
            elif gpu_name:
                disp_drug += f" [{gpu_name}]"

            TMT_RESOLVE_PROGRESS["current_index"] = curr_idx
            TMT_RESOLVE_PROGRESS["percent"] = round((curr_idx / total_drugs) * 100, 1)
            TMT_RESOLVE_PROGRESS["current_drug"] = disp_drug[:90]

            if (tpu_code and tpu_code != 'None') or (gpu_code and gpu_code != 'None'):
                has_tmt_count += 1
                TMT_RESOLVE_PROGRESS["has_tmt_count"] = has_tmt_count

            rec = existing_records.get(icode)

            if rec and rec.atc_code and not force_remap:
                updated = False
                if did and rec.did != did:
                    rec.did = did; updated = True
                tmt_val = tpu_code if (tpu_code and tpu_code != 'None') else (gpu_code if (gpu_code and gpu_code != 'None') else None)
                if tmt_val and not rec.tmt_code:
                    rec.tmt_code = tmt_val; updated = True
                if updated:
                    rec.updated_at = datetime.utcnow()
                resolved_atc_count += 1
                TMT_RESOLVE_PROGRESS["resolved_atc_count"] = resolved_atc_count
                if rec.frid_group and rec.frid_group not in ['OTHER', 'NON_FRID', 'Unclassified']:
                    frid_mapped_count += 1
                    TMT_RESOLVE_PROGRESS["frid_mapped_count"] = frid_mapped_count
                continue

            atc, grp, desc, src = resolve_atc_from_tmt_gpu(
                gpu_name=gpu_name,
                substance_name=substance_name,
                generic_name=generic_name,
                drug_name=drug_name,
                session_cache=session_cache
            )

            if atc:
                resolved_atc_count += 1
                TMT_RESOLVE_PROGRESS["resolved_atc_count"] = resolved_atc_count
                is_frid = grp and grp not in ['OTHER', 'NON_FRID', 'Unclassified']
                if is_frid:
                    frid_mapped_count += 1
                    TMT_RESOLVE_PROGRESS["frid_mapped_count"] = frid_mapped_count

                tmt_to_save = tpu_code if (tpu_code and tpu_code != 'None') else (gpu_code if (gpu_code and gpu_code != 'None') else (rec.tmt_code if rec else None))
                did_to_save = did or (rec.did if rec else None)

                if rec:
                    rec.atc_code = atc
                    rec.atc_description = desc or rec.atc_description
                    rec.frid_group = grp or rec.frid_group
                    rec.tmt_code = tmt_to_save
                    rec.did = did_to_save
                    rec.source = f"TMT_GPU_API ({src})"
                    rec.updated_at = datetime.utcnow()
                else:
                    new_rec = DrugAtcMapping(
                        icode=icode,
                        drug_name=drug_name,
                        generic_name=generic_name,
                        atc_code=atc,
                        atc_description=desc,
                        frid_group=grp,
                        tmt_code=tmt_to_save,
                        did=did_to_save,
                        hospital_code=settings.HOSPITAL_CODE,
                        source=f"TMT_GPU_API ({src})",
                        updated_at=datetime.utcnow()
                    )
                    db.add(new_rec)
                    existing_records[icode] = new_rec

                manual_dict[icode] = atc
                newly_mapped_count += 1
                TMT_RESOLVE_PROGRESS["newly_mapped_count"] = newly_mapped_count
            else:
                if rec:
                    tmt_val = tpu_code if (tpu_code and tpu_code != 'None') else (gpu_code if (gpu_code and gpu_code != 'None') else None)
                    if tmt_val and not rec.tmt_code:
                        rec.tmt_code = tmt_val
                        rec.updated_at = datetime.utcnow()

        db.commit()
        success_msg = f"ประมวลผล TMT/GPU สำเร็จ {total_drugs} รายการ (พบ TMT/GPU {has_tmt_count} รายการ, จับคู่ ATC ได้ {resolved_atc_count} รายการ, เป็นยาเสี่ยง FRID {frid_mapped_count} รายการ)"
        TMT_RESOLVE_PROGRESS.update({
            "is_running": False,
            "status": "completed",
            "percent": 100.0,
            "message": success_msg,
            "completed_at": datetime.utcnow().isoformat()
        })
        return {
            "status": "success",
            "total_drugs": total_drugs,
            "has_tmt_count": has_tmt_count,
            "resolved_atc_count": resolved_atc_count,
            "newly_mapped_count": newly_mapped_count,
            "frid_mapped_count": frid_mapped_count,
            "message": success_msg
        }
    except Exception as e:
        db.rollback()
        err_msg = f"เกิดข้อผิดพลาดในการประมวลผล TMT: {e}"
        print(f"[batch_auto_resolve_hospital_tmt Error] {e}")
        TMT_RESOLVE_PROGRESS.update({
            "is_running": False,
            "status": "error",
            "error": str(e),
            "message": err_msg,
            "completed_at": datetime.utcnow().isoformat()
        })
        return {
            "status": "error",
            "total_drugs": total_drugs,
            "has_tmt_count": has_tmt_count,
            "resolved_atc_count": resolved_atc_count,
            "newly_mapped_count": newly_mapped_count,
            "frid_mapped_count": frid_mapped_count,
            "message": err_msg
        }
    finally:
        if close_db:
            db.close()


def get_hospital_tmt_summary(db = None) -> dict:
    """Returns coverage summary of TMT and ATC mapping in hospital formulary."""
    from ..database import SessionLocal, DrugAtcMapping
    from ..adapters.factory import get_his_adapter
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
    try:
        adapter = get_his_adapter()
        df_his = adapter.fetch_hospital_formulary(limit=5000)
        total_drugs = len(df_his)
        has_did = int(df_his['did'].dropna().astype(str).str.strip().ne('').sum()) if 'did' in df_his.columns else 0
        has_tmt = int((df_his['tmt_tp_code'].fillna('').ne('') | df_his['tmt_gp_code'].fillna('').ne('')).sum()) if 'tmt_tp_code' in df_his.columns else 0

        mappings = db.query(DrugAtcMapping).all()
        mapped_atc = sum(1 for m in mappings if m.atc_code and str(m.atc_code).strip() != '')
        mapped_frid = sum(1 for m in mappings if m.frid_group and m.frid_group not in ['OTHER', 'NON_FRID', 'Unclassified'])
        unmapped = max(0, total_drugs - mapped_atc)

        return {
            "total_drugs": total_drugs,
            "has_tmt": has_tmt,
            "has_did": has_did,
            "mapped_atc": mapped_atc,
            "mapped_frid": mapped_frid,
            "unmapped_count": unmapped
        }
    except Exception as e:
        print(f"[get_hospital_tmt_summary Error] {e}")
        return {
            "total_drugs": 0,
            "has_tmt": 0,
            "has_did": 0,
            "mapped_atc": 0,
            "mapped_frid": 0,
            "unmapped_count": 0
        }
    finally:
        if close_db:
            db.close()


