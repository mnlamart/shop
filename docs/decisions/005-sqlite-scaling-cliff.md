# ADR 005: SQLite Scaling Cliff — Trigger Conditions for Postgres Migration

## Status
Proposed

## Context
The Shop application currently uses SQLite with LiteFS for replication on Fly.io. This architecture works well at modest scale but has known limits. We need clear, measurable trigger conditions for when to migrate to Postgres — before we hit the scaling cliff, not after.

### LiteFS architecture at a glance
- **Single-primary, async replication** — only one node accepts writes; replicas receive LTX (LiteFS Transaction) files asynchronously
- **FUSE-based write path** — all writes pass through a FUSE layer that intercepts SQLite's VFS calls
- **Consul-based leader election** — 10-second lease TTL + ~1 second lock acquisition delay; reads remain available during failover
- **No plans for multi-primary** — the LiteFS project explicitly states this is out of scope

### Known limits (from official Fly.io documentation)
- **~100 transactions/second** — the FUSE layer becomes the bottleneck under sustained write pressure. This is documented by the LiteFS maintainers, not an observed anecdote.
- **Subsecond replication lag same-region**, growing to 5+ seconds under sustained write load. Cross-region adds network RTT on top.
- **No hard database size limit**, but <=10GB is typical. Larger databases make LTX replay slower on failover.
- **Cost: ~$6-10/month** for a 2-node HA cluster on Fly.io (shared CPU-1x VMs + LiteFS Cloud backup). Managed Postgres starts at $15-29/month and scales higher.

## Decision
Define five measurable trigger conditions. When **any two** are met simultaneously for a sustained period (≥24 hours), initiate the Postgres migration planning.

### Trigger 1: Write Throughput
**Threshold: >80 sustained write transactions/second over a 5-minute rolling window**

Rationale: The documented ~100 txn/sec limit is a ceiling, not a cruising altitude. At 80% of ceiling, headroom is too thin for traffic spikes. Monitor via `sqlite3_status(SQLITE_STATUS_MALLOC_COUNT)` or application-level write counter (INSERT/UPDATE/DELETE on the orders and cart tables).

### Trigger 2: P95 Write Latency
**Threshold: >200ms p95 for write operations measured at the application level**

Rationale: LiteFS FUSE interception adds latency on every write because the FUSE daemon must journal the LTX before acknowledging the syscall. At low throughput this is negligible (<10ms). Under load, the FUSE queue depth grows and p95 spikes before hard saturation. This is the canary — latency degrades before throughput caps. Measure with a Prisma middleware or Express middleware that records write operation duration.

### Trigger 3: Replication Lag
**Threshold: >5 seconds of replication lag sustained for ≥10 minutes**

Rationale: LiteFS replication is asynchronous. Same-region lag is subsecond under normal load, but the LTX replay on replicas falls behind when write throughput exceeds the replica's ability to apply transactions. Chronic lag >5s means read replicas are serving stale data. Monitor via the LiteFS `/debug/vars` HTTP endpoint (`replication_lag_seconds` or equivalent).

### Trigger 4: Multi-Region Requirements
**Threshold: Need for synchronous replication OR read-after-write consistency across regions**

Rationale: LiteFS cannot do synchronous replication or multi-primary. If the business requires:
- Cross-region deployments where users in different regions write to local primaries
- Read-after-write consistency guarantees across regions (e.g., a customer in Europe places an order and immediately checks order status on a US-facing read replica)
- RPO (Recovery Point Objective) <5 seconds

…then SQLite+LiteFS is the wrong tool. Postgres with streaming replication (sync or async), or a managed solution like Crunchy Postgres with cross-region read replicas, is the correct path.

### Trigger 5: Order Volume / Database Size
**Threshold: >100,000 orders in the database OR >8GB database file size**

Rationale: While LiteFS has no hard size limit, LTX replay time grows with database size. At >100K orders with associated rows (order items, shipments, payments, events), the database will be several GB. A failover with a multi-GB LTX backlog can take minutes rather than the ~11 seconds of an idle setup. Additionally, analytical queries (admin dashboards, reporting) on SQLite become slow without materialized views or foreign data wrappers.

## Consequences

### Positive
- ✅ **Clear, measurable gates** — no subjective "it feels slow". Every trigger can be monitored with existing tooling.
- ✅ **Proactive migration** — triggers fire at 80% of known ceiling, not at crash point
- ✅ **Two-of-five rule** — prevents migration for isolated spikes (e.g., a flash sale that hits trigger 1 but not 2 or 3)
- ✅ **Operational visibility** — instrumenting these metrics improves observability regardless of migration decision

### Negative
- ⚠️ **Monitoring infrastructure needed** — we must build the instrumentation before the triggers can fire. This is scoped as a separate task.
- ⚠️ **Migration cost** — Postgres on Fly.io (or another provider) is 2-4× the cost of SQLite+LiteFS at current scale
- ⚠️ **May never trigger** — If the business stays within SQLite's comfort zone indefinitely, these conditions serve as documentation rather than active triggers

### Neutral
- 📝 **Review cadence** — these thresholds should be reviewed quarterly. As the application evolves, new query patterns may change the effective ceiling.
- 📝 **Fly.io Postgres** — If we stay on Fly.io, their managed Postgres integrates naturally. If we move, the migration target changes but the trigger conditions remain valid.

## Alternatives Considered

### Alternative 1: Migrate to Postgres immediately
- Proactive, avoids any scaling cliff risk
- Problem: Premature optimization. Current scale (~hundreds of orders per day) is orders of magnitude below the SQLite ceiling. Postgres adds $15-29/month in operational cost and database administration complexity that isn't justified today.

### Alternative 2: Wait for actual failure, then migrate
- Zero upfront work
- Problem: Reactive and risky. A scaling cliff during a traffic spike means downtime during the migration window. The trigger conditions in this ADR give us lead time.

### Alternative 3: Turso (libsql) as intermediate step
- libsql offers HTTP-based replication with Turso's managed platform
- Problem: Different replication model, vendor lock-in, and Shop already uses `better-sqlite3` (not libsql). A migration to Turso is comparable effort to Postgres but with less ecosystem maturity.

### Alternative 4: Use Litestream (streaming backup) instead of LiteFS
- Litestream provides continuous WAL backup to S3, but no replication
- Problem: No read replicas, no failover. Each node has its own SQLite file; multi-region means eventual consistency with no replication protocol. LiteFS is the right choice for the current single-primary HA setup.

## Trigger Monitoring (implementation notes)

Each trigger should be monitored via a cron-style check that writes to structured logs or a metrics endpoint:

| Trigger | Source | Measurement |
|---------|--------|------------|
| 1. Write throughput | App-level counter (Prisma middleware) | `rate(insert+update+delete, 5m)` |
| 2. P95 write latency | Express/Prisma middleware | `histogram_quantile(0.95, write_duration_seconds)` |
| 3. Replication lag | LiteFS `/debug/vars` | `replication_lag_seconds > 5` for 10+ min |
| 4. Multi-region needs | Business requirement | Boolean: do we need multi-region writes? |
| 5. Order volume / DB size | `SELECT COUNT(*) FROM Order` + `stat db` | `>100000` OR `>8GB` |

## Related Decisions
- ADR 001: Price Storage as Integer Cents (uses SQLite integer storage)
- ADR 002: Store-Level Currency Configuration (uses SQLite relations)
- ADR 003: Carrier Coupling — Mondial Relay Hardcoded, Abstraction Deferred (carrier-specific columns on SQLite tables)

## References
- [LiteFS Documentation](https://fly.io/docs/litefs/) — official architecture and limits
- [LiteFS FAQ](https://fly.io/docs/litefs/faq/) — throughput and scale questions
- [LiteFS Architecture](https://github.com/superfly/litefs/blob/main/docs/ARCHITECTURE.md) — FUSE layer and LTX replication details
- [Fly.io Postgres](https://fly.io/docs/postgres/) — managed Postgres on Fly.io
- Issue: [#162](https://github.com/mnlamart/shop/issues/162) — operational excellence: scaling cliff assessment
