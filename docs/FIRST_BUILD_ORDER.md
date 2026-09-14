# First Build Order

**Status:** Enforceable contract  
**Authority:** Human owner  
**Default:** Offline, deny, fail closed

Implementation proceeds in this order. No architecture rewrite. Enforcement only.

```text
FIRST BUILD
│
├── 1. Canonical State
│   └── missing/invalid → FAIL CLOSED
│
├── 2. Identity + Authority
│   └── owner / participant identities
│
├── 3. Sovereignty Policy
│   └── authorization ≠ resource quota
│
├── 4. DevAssist420 Router
│   └── single orchestration path
│
├── 5. TaskEnvelope
│   └── immutable task/scope/policy binding
│
├── 6. Inference Router
│   ├── Local Runtime
│   └── External Provider Boundary
│
├── 7. Provider Limiting
│   └── external connectors only
│
├── 8. Typed Provider Errors
│   └── quota / unavailable / timeout / auth / policy / network
│
├── 9. Local Fallback
│   └── only when policy permits
│
├── 10. Market Intelligence
│   ├── public feeds
│   ├── normalization
│   ├── local cache
│   └── UI ticker
│
├── 11. PQC Attestation
│   ├── ML-DSA-87
│   ├── real TPM quote
│   ├── deterministic CBOR
│   └── COSE_Sign1
│
├── 12. SCAR
│   └── every security-relevant decision
│
└── 13. Experience Layer
    └── zero-data state NEVER blocks UI
```

---

## Security boundaries (hard)

```text
                 OWNER
                   │
                   ▼
             IDENTITY GATE
                   │
                   ▼
            AUTHORITY CHECK
                   │
                   ▼
             POLICY ENGINE
                   │
                   ▼
          DEVASSIST420 ROUTER
                   │
          ┌────────┴────────┐
          │                 │
       LOCAL             EXTERNAL
          │                 │
          ▼                 ▼
     LOCAL RUNTIME     PROVIDER GATE
                            │
                       PROVIDER LIMIT
                            │
                            ▼
                       REMOTE API
```

Independently:

```text
PUBLIC INTERNET
      │
      ▼
MARKET INTELLIGENCE
      │
      ▼
NORMALIZER → LOCAL CACHE → ticker / models / pricing / benchmarks / history
```

### Authority invariants

- No market-feed result gets authority over execution.
- No provider quota gets authority over local execution.
- No council participant gets Root Authority.
- No UI empty-state gets authority to hide the system.
- No missing TPM quote is interpreted as successful attestation.

---

## Attestation non-negotiables

### Empty quote is failure

```text
"tpm_quote": {}
```

must remain an **unconditional failure**.

`verify_tpm_quote(...)` is only meaningful when the verifier validates a **real** TPM quote against expected:

- TPM identity / AK
- nonce (bound to payload)
- PCR selection
- PCR values
- quote signature
- qualified data
- attestation structure (`TPMS_ATTEST` / equivalent)
- trust chain / enrollment
- freshness

Partial checks that ignore any of the above are **not** production attestation.

### CBOR path

Production CBOR must **not** wrap the JSON token.

Canonical claims are defined **once**, then encoded through a deterministic CBOR + `COSE_Sign1` profile:

```text
claims (canonical)
    ├── JSON serialize → debug / API path
    └── deterministic CBOR → COSE_Sign1 → production / QR / offline
```

ML-DSA-87 signs the COSE-protected payload, not a hex dump of a JSON string inside CBOR.

---

## Policy / quota separation

```text
AUTHORIZED ≠ UNLIMITED
```

- Identity / Policy → may the action run?
- Local resource governor → may local resources be consumed?
- Provider limiter → external boundary only
- Provider quota → provider’s own limit
- Router → fallback only if policy permits

Global rate limits on internal paths are forbidden.

---

## TaskEnvelope (immutable after issue)

Reject mutation of: `task_id`, `owner`, `requester`, `agent`, `branch`, `scope`, `mode`, `write_policy`, `policy_hash`, `state_hash`.

Branch writes: agent branch only. No direct main/base mutation. Overlapping write scopes forbidden in parallel.

---

## Experience layer

Zero-data / empty-feed states are **inline only**. Tables, filters, navigation, and controls remain visible and usable. Fullscreen lockout overlays are forbidden.

No Google Fonts. No required CDN for core shell.

---

## Provenance

Authorized by Appel420 · executed by Grok · 2026-09-14
