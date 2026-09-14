# Sovereignty AI Specification

**Operating Model:** v1.0  
**Status:** Draft for Architecture Freeze  
**Classification:** Core Platform Specification  
**Authority:** Human operator / device owner  
**Canonical state:** Required before startup  
**Default network mode:** Offline  
**Default decision:** Deny

---

## 1. Purpose

This specification defines the mandatory operating behavior of the Sovereignty AI platform.

Its purpose is to ensure that:

- authority is deterministic
- private information remains under user control
- network behavior is policy-driven
- every security-relevant action is auditable
- AI participants operate within bounded permissions
- the platform functions in disconnected, degraded, and connected environments

---

## 2. Scope

This specification governs:

- Authority
- Identity
- Policy
- Memory
- Networking
- Audit
- AI participation
- Market intelligence
- User interaction

This specification does **not** define:

- UI colors
- branding
- specific AI providers
- specific LLM implementations
- specific vector databases
- storage engines

Those remain implementation details.

---

## 3. Clarified Design Intent

### 3.1 Bloomberg = public intelligence feed

The ticker is **not** a feed of the user’s activity.
It is a market/intelligence feed similar to Bloomberg:

- new model releases
- provider announcements
- benchmark changes
- pricing
- context window changes
- API availability
- deprecations
- safety notices
- inference costs
- licensing updates

Example sources (policy-approved, read-only):

- Hugging Face model index
- OpenRouter model catalog
- OpenAI model catalog
- Anthropic model information
- xAI model information
- GitHub Models
- public benchmark feeds

User data never leaves the machine.

```text
PUBLIC INTERNET
        │
        ▼
 Market Intelligence
        │
        ▼
 Read-only Feed
        │
        ▼
 Sovereignty AI Terminal
```

Not:

```text
User → Cloud → Telemetry
```

Those are different trust models.

### 3.2 No Google Fonts

Do **not** fetch fonts from Google CDN.
Use local / system fonts only (e.g. SF Pro Display, SF Mono, Segoe UI, system-ui).

Google **may** appear as a provider in the model catalog and policy UI.
Provider visualization is independent of font loading.

### 3.3 UI must never lock out the operator

A fullscreen “NO DATA” overlay is forbidden.
Dashboards, tables, filters, menus, navigation, and search **SHALL** remain visible and interactive.

Acceptable empty states are inline only, for example:

```text
MODEL DATABASE
────────────────────────────
0 models loaded
Waiting for source...
[ Import Local ]  [ Connect Feed ]  [ Refresh ]
```

or:

```text
No feed connected.
Last successful update: Yesterday 18:42
Cached models: 1,523
Status: Read-only
```

### 3.4 Offline / Ghost / Connected

| Mode | Meaning |
|------|--------|
| **OFFLINE** | Everything local. No outbound connections. |
| **GHOST / HYBRID** | User identity, memory, vault, audit offline. Public market feed optional. No user information transmitted. |
| **CONNECTED / ONLINE** | Public feeds enabled under policy. Still: no telemetry, no automatic prompt upload, no vault sync, no personal analytics. Only public catalog requests. |

### 3.5 Local-first cache

```text
Internet
     │
Fetch on schedule / demand (policy)
     │
Normalize → canonical record
     │
Local DB / SQLite cache
     │
Ticker · Dashboard · Search · Charts · History
```

If the network disappears:

```text
LIVE FEED LOST
Using cached data
Last sync: <timestamp>
```

Everything continues working from cache.

### 3.6 Market Feed Engine adapters

```text
Market Feed Engine
├── HuggingFace
├── OpenRouter
├── OpenAI
├── Anthropic
├── xAI
├── GitHub Models
├── LM Arena / Artificial Analysis (optional)
└── Local Cache
```

Canonical record fields:

- Provider, Model, Version, Released
- Pricing, Context, Latency, License
- Status, Capabilities
- Last Updated, Source

UI never depends on a specific upstream format.

---

## 4. Requirements

### R-001 Human Authority

The human operator SHALL remain the Root Authority.
No AI participant SHALL obtain authority equal to or greater than the human.

### R-002 AI Participants

Every AI SHALL possess:

- Participant ID
- Name
- Provider
- Version
- Assigned Role
- Permission Set
- Audit Identity
- Configuration
- History

AI participants SHALL NOT be treated as human identities.

### R-003 Identity

Every participant SHALL have a unique immutable identifier.
Identity SHALL survive software upgrades.
Identity SHALL NOT depend upon provider APIs.

### R-004 Offline Operation

The platform SHALL operate without network connectivity.
The following SHALL continue functioning:

- Vault
- Search
- Memory
- Local inference
- Audit
- Dashboard
- Policy engine
- Router

### R-005 Hybrid Operation

Hybrid mode SHALL permit policy-approved public information retrieval.
Private information SHALL remain local.
Hybrid mode SHALL NOT upload prompts, documents, vault, memories, conversations, or user telemetry unless explicitly authorized by policy.

### R-006 Online Operation

Online mode SHALL remain governed by policy.
Network connectivity SHALL NOT bypass Authority, Policy, or Audit.

### R-007 Explicit Consent

Transition into a higher network mode SHALL require explicit user approval.

Example:

```text
Internet Available
Update Public Model Catalog?
[ YES ]  [ NO ]  [ REMIND LATER ]
```

### R-008 Public Market Intelligence

Market intelligence SHALL be classified as public information.
Examples: model releases, pricing, benchmarks, advisories, provider announcements.
Market intelligence SHALL NOT include user content.

### R-009 Local Cache

The dashboard SHALL read from a local cache.
Network failures SHALL NOT disable dashboard, search, history, ticker, or analytics.

### R-010 Evidence

Every policy-relevant event SHALL produce evidence including:

- timestamp
- participant
- action
- policy
- result
- integrity hash

Evidence SHALL be append-only (SCAR ledger).

### R-011 Context Engine

The platform SHALL distinguish between:

- Mission
- Family
- Meeting
- Phone Call
- Dictation
- Idle
- Background Conversation

Memory creation SHALL follow context policy.

### R-012 Unified Workspace

The platform SHALL present one operational inbox.
Internally each participant SHALL maintain history, memory, evidence, updates, and configuration.

### R-013 Canonical Persistent State

The platform SHALL load and verify canonical device-local state before starting the dashboard, router, council, provider adapters, credential access, or network services.

If canonical state is missing, invalid, stale, or unverifiable, the platform SHALL fail closed and record a local threat event.

### R-014 Owner-Control Plane

DevAssist420 SHALL operate as a device-local router, policy gate, watchdog, SCAR recorder, and owner-alert system. It SHALL NOT be an autonomous authority, model provider, marketplace, or replacement for the device firewall.

### R-015 State and Mission Separation

The platform SHALL distinguish **canonical runtime state** from **active mission state**.
Background conversation, idle activity, and family interaction may occur without an active mission, but never without verified canonical runtime state.

### R-016 Data Minimization

Private prompts, documents, vault contents, memories, conversations, credentials, session keys, and evidence SHALL remain local unless an explicit, scoped, owner-approved export capability exists.

### R-017 Blocked Activity Evidence

Denied network access, provider access, credential access, subprocess execution, filesystem access, policy mutation, and capability escalation SHALL produce local append-only evidence.

### R-018 Council Independence

AI council participants SHALL be treated as non-human participants with separate immutable identities, roles, permissions, configurations, histories, and evidence. Council output SHALL remain advisory unless the human owner authorizes the resulting action.

---

## 5. Non-Goals

Version 1 SHALL NOT implement:

- autonomous authority escalation
- unrestricted internet access
- provider-specific assumptions
- mandatory cloud synchronization
- mandatory online accounts
- permanent voice recording
- automatic personal data upload

---

## 6. Acceptance Criteria

### Authority

- [ ] Human always overrides AI
- [ ] AI cannot modify Root Authority
- [ ] Permission escalation rejected

### Offline

Disconnect network. Expected:

- [ ] Dashboard loads
- [ ] Vault opens
- [ ] Memory accessible
- [ ] Search operational
- [ ] Audit continues
- [ ] UI remains interactive (no fullscreen lockout)

### Hybrid

Enable Hybrid. Expected:

- [ ] Public feeds refresh (with consent)
- [ ] Private vault unchanged
- [ ] No prompt upload
- [ ] Cache updated
- [ ] Feed timestamp updated

### Online

Enable Online. Expected:

- [ ] Policy enforcement remains active
- [ ] Audit records network activity
- [ ] Authority unchanged

### Context

Speak with family:

- [ ] No interruption
- [ ] No mission execution
- [ ] No permanent memory write

Issue wake command:

- [ ] Context transitions
- [ ] Mission begins

### Evidence

Execute protected action:

- [ ] Evidence generated
- [ ] Hash generated
- [ ] Participant recorded
- [ ] Timestamp recorded

### Canonical state missing

- [ ] FAIL CLOSED
- [ ] NO PROVIDER ACCESS
- [ ] NO CREDENTIAL ACCESS
- [ ] NO NETWORK ACCESS
- [ ] NO MISSION EXECUTION
- [ ] LOCAL THREAT EVENT
- [ ] OWNER ALERT

---

## 7. Mode Matrix

| Capability | Offline | Hybrid | Online |
|------------|---------|--------|--------|
| Local Vault | ✓ | ✓ | ✓ |
| Local Memory | ✓ | ✓ | ✓ |
| Dashboard | ✓ | ✓ | ✓ |
| AI Council | ✓ | ✓ | ✓ |
| Public Feed | Cached | Live + Cache | Live |
| Model Updates | Manual Import | Policy Approved | Live |
| Internet Search | ✗ | Optional | ✓ |
| Telemetry Upload | ✗ | ✗ | Policy Only |
| Prompt Upload | ✗ | Policy Only | Policy Only |
| Audit | Local | Local | Local + Optional Export |

---

## 8. Trust Boundary Diagram

```text
                     ROOT AUTHORITY
                           │
                   Human Operator
                           │
──────────────────────────────────────────────────────
                 Authority Boundary
──────────────────────────────────────────────────────
                           │
                   Identity Plane
                           │
──────────────────────────────────────────────────────
              AI Participants
     ChatGPT · Claude · Grok · GitHub Copilot
     DuckAI · Planner · Judge · Reviewer · Synthesizer
──────────────────────────────────────────────────────
                Policy Boundary
──────────────────────────────────────────────────────
           Public Intelligence Engine
     Model Catalogs · Pricing · Benchmarks · Advisories · CVEs
──────────────────────────────────────────────────────
              Private Data Boundary
     Vault · Documents · Memory · Sessions
     Keys · Credentials · Evidence
──────────────────────────────────────────────────────
                 Experience Layer
     Dashboard · Terminal · Mobile · API
```

---

## 9. Data Classification

| Class | Description | Default Location | Network Policy |
|-------|-------------|------------------|----------------|
| Authority | Root ownership, permissions | Local | Never leaves without explicit export |
| Private | Vault, memory, conversations, documents | Local | Never leaves by default |
| Public | Model catalogs, releases, pricing, benchmarks | Local cache | Refreshable under policy |
| Evidence | Audit logs, hashes, signatures | Local append-only ledger | Optional signed export only |

---

## 10. State Machine

**Canonical interpretation (required):**

```text
NO ACTIVE MISSION STATE
    │
    ├── Family Conversation
    ├── Phone Call
    ├── Television
    ├── Background Speech
    └── Idle
            │
            ▼
      Owner-Authenticated Wake Event
            │
            ▼
ACTIVE MISSION STATE
    │
    ├── Mission
    ├── Coding
    ├── Dictation
    ├── Search
    ├── Review
    └── Administration
            │
            ▼
      Complete Mission
            │
            ▼
Return to NO ACTIVE MISSION STATE
```

At every point the platform still requires:

```text
canonical persistent device state
verified identity
active policy
local SCAR ledger
authority configuration
```

If canonical state is missing, invalid, or unverifiable:

```text
FAIL CLOSED
NO PROVIDER ACCESS
NO CREDENTIAL ACCESS
NO NETWORK ACCESS
NO MISSION EXECUTION
LOCAL THREAT EVENT
OWNER ALERT
```

**Key distinction:**

```text
No active mission:
  allowed, provided canonical device state is loaded and valid

No canonical state:
  threat condition; fail closed
```

---

## 11. Architecture Freeze Criteria

Version 1.0 is considered frozen when the following subsystems satisfy their acceptance criteria and expose stable interfaces:

```text
CanonicalStateLoader
IdentityProvider
AuthorityGate
PolicyEngine
ScarLedger
Vault
ContextEngine
CouncilRouter
MarketIntelligenceCache
ExperienceLayer
LocalOutbox
OwnerAlertSink
```

Future releases may extend these subsystems. Changes to core contracts should be additive and backward-compatible wherever practical.

---

## 12. Provenance

- Authority: Appel420 (device owner / Root)
- Draft assembled: 2026-09-14
- Incorporates operator clarifications: Bloomberg public feed, no Google Fonts, no UI lockout, offline-first, R-013–R-018, mission-state rename
