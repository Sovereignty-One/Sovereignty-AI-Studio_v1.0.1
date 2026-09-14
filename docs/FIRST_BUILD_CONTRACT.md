# First Build Contract

**Status:** Architecture freeze candidate  
**Authority:** Human owner (Appel420)  
**Orchestrator:** DevAssist420  
**Policy layer:** Sovereignty AI  
**Default mode:** Offline  
**Default decision:** Deny

---

## Boundary diagram (mandatory)

```text
                    HUMAN OWNER
                         │
                         ▼
                ┌─────────────────┐
                │ DevAssist420     │
                │ ORCHESTRATOR     │
                └────────┬────────┘
                         │
              ┌──────────▼──────────┐
              │ Sovereignty Policy  │
              │ Identity / RBAC     │
              │ Execution Policy    │
              └──────────┬──────────┘
                         │
              ┌──────────▼──────────┐
              │   Inference Router  │
              └──────┬────────┬─────┘
                     │        │
              LOCAL  │        │ EXTERNAL
                     │        │
              ┌──────▼──┐  ┌──▼────────────┐
              │ Local   │  │ Provider      │
              │ Runtime │  │ Boundary      │
              └─────────┘  │ xAI/OpenAI/…  │
                           └──────┬─────────┘
                                  │
                           Provider quota
                                  │
                                  ▼
                           External API

        ┌─────────────────────────────────────┐
        │ Market Intelligence                 │
        │ public metadata only                │
        │ HF / OpenRouter / provider catalogs │
        │ local cache                         │
        └─────────────────────────────────────┘

        ┌─────────────────────────────────────┐
        │ SCAR / Evidence                     │
        │ local append-only audit             │
        │ policy + identity + action + result │
        └─────────────────────────────────────┘
```

Market intelligence is **not** on the inference authorization path.

```text
Market Feed → Normalize → Local Cache → UI

Owner → Identity → Policy → DevAssist420 → Router → Runtime
```

---

## Hard invariants (enforcement, not documentation)

1. **Root Authority** — Human owner remains authoritative.
2. **DevAssist420** — Orchestrates routing. Does NOT become Root Authority.
3. **Sovereignty AI** — Enforces policy/council decisions. Does NOT become Root Authority.
4. **Local execution** — Must not depend on provider quota.
5. **External execution** — Passes through provider-specific boundary controls.
6. **Provider quota** — Can deny the provider request. Cannot deny the user's local platform access.
7. **Provider failure/quota** — Typed failure. Router decides whether policy permits local fallback.
8. **Branch writes** — Agent branch only. No direct main/base mutation.
9. **Scope ownership** — Two agents cannot simultaneously own overlapping write scope.
10. **Market intelligence** — Public metadata only. Never user prompts, memory, vault, credentials, or telemetry.
11. **Offline mode** — No network request whatsoever.
12. **Hybrid mode** — Only explicitly permitted public-data requests leave the device.
13. **Evidence** — Security-relevant decisions generate SCAR evidence.
14. **UI** — Zero-data state never hides the operational interface.
15. **Dependencies** — No Google Fonts. No unnecessary CDN runtime dependency.
16. **Persistent state** — Missing/unverifiable canonical state ⇒ FAIL CLOSED.

---

## Rate limiting (corrected)

**Do not implement** `admin: { requests: Infinity }`.

```text
Identity / Policy     → determines whether execution is authorized
Local resource governor → determines whether local execution can consume resources
Provider limiter      → protects external provider boundary only
Provider quota        → provider's own limitation
Router                → decides permitted fallback
```

**AUTHORIZED ≠ UNLIMITED**

An owner request can be authorized without being unlimited.

Global `express-rate-limit` on internal paths is forbidden.
Provider limiter applies only at the external connector boundary.

---

## Provider failure contract

Failures MUST be machine-distinguishable:

```text
ProviderQuotaError
ProviderUnavailableError
ProviderTimeoutError
ProviderAuthError
ProviderPolicyDeniedError
ProviderNetworkDeniedError
```

Only the appropriate classes may trigger fallback, and only when policy permits:

```text
xAI quota exhausted
       │
       ▼
ProviderQuotaError
       │
       ▼
DevAssist420 Router
       │
       ├── local fallback permitted → LOCAL
       │
       └── local fallback prohibited → DENY
```

Not:

```text
xAI failed → automatically use something else
```

That would bypass policy.

---

## TaskEnvelope (canonical, immutable after issuance)

```json
{
  "task_id": "local-generated-id",
  "owner": "Appel420",
  "requester": "owner",
  "agent": "copilot",
  "branch": "copilot",
  "scope": ["backend/market_intelligence"],
  "mode": "offline",
  "parallel_group": "market-intelligence-api",
  "conflicts_with": [],
  "write_policy": "branch-only",
  "requires_owner_approval": false,
  "policy_hash": "<canonical-policy-hash>",
  "state_hash": "<canonical-state-hash>"
}
```

After signed/issued, the router **rejects mutation** of:

- `task_id`
- `owner`
- `requester`
- `agent`
- `branch`
- `scope`
- `mode`
- `write_policy`
- `policy_hash`
- `state_hash`

### Branch ownership rules

- One agent owns a file scope at a time.
- Agents may run in parallel if scopes do not overlap.
- No direct writes to main/base.
- Conflicts elevate to council review.
- All results return through DevAssist420.
- Final integration requires owner approval.

### Branch map (agent → branch)

| Agent key | Branch |
|-----------|--------|
| ara-hardened | Ara/Grok |
| claude | Claude |
| gpt | GPT/Codex |
| copilot | GitHub Copilot |

---

## Module boundary

```text
backend/
├── identity/
│   └── identity_adapter.js
├── policy/
│   └── execution_policy.js
├── coordination/
│   └── devassist_router.py
├── inference/
│   ├── router.js
│   ├── local_runtime.js
│   └── xai_adapter.js
├── middleware/
│   └── providerratelimit.js
├── errors/
│   └── provider_errors.js
├── market_intelligence/
│   ├── engine.js
│   ├── normalizer.js
│   ├── cache.js
│   └── adapters/
│       ├── huggingface.js
│       ├── openrouter.js
│       ├── openai.js
│       ├── anthropic.js
│       ├── xai.js
│       └── github_models.js
├── state/
│   └── canonical_state.js
├── audit/
│   └── scar_logger.js
└── server.js
```

Experience layer entry (local static): HTTP/HTTPS on `127.0.0.1:9899` serving owner UI (no Google Fonts, no CDN runtime dependency required for core shell).

---

## Core invariants (summary)

```text
execution_policy  decides who may use what
xai_adapter       decides how remote calls happen
providerratelimit protects external boundary only
router            decides fallback instead of denial
```

External provider quotas shall never define internal platform availability.
Internal users are governed by Sovereignty AI policy and local resource controls.

---

## Migration checklist (rate limit)

1. Locate current limiter placement; remove global usage on internal paths.
2. Create provider boundary middleware (`backend/middleware/providerratelimit.js`).
3. Make provider failures typed (`ProviderQuotaError` and siblings).
4. Add regression tests for local fallback under policy.
5. Verify state separation for device-only / offline mode.
6. Ensure `express-rate-limit` (if used) exists only on provider boundary routes.

---

## Migration order (council / router)

1. Add canonical router contract (TaskEnvelope + immutable fields).
2. Add branch/scope conflict tests.
3. Route command bus through DevAssist420.
4. Mark duplicate routers as compatibility adapters.
5. Run local CI and verify.
6. Integrate only with owner approval.

---

## Provenance

Authorized by Appel420 · executed by Grok · 2026-09-14
