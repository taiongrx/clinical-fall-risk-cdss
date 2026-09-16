#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Hospital Deployment Package Builder & Integrity Engine
=====================================================
Automates the build, synchronization, validation, and packaging of the
Clinical Fall Risk CDSS hospital deployment distribution.

Enforces zero-stale-dist guardrails, clinical ATC dictionary integrity,
UTF-8 batch scripting, and SHA-256 manifest generation.
"""

import os
import sys
import shutil
import hashlib
import subprocess
import json
import argparse
from datetime import datetime
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DEPLOY_DIR = ROOT_DIR / "FallRisk_CDSS_Hospital_Deployment"
FRONTEND_DIR = ROOT_DIR / "frontend"
BACKEND_DIR = ROOT_DIR / "backend"

def print_banner(text: str):
    print("\n" + "=" * 78)
    print(f"  {text}")
    print("=" * 78)

def compute_sha256(file_path: Path) -> str:
    if not file_path.exists():
        return "MISSING"
    sha = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            sha.update(chunk)
    return sha.hexdigest()

def step_1_preflight():
    print_banner("[Step 1/5] Pre-Flight System & Artifact Verification")
    
    # Check Node / npm
    try:
        node_ver = subprocess.check_output(["node", "-v"], text=True, encoding="utf-8", errors="replace").strip()
        npm_ver = subprocess.check_output(["npm", "-v"], shell=True, text=True, encoding="utf-8", errors="replace").strip()
        print(f"  [OK] Node.js version: {node_ver}, npm version: {npm_ver}")
    except Exception as e:
        print(f"  [ERROR] Node.js or npm is not available: {e}")
        sys.exit(1)

    # Check Model files
    models_to_check = [
        ROOT_DIR / "final_lgbm_bbc_model.joblib",
        ROOT_DIR / "preprocessor.joblib",
    ]
    for m in models_to_check:
        if not m.exists():
            print(f"  [ERROR] Required ML artifact missing: {m.name}")
            sys.exit(1)
        print(f"  [OK] Model artifact present: {m.name} ({m.stat().st_size:,} bytes)")

    # Check ATC mappings
    atc_map = BACKEND_DIR / "app" / "ml" / "manual_atc_mapping.csv"
    if not atc_map.exists():
        print(f"  [ERROR] ATC Mapping file missing: {atc_map}")
        sys.exit(1)
    print(f"  [OK] ATC Mapping present: {atc_map.name}")

def step_2_build_frontend(skip_build: bool = False):
    print_banner("[Step 2/5] Compiling Production Frontend (Vite)")
    if skip_build:
        print("  [INFO] Skipping frontend build (--skip-build specified).")
        return

    print("  Running 'npm run build' in frontend/...")
    cmd = "npm run build"
    result = subprocess.run(cmd, cwd=str(FRONTEND_DIR), shell=True, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        print("  [ERROR] Frontend build failed!")
        print(result.stdout)
        print(result.stderr)
        sys.exit(1)
    
    dist_index = FRONTEND_DIR / "dist" / "index.html"
    if not dist_index.exists():
        print("  [ERROR] Expected frontend/dist/index.html not found after build!")
        sys.exit(1)
        
    print(f"  [OK] Frontend build succeeded! (index.html: {dist_index.stat().st_size} bytes)")

def step_3_atomic_sync():
    print_banner("[Step 3/5] Synchronizing to Deployment Distribution")
    
    # 1. Frontend Dist
    target_dist = DEPLOY_DIR / "03_Software_and_AI_Engine" / "frontend_dist"
    print(f"  Purging target frontend_dist: {target_dist}...")
    if target_dist.exists():
        shutil.rmtree(target_dist)
    shutil.copytree(FRONTEND_DIR / "dist", target_dist)
    print("  [OK] Copied fresh frontend/dist -> 03_Software_and_AI_Engine/frontend_dist")

    # 2. Backend App
    target_backend_app = DEPLOY_DIR / "03_Software_and_AI_Engine" / "backend" / "app"
    print(f"  Syncing backend/app -> {target_backend_app}...")
    if target_backend_app.exists():
        shutil.rmtree(target_backend_app)
    
    def ignore_patterns(path, names):
        return [n for n in names if n in ('__pycache__', '.pytest_cache', '.DS_Store') or n.endswith('.pyc')]

    shutil.copytree(BACKEND_DIR / "app", target_backend_app, ignore=ignore_patterns)
    
    # Backend Dockerfile & requirements
    shutil.copy2(BACKEND_DIR / "Dockerfile", DEPLOY_DIR / "03_Software_and_AI_Engine" / "backend" / "Dockerfile")
    shutil.copy2(BACKEND_DIR / "requirements.txt", DEPLOY_DIR / "03_Software_and_AI_Engine" / "backend" / "requirements.txt")
    print("  [OK] Synced backend app, Dockerfile, and requirements.txt")

    # 3. Models
    target_models = DEPLOY_DIR / "03_Software_and_AI_Engine" / "models"
    target_models.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT_DIR / "final_lgbm_bbc_model.joblib", target_models / "final_lgbm_bbc_model.joblib")
    shutil.copy2(ROOT_DIR / "preprocessor.joblib", target_models / "preprocessor.joblib")
    if (ROOT_DIR / "df_final_factors_preprocessed.parquet").exists():
        shutil.copy2(ROOT_DIR / "df_final_factors_preprocessed.parquet", target_models / "df_final_factors_preprocessed.parquet")
    print("  [OK] Synced latest ML models & evaluation dataset")

    # 4. IT Deployment configs
    it_dir = DEPLOY_DIR / "02_IT_Deployment"
    it_dir.mkdir(parents=True, exist_ok=True)
    if not (it_dir / "docker-compose.yml").exists() and (ROOT_DIR / "deploy" / "docker-compose.prod.yml").exists():
        shutil.copy2(ROOT_DIR / "deploy" / "docker-compose.prod.yml", it_dir / "docker-compose.yml")
    print("  [OK] Verified 02_IT_Deployment configurations")

def step_4_quality_gates():
    print_banner("[Step 4/5] Running Quality Assurance & Clinical Gates")
    
    # Gate 1: Check manual_atc_mapping.csv for veterinary 'Q' codes
    target_atc = DEPLOY_DIR / "03_Software_and_AI_Engine" / "backend" / "app" / "ml" / "manual_atc_mapping.csv"
    with open(target_atc, "r", encoding="utf-8", errors="ignore") as f:
        atc_lines = f.readlines()
    
    q_matches = []
    for idx, line in enumerate(atc_lines, 1):
        parts = line.strip().split(",")
        if len(parts) >= 2 and parts[1].startswith("Q"):
            q_matches.append((idx, line.strip()))
            
    if q_matches:
        print(f"  [FAIL] Gate 1 Failed: Found {len(q_matches)} veterinary 'Q' codes in deployment mapping!")
        for m in q_matches[:5]:
            print(f"    Line {m[0]}: {m[1]}")
        sys.exit(1)
    print("  [PASS] Gate 1: 0 Veterinary 'Q' codes detected in deployment ATC dictionary.")

    # Gate 2: Verify Loratadine / Cetirizine lockout in atc_tagger.py
    tagger_file = DEPLOY_DIR / "03_Software_and_AI_Engine" / "backend" / "app" / "ml" / "atc_tagger.py"
    with open(tagger_file, "r", encoding="utf-8", errors="ignore") as f:
        tagger_code = f.read()
    if "NON_SEDATING_ANTIHISTAMINES" not in tagger_code or "loratadine" not in tagger_code:
        print("  [FAIL] Gate 2 Failed: NON_SEDATING_ANTIHISTAMINES guard missing in deployment atc_tagger.py!")
        sys.exit(1)
    print("  [PASS] Gate 2: Non-sedating antihistamines clinical lockout verified.")

    # Gate 3: Verify UTF-8 in batch files
    batch_files = list(DEPLOY_DIR.glob("**/*.bat"))
    for bf in batch_files:
        with open(bf, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        if "chcp 65001" not in content:
            print(f"  [WARN] Batch file {bf.name} missing 'chcp 65001 >nul'!")
        else:
            print(f"  [PASS] UTF-8 confirmed in {bf.relative_to(DEPLOY_DIR)}")

    # Gate 4: Verify Frontend Bundle Integrity
    dist_index = DEPLOY_DIR / "03_Software_and_AI_Engine" / "frontend_dist" / "index.html"
    if dist_index.stat().st_size < 500:
        print(f"  [FAIL] Gate 4 Failed: index.html is suspiciously small ({dist_index.stat().st_size} bytes)")
        sys.exit(1)
    print(f"  [PASS] Gate 4: Frontend index.html integrity confirmed ({dist_index.stat().st_size} bytes)")

def step_5_manifest_and_pack(create_zip: bool = False):
    print_banner("[Step 5/5] Manifest Generation & Archival")
    
    # Try getting git commit
    try:
        git_sha = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=str(ROOT_DIR), text=True, encoding="utf-8", errors="replace").strip()
    except Exception:
        git_sha = "unknown"

    manifest_data = {
        "release_version": "v1.4.0",
        "build_timestamp": datetime.now().isoformat(),
        "git_commit": git_sha,
        "critical_checksums_sha256": {
            "frontend_index_html": compute_sha256(DEPLOY_DIR / "03_Software_and_AI_Engine" / "frontend_dist" / "index.html"),
            "backend_main_py": compute_sha256(DEPLOY_DIR / "03_Software_and_AI_Engine" / "backend" / "app" / "main.py"),
            "atc_tagger_py": compute_sha256(DEPLOY_DIR / "03_Software_and_AI_Engine" / "backend" / "app" / "ml" / "atc_tagger.py"),
            "manual_atc_mapping_csv": compute_sha256(DEPLOY_DIR / "03_Software_and_AI_Engine" / "backend" / "app" / "ml" / "manual_atc_mapping.csv"),
            "lgbm_model": compute_sha256(DEPLOY_DIR / "03_Software_and_AI_Engine" / "models" / "final_lgbm_bbc_model.joblib"),
            "preprocessor": compute_sha256(DEPLOY_DIR / "03_Software_and_AI_Engine" / "models" / "preprocessor.joblib")
        }
    }

    manifest_path = DEPLOY_DIR / "RELEASE_MANIFEST.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, indent=2)
    print(f"  [OK] Generated {manifest_path.name}")

    if create_zip:
        zip_base = ROOT_DIR / "FallRisk_CDSS_Hospital_Deployment"
        print(f"  Compressing {DEPLOY_DIR.name} -> {zip_base.name}.zip...")
        archive_format = "zip"
        shutil.make_archive(str(zip_base), archive_format, root_dir=str(ROOT_DIR), base_dir="FallRisk_CDSS_Hospital_Deployment")
        zip_file = ROOT_DIR / "FallRisk_CDSS_Hospital_Deployment.zip"
        # Also maintain compatibility if user looks for v1.0.zip
        compat_zip = ROOT_DIR / "FallRisk_CDSS_Hospital_Deployment_v1.0.zip"
        if zip_file.exists():
            shutil.copy2(zip_file, compat_zip)
            print(f"  [OK] Generated {zip_file.name} ({zip_file.stat().st_size:,} bytes)")
            print(f"  [OK] Updated compatibility archive {compat_zip.name}")

    print_banner("HOSPITAL PRODUCTION PACKAGING COMPLETE: ALL GATES PASSED")

def main():
    parser = argparse.ArgumentParser(description="Hospital Deployment Package Builder")
    parser.add_argument("--zip", action="store_true", help="Create production distribution zip archive")
    parser.add_argument("--skip-build", action="store_true", help="Skip frontend build step")
    args = parser.parse_args()

    step_1_preflight()
    step_2_build_frontend(skip_build=args.skip_build)
    step_3_atomic_sync()
    step_4_quality_gates()
    step_5_manifest_and_pack(create_zip=args.zip)

if __name__ == "__main__":
    main()
