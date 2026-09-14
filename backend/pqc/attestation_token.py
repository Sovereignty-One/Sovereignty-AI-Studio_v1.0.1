#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GATEONE PQC Attestation — Token Generator + Verifier

ML-DSA-87 (Dilithium) persistent keys, SCAR logging, optional QR,
FastAPI /verify-attestation endpoint.

Fail closed on missing/invalid TPM quote.
"""
from __future__ import annotations

import json
import os
import secrets
import time
from typing import Any, Optional

import oqs
from fastapi import FastAPI
from pydantic import BaseModel, Field

# Optional QR — only required when output_qr is requested
try:
    import qrcode
except ImportError:  # pragma: no cover
    qrcode = None  # type: ignore

# Optional TPM bridge — real module; fail closed if absent at verify time
try:
    from gateone_enclave.tpm_attestation import verify_tpm_quote
except ImportError:  # pragma: no cover

    def verify_tpm_quote(tpm_quote: Any, nonce: str) -> bool:
        """Fail closed: no TPM bridge means attestation is not valid."""
        return False


# ---------------------------
# Configuration
# ---------------------------
SIG_ALG = "ML-DSA-87"
KEY_DIR = os.environ.get("GATEONE_KEY_DIR", os.path.join(os.path.expanduser("~"), ".gateone", "keys"))
SCAR_LOG_PATH = os.environ.get(
    "GATEONE_SCAR_LOG",
    os.path.join(os.path.expanduser("~"), ".gateone", "scar.log"),
)
os.makedirs(KEY_DIR, exist_ok=True)
os.makedirs(os.path.dirname(SCAR_LOG_PATH) or ".", exist_ok=True)

PUB_KEY_FILE = os.path.join(KEY_DIR, "dilithium_pub.key")
PRIV_KEY_FILE = os.path.join(KEY_DIR, "dilithium_priv.key")

# ---------------------------
# Persistent Key Management
# ---------------------------
signer = oqs.Signature(SIG_ALG)
if os.path.exists(PRIV_KEY_FILE) and os.path.exists(PUB_KEY_FILE):
    with open(PRIV_KEY_FILE, "rb") as f:
        secret = f.read()
    signer.import_secret_key(secret)
    with open(PUB_KEY_FILE, "rb") as f:
        PUBLIC_KEY = f.read()
else:
    PUBLIC_KEY = signer.generate_keypair()
    with open(PRIV_KEY_FILE, "wb") as f:
        f.write(signer.export_secret_key())
    with open(PUB_KEY_FILE, "wb") as f:
        f.write(PUBLIC_KEY)
    os.chmod(PRIV_KEY_FILE, 0o600)
    os.chmod(PUB_KEY_FILE, 0o644)


# ---------------------------
# SCAR Logging (append-only)
# ---------------------------
def scar_log(entry: dict) -> None:
    entry = dict(entry)
    entry["timestamp"] = time.time()
    with open(SCAR_LOG_PATH, "a", encoding="utf-8") as log_file:
        log_file.write(json.dumps(entry, sort_keys=True) + "\n")


# ---------------------------
# Token Generator
# ---------------------------
def generate_attestation_token(
    node_id: str,
    output_qr: Optional[str] = None,
    tpm_quote: Optional[dict] = None,
) -> str:
    """
    Build and sign an attestation token.

    tpm_quote must be a real TPM 2.0 quote structure when TPM is required.
    Passing None or {} causes verification to fail closed.
    """
    payload = {
        "node_id": node_id,
        "timestamp": time.time(),
        "nonce": secrets.token_hex(32),
    }
    message_bytes = json.dumps(payload, sort_keys=True).encode("utf-8")
    signature = signer.sign(message_bytes)

    token = {
        "payload": payload,
        "signature": signature.hex(),
        "public_key": PUBLIC_KEY.hex(),
        "tpm_quote": tpm_quote if tpm_quote is not None else {},
        "algorithm": SIG_ALG,
    }

    token_json = json.dumps(token, sort_keys=True)
    scar_log({"event": "token_generated", "node_id": node_id})

    if output_qr:
        if qrcode is None:
            raise RuntimeError("qrcode package not installed; cannot write QR")
        img = qrcode.make(token_json)
        img.save(output_qr)
        scar_log({"event": "qr_generated", "file": output_qr, "node_id": node_id})

    return token_json


# ---------------------------
# FastAPI Verifier
# ---------------------------
app = FastAPI(title="GATEONE PQC Verifier", version="1.0.0")


class AttestationToken(BaseModel):
    attestation_token: str
    max_age_seconds: int = Field(default=300, ge=1, le=86400)


@app.post("/verify-attestation")
async def verify_attestation(token: AttestationToken) -> dict:
    try:
        data = json.loads(token.attestation_token)
        payload = data.get("payload") or {}
        signature_hex = data.get("signature") or ""
        public_key_hex = data.get("public_key") or ""
        tpm_quote = data.get("tpm_quote")

        node_id = payload.get("node_id")
        ts = float(payload.get("timestamp") or 0)
        age = time.time() - ts

        if age > token.max_age_seconds or age < 0:
            scar_log({"event": "verify", "result": "stale_token", "node_id": node_id, "age": age})
            return {"valid": False, "reason": "token_too_old"}

        message_bytes = json.dumps(payload, sort_keys=True).encode("utf-8")
        signature = bytes.fromhex(signature_hex)
        public_key = bytes.fromhex(public_key_hex)

        verifier = oqs.Signature(SIG_ALG)
        is_dilithium_valid = bool(verifier.verify(message_bytes, signature, public_key))

        # Fail closed: empty or missing TPM quote is invalid
        if not tpm_quote:
            is_tpm_valid = False
        else:
            is_tpm_valid = bool(verify_tpm_quote(tpm_quote, payload.get("nonce", "")))

        result = is_dilithium_valid and is_tpm_valid
        scar_log(
            {
                "event": "verify",
                "node_id": node_id,
                "dilithium_valid": is_dilithium_valid,
                "tpm_valid": is_tpm_valid,
                "result": result,
            }
        )

        if result:
            return {
                "valid": True,
                "node_id": node_id,
                "algorithm": "ML-DSA-87 + TPM 2.0",
            }
        return {
            "valid": False,
            "dilithium_valid": is_dilithium_valid,
            "tpm_valid": is_tpm_valid,
        }
    except Exception as e:
        scar_log({"event": "verify_error", "error": str(e)})
        return {"valid": False, "reason": str(e)}


# ---------------------------
# CLI
# ---------------------------
if __name__ == "__main__":
    token_json = generate_attestation_token(
        "REPMHL-NODE-01",
        output_qr="attestation_qr.png",
        tpm_quote=None,  # real TPM quote required for verify pass
    )
    print("Attestation Token:", token_json)
    print("QR code saved to attestation_qr.png (if qrcode installed)")
    print("NOTE: tpm_quote is empty → verify will FAIL CLOSED until real TPM quote is supplied.")
