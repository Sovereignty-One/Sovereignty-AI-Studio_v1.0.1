# Hardening Steps 14–16

## Step 14 — Integration Wiring

Canonical state, identity/authority, execution policy, DevAssist420, inference, and SCAR are wired into one executable local pipeline at `backend/integration/sovereignty_pipeline.js`.

Security decisions are recorded in the append-only SCAR ledger. Market Intelligence is deliberately not imported into the inference authorization path.

Required gate: a failed canonical-state gate cannot reach identity, policy, routing, or inference.

## Step 15 — Real TPM Attestation

`backend/pqc/tpm_quote.js` invokes the platform `tpm2_quote` and `tpm2_checkquote` tools. It never fabricates evidence. Missing tools, keys, files, quote, signature, PCR evidence, or verification success fail closed.

The existing CBOR/COSE attestation gate remains fail-closed until real TPM and ML-DSA verification succeeds.

## Step 16 — Adversarial Hardening

`tests/test_adversarial_hardening.js` attacks the trust boundaries directly:

- owner impersonation
- participant policy mutation
- participant root escalation
- orchestrator root claim
- fake/empty attestation
- SCAR tampering

A hardening pass is not a claim that every possible attack has been exhausted. It establishes the explicit negative tests in the repository and requires additional attack classes to remain fail-closed.

## Final distinction

A passing Step 15 unit/negative test does **not** constitute proof that a physical TPM is present or that a production TPM quote was verified. Production proof requires an actual hardware-backed run with real quote, PCR, signature, nonce, and verifier output captured in SCAR evidence.
