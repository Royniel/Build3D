# Build3D - print-on-demand order tracking

Three services behind Docker Compose:

| Service | Stack | Port | Responsibility |
|---|---|---|---|
| `frontend` | Next.js 15 + React 19 + Tailwind 4 | 3000 | Landing page and operator console. Server components only - the API token never reaches the browser |
| `django` | Django 5 + DRF + Postgres | 8000 | Owns the domain: machines, parts, orders, the status state machine, the audit log, auth |
| `quoting` | FastAPI + Pydantic v2 | 8001 | Stateless pricing. Given a material, a quantity and a bounding box, returns a price and a lead time |
| `postgres` | Postgres 16 | 5433 (host) | Django's database |

Django calls `POST http://quoting:8001/quote` over HTTP when an order is
created. If the quoting service is slow or down, the order is still saved - 
at status `quote_pending` - and never surfaces as a 500.

**Start here:** <http://localhost:3000>

---

## Order status flow

```
quote_pending ──▶ quoted ──▶ paid ──▶ printing ──▶ post_processing ──▶ qc ──▶ shipped
                                        │                              │
                                        ▼                              ▼
                                     failed ◀─────────────────────── failed
                                        │
                                        ▼
                                     reprint ──▶ printing
```

`shipped` is terminal. Anything not drawn above is rejected with a `400` and a
message naming what *is* allowed from the current status.

The whole specification is one dict - `ALLOWED_TRANSITIONS` in
[django_service/orders/services.py](django_service/orders/services.py) - and a
startup assertion fails if a status is ever added to the enum without being
added to the table.

On top of the graph there are four guards, also in the service layer:

- `quoted` requires a price and a lead time on the order.
- `paid` requires a price (you cannot charge for an unpriced order).
- `printing` requires an assigned machine...
- ...which must not be in `maintenance`, and whose technology must match the
  material (resins need SLA, nylons need SLS).

### Where the rules live, and why

`services.transition_order()` is the only way an order's status ever changes - 
not the view, not the serializer, not the admin. That matters because the rule
"you may not ship an unpaid order" has to hold whether the change arrives from
the API, a management command, a future Celery task or a `manage.py shell`
session. The view is a thin HTTP adapter; the admin's `status` field is
read-only for the same reason.

The function is wrapped in `@transaction.atomic`, so the `UPDATE` on the order
and the `INSERT` into the audit log commit together or not at all. There is a
test that forces the audit insert to fail and asserts the status change rolls
back with it.

---

## Setup

```bash
git clone <this repo> && cd Build3D
cp .env.example .env
docker compose up --build
```

That migrates the database, runs the seed command and starts all three services.
All three bind-mount their source and run with autoreload, so editing a file on
your machine reloads it in the container - no rebuild needed. (Rebuild only
when you change `requirements.txt`, `package.json` or a `Dockerfile`.)

One wrinkle worth knowing: Docker Desktop on macOS and Windows does not
propagate inotify events across a bind mount, so Next's file watcher would
never see your edits and would silently serve a stale compilation. The
frontend therefore runs with `WATCHPACK_POLLING=true`. Django's `StatReloader`
already polls, which is why that service never needed it.

Wait for `Starting development server at http://0.0.0.0:8000/`, then:

- **Web UI: <http://localhost:3000>**
- API root (browsable): <http://localhost:8000/api/>
- Django admin: <http://localhost:8000/admin/>
- Quoting service docs: <http://localhost:8001/docs>

### Seeded data

`docker compose up` runs `manage.py seed`, which creates 3 machines, 2 users
(one per role, each with an API token) and 5 orders in different statuses. The
orders are advanced by calling the service layer, so they arrive with a real
audit trail and cannot be in an impossible state.

| | |
|---|---|
| Machines | `Form-3L-A` (SLA, idle) · `Fuse-1-B` (SLS, idle) · `Form-3L-C` (SLA, **maintenance**) |
| Orders | one each at `quoted`, `paid`, `shipped`, `printing`, `failed` |
| Customer | `alice_customer` / `customer-pass-123` |
| Operator | `omar_operator` / `operator-pass-123` |

Tokens are printed at the end of the seed output:

```bash
docker compose logs django | grep -A4 'API tokens'
```

Re-run it any time (`--reset` wipes the demo rows first):

```bash
docker compose exec django python manage.py seed --reset
```

### A bigger dataset to explore

`seed` creates the minimum the spec calls for. For clicking around, `demo`
layers on a fuller shop - 7 machines, 5 users, and an order in **every one of
the nine statuses**, several with multi-step audit trails:

```bash
docker compose exec django python manage.py demo --reset
```

It prints an index of what it made, so you know which order to open:

```
Orders by status:
  quote_pending    #29          <- try POST /api/orders/29/requote/ on this one
  quoted           #24, #30, #31
  paid             #25, #32, #33
  printing         #27, #40, #41
  post_processing  #34
  qc               #35
  shipped          #26, #36, #37
  failed           #28, #38
  reprint          #39
```

| | |
|---|---|
| Customers | `alice_customer` · `bob_customer` · `priya_customer` - all `customer-pass-123` |
| Operators | `omar_operator` · `nina_operator` - both `operator-pass-123` |

The order on the `recovered` path has the most interesting history - it went
through both loops in the diagram:

```
             (new) -> quoted           Demo order.
            quoted -> paid             Invoice settled.
              paid -> printing         Build started.
          printing -> failed           Build failed: Layer shift at 40mm; recoater jam.
            failed -> reprint          Requeued for reprint.
           reprint -> printing         Build started.
          printing -> post_processing  Build complete; wash and cure.
   post_processing -> qc               Dimensional inspection in progress.
                qc -> shipped          Collected by courier.
```

Like `seed`, `demo` never writes `status=` directly - every order is walked
through `services.transition_order`, so nothing in the dataset could exist in
a state the state machine would refuse to produce. The `quote_pending` order is
real too: `fetch_quote` is made to return `None` for that one call, which is
exactly what it returns during an outage, so `create_order` takes its genuine
failure branch.

Log in as each of the three customers in turn to watch the ownership filter
work - the same `/api/orders/` URL returns 18 rows for an operator, 10 for
alice, 4 for bob, 4 for priya.

An admin login for <http://localhost:8000/admin/>:

```bash
docker compose exec django python manage.py createsuperuser
```

### Running without Docker

```bash
python -m venv .venv && source .venv/bin/activate

# Service 1
pip install -r django_service/requirements.txt
cd django_service
export POSTGRES_HOST=localhost POSTGRES_PORT=5433   # or USE_SQLITE=1
export QUOTING_SERVICE_URL=http://localhost:8001
python manage.py migrate && python manage.py seed
python manage.py runserver 8000

# Service 2, in another shell
pip install -r quoting_service/requirements.txt
cd quoting_service && uvicorn app.main:app --reload --port 8001
```

### Running without Docker

```bash
# Service 3, in a third shell
cd frontend && npm install
DJANGO_INTERNAL_URL=http://localhost:8000 \
QUOTING_INTERNAL_URL=http://localhost:8001 npm run dev
```

---

## The frontend

Next.js 15 (App Router) + React 19 + Tailwind 4. Five routes:

| Route | Auth | What it is |
|---|---|---|
| `/` | public | Landing page. Live counts, the state-machine diagram, and a working quote form |
| `/login` | public | Exchanges credentials for a DRF token |
| `/dashboard` | any role | Hero figure, KPI tiles, pipeline chart, printer panel, recent activity |
| `/orders`, `/orders/[id]` | any role | List with status filters; detail with transition controls and the audit timeline |
| `/machines` | any role | Fleet, utilisation meter, what each printer is running |

### How it talks to the backends

Every backend call runs **server-side** - in a server component or a server
action. Nothing calls Django from the browser. Three consequences:

- **The token is never exposed.** Login exchanges credentials for a DRF token
  and stores it in an `httpOnly` cookie, so browser JavaScript cannot read it
  and an XSS bug cannot exfiltrate it.
- **There is no CORS configuration anywhere**, because there are no
  cross-origin requests. Next reaches the backends by compose service name
  (`http://django:8000`), on the private network.
- **The backends need not be publicly reachable.** They are exposed on
  localhost here only so you can curl them.

Mutations go through server actions in
[frontend/lib/actions.ts](frontend/lib/actions.ts), which return
`{ ok, error }` rather than throwing. When the state machine rejects a move,
**the backend's own 400 message is shown verbatim** - that text is already
written for humans, so inventing frontend copy would only risk contradicting
it.

### Who can create what

| | Operator | Customer |
|---|---|---|
| Define a new part | yes | **no** - `403`, the catalogue is operator-only |
| Order an existing part | yes | **yes** - the order is pinned to them |
| Advance an order | yes | no - `403` |
| See others' orders | yes | no - `404`, filtered out in SQL |

So the two roles get different order forms, matching what each is permitted to
do. An operator defines a part and orders it in one step
([NewOrderPanel](frontend/components/NewOrderPanel.tsx)); a customer orders
from the catalogue the shop already offers
([CatalogueOrderPanel](frontend/components/CatalogueOrderPanel.tsx)). Both end
in `services.create_order`, which calls the quoting service and writes the
entry audit row.

Because quantity is a field on `Part` rather than on `Order`, ordering a
catalogue part orders the quantity that part specifies. That is the schema the
spec defines; changing it would be a migration, not a UI tweak.

### The UI never reimplements the rules

`TransitionControls` renders one button per entry in the order's
`allowed_transitions`, which the API computes from `ALLOWED_TRANSITIONS`. Add a
transition to the backend table and the button appears with no frontend change.

This is a convenience, not a security boundary - the service layer re-checks
every request, so a hand-crafted POST asking for an illegal move still gets a
400. Same for the role split: the customer view hides the controls, but the
enforcement is Django's permission classes plus a `WHERE` clause. Asking for
another customer's order returns **404, not 403** - the row was filtered out
before the object check, and a 403 would confirm it exists.

### Charts

Design tokens live in one block at the top of
[frontend/app/globals.css](frontend/app/globals.css), and components reference
roles (`--series-1`, `--status-critical`) rather than hex, so a brand palette
is a one-file change.

The pipeline chart is **a single series in one hue**. That is a deliberate
result, not laziness: seven ordered stages cannot hold a 7-step ordinal colour
ramp - adjacent steps fall below the 0.06 lightness-delta threshold and a
palette validator fails it. Bar length carries magnitude and row order carries
stage order, so spending hue on stage identity would have double-encoded what
the chart already shows. Gridlines sit at real, clean tick values; evenly
spaced lines that correspond to nothing invite the reader to measure against
nothing.

Status colours (`shipped`, `failed`, `reprint`) are the one place a fixed
status palette is used, and **every one ships with an icon and a text label**.
Those hues do not clear colourblind-separation gates - red vs green measure ΔE
4.1 under deuteranopia - so colour is never the only channel. Order *stages*
deliberately do not use status colours: a stage is identity, not a judgement,
and red for "qc" would be a status colour impersonating a series.

Each chart also has a table-view toggle, and hover and keyboard focus show the
same tooltip.

---

## Tests

```bash
# Django - 152 tests. Needs Postgres (docker compose up -d postgres).
cd django_service
POSTGRES_HOST=localhost POSTGRES_PORT=5433 pytest
# ...or with no database container at all:
USE_SQLITE=1 pytest

# Quoting service - 17 tests, all through httpx.AsyncClient.
cd quoting_service && pytest

# Frontend - types and a production build.
cd frontend && npm run typecheck && npm run build
```

Or inside the containers:

```bash
docker compose exec django pytest
docker compose exec quoting pytest
```

What the Django suite covers:

| File | Covers |
|---|---|
| [test_state_machine.py](django_service/orders/tests/test_state_machine.py) | all 10 legal transitions (each asserted to succeed *and* to write an audit row), 15 illegal ones, same-status and unknown-status rejections, `shipped` being terminal, the four guards, machine status side effects, and the shared-transaction guarantee |
| [test_permissions.py](django_service/orders/tests/test_permissions.py) | token auth, anonymous 401s, customer-vs-operator on every endpoint, list filtering by ownership, cross-customer 404s, `status` being unwritable over the API |
| [test_integration.py](django_service/orders/tests/test_integration.py) | the httpx call itself via `respx`: request payload, timeouts, connect errors, 5xx, 422, non-JSON and missing-key responses - all falling back to `quote_pending` - plus requote |
| [test_commands.py](django_service/orders/tests/test_commands.py) | `seed` and `demo`: re-runnability, `--reset`, status coverage, machine-status consistency, and an assertion that every audit chain in the demo data is a legal walk through `ALLOWED_TRANSITIONS` |

---

## API reference

Every example below was run against the seeded stack. Set up two shells' worth
of environment first:

```bash
export OP=$(curl -s -X POST http://localhost:8000/api/auth/token/ \
  -H 'Content-Type: application/json' \
  -d '{"username":"omar_operator","password":"operator-pass-123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

export CU=$(curl -s -X POST http://localhost:8000/api/auth/token/ \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice_customer","password":"customer-pass-123"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
```

### Auth

```bash
# POST /api/auth/token/ - exchange credentials for a token
curl -s -X POST http://localhost:8000/api/auth/token/ \
  -H 'Content-Type: application/json' \
  -d '{"username":"omar_operator","password":"operator-pass-123"}'
# {"token":"61ad0611..."}

# GET /api/me/ - confirm a token works and see its role
curl -s http://localhost:8000/api/me/ -H "Authorization: Token $OP"
# {"id":2,"username":"omar_operator","email":"...","role":"operator"}
```

Every other endpoint needs `Authorization: Token <key>`. Without it you get
`401`; with the wrong role you get `403`.

### Machines

```bash
# GET /api/machines/ - anyone authenticated
curl -s http://localhost:8000/api/machines/ -H "Authorization: Token $CU"

# ?technology= and ?status= filter; ?ordering= sorts
curl -s 'http://localhost:8000/api/machines/?technology=SLA&status=idle' -H "Authorization: Token $OP"

# GET /api/machines/1/
curl -s http://localhost:8000/api/machines/1/ -H "Authorization: Token $OP"

# POST /api/machines/ - operator only
curl -s -X POST http://localhost:8000/api/machines/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Form-4L-E","technology":"SLA","status":"idle"}'

# PATCH /api/machines/4/ - take a printer offline
curl -s -X PATCH http://localhost:8000/api/machines/4/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' -d '{"status":"maintenance"}'

# PUT /api/machines/4/ - full replace
curl -s -X PUT http://localhost:8000/api/machines/4/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Form-4L-E","technology":"SLA","status":"idle"}'

# DELETE /api/machines/4/ -> 204
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE http://localhost:8000/api/machines/4/ \
  -H "Authorization: Token $OP"

# A customer trying to write -> 403
curl -s -X POST http://localhost:8000/api/machines/ -H "Authorization: Token $CU" \
  -H 'Content-Type: application/json' -d '{"name":"nope","technology":"SLA"}'
# {"detail":"Only operators may modify machines and parts."}
```

### Parts

```bash
# GET /api/parts/  (?material= filters)
curl -s http://localhost:8000/api/parts/ -H "Authorization: Token $CU"

# GET /api/parts/1/
curl -s http://localhost:8000/api/parts/1/ -H "Authorization: Token $OP"

# POST /api/parts/ - operator only
curl -s -X POST http://localhost:8000/api/parts/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' -d '{
    "name":"Curl test bracket","material":"resin_standard","quantity":2,
    "length_mm":"40.00","width_mm":"25.00","height_mm":"12.00"}'
# {"id":6,"name":"Curl test bracket",...}

# PATCH /api/parts/6/
curl -s -X PATCH http://localhost:8000/api/parts/6/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' -d '{"quantity":25}'

# PUT /api/parts/6/  (all fields required)
curl -s -X PUT http://localhost:8000/api/parts/6/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' -d '{
    "name":"Curl test bracket","material":"resin_tough","quantity":4,
    "length_mm":"40.00","width_mm":"25.00","height_mm":"12.00"}'

# DELETE /api/parts/6/ -> 204
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE http://localhost:8000/api/parts/6/ \
  -H "Authorization: Token $OP"

# ...but a part that orders still reference is protected (on_delete=PROTECT) -> 409
curl -s -X DELETE http://localhost:8000/api/parts/1/ -H "Authorization: Token $OP"
# {"detail":"This object cannot be deleted because other records still reference it. ...",
#  "error":"protected_reference","referenced_by":["order"]}

# Bad material -> 400
curl -s -X POST http://localhost:8000/api/parts/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' -d '{
    "name":"Mystery","material":"unobtanium","quantity":1,
    "length_mm":"10.00","width_mm":"10.00","height_mm":"10.00"}'
# {"material":["\"unobtanium\" is not a valid choice."]}
```

Valid materials: `resin_standard`, `resin_tough`, `resin_castable`,
`nylon_pa12`, `nylon_glass_filled`. (`GET http://localhost:8001/materials`
returns the live rate card.)

### Orders

```bash
# GET /api/orders/ - operators see everything, customers only their own
curl -s http://localhost:8000/api/orders/ -H "Authorization: Token $OP"
curl -s http://localhost:8000/api/orders/ -H "Authorization: Token $CU"

# ?status=, ?machine=, ?part= filter
curl -s 'http://localhost:8000/api/orders/?status=printing' -H "Authorization: Token $OP"

# GET /api/orders/1/
curl -s http://localhost:8000/api/orders/1/ -H "Authorization: Token $OP"

# POST /api/orders/ - this is what calls the quoting service
curl -s -X POST http://localhost:8000/api/orders/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' -d '{"part":6,"customer":1}'
```
```json
{
  "id": 6, "part": 6,
  "part_detail": {"id": 6, "name": "Curl test bracket", "material": "resin_standard",
                  "quantity": 2, "length_mm": "40.00", "width_mm": "25.00", "height_mm": "12.00"},
  "customer": 1, "customer_username": "alice_customer",
  "status": "quoted", "quoted_price": "30.83", "quoted_lead_days": 4,
  "machine": null, "machine_detail": null,
  "allowed_transitions": ["paid"],
  "created_at": "2026-09-17T07:05:47.757068Z", "updated_at": "2026-09-17T07:05:47.757080Z"
}
```
```bash
# A customer may place an order, but it is always pinned to them: the
# "customer" field below is ignored and replaced with the caller's own id.
curl -s -X POST http://localhost:8000/api/orders/ -H "Authorization: Token $CU" \
  -H 'Content-Type: application/json' -d '{"part":6,"customer":2}'

# PATCH /api/orders/6/ - operator only. "status" is read-only and ignored here;
# use /transition/ instead.
curl -s -X PATCH http://localhost:8000/api/orders/6/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' -d '{"machine":1}'

# DELETE /api/orders/6/ -> 204, operator only
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE http://localhost:8000/api/orders/6/ \
  -H "Authorization: Token $OP"

# A customer writing -> 403
curl -s -X PATCH http://localhost:8000/api/orders/1/ -H "Authorization: Token $CU" \
  -H 'Content-Type: application/json' -d '{"machine":1}'
# {"detail":"Customers have read-only access to their own orders."}

# A customer reading someone else's order -> 404, not 403: get_queryset filtered
# it out, and a 403 would confirm the order exists.
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/api/orders/99/ \
  -H "Authorization: Token $CU"
```

### Transitions

```bash
# POST /api/orders/{id}/transition/ - operator only
curl -s -X POST http://localhost:8000/api/orders/6/transition/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' -d '{"to_status":"paid","note":"card charged"}'
# -> 200, {"status":"paid","allowed_transitions":["printing"],...}

# Starting a print: pass the machine (or set it on the order first)
curl -s -X POST http://localhost:8000/api/orders/6/transition/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' -d '{"to_status":"printing","machine":1}'
# -> 200. The machine flips to "printing" in the same transaction.

# Rest of the happy path
curl -s -X POST http://localhost:8000/api/orders/6/transition/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' -d '{"to_status":"post_processing"}'   # frees the machine
curl -s -X POST http://localhost:8000/api/orders/6/transition/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' -d '{"to_status":"qc"}'
curl -s -X POST http://localhost:8000/api/orders/6/transition/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' -d '{"to_status":"shipped"}'

# Failure branch: printing|qc -> failed -> reprint -> printing
curl -s -X POST http://localhost:8000/api/orders/5/transition/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' -d '{"to_status":"reprint","note":"warped, re-run"}'
curl -s -X POST http://localhost:8000/api/orders/5/transition/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' -d '{"to_status":"printing","machine":2}'
```

Every rejection carries a message you can show a user:

```bash
# Illegal edge -> 400
curl -s -X POST http://localhost:8000/api/orders/1/transition/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' -d '{"to_status":"shipped"}'
# {"detail":"Illegal transition 'quoted' -> 'shipped'. Allowed from 'quoted': paid.",
#  "error":"illegal_transition","from_status":"quoted","to_status":"shipped"}

# Guard: no machine -> 400
curl -s -X POST http://localhost:8000/api/orders/2/transition/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' -d '{"to_status":"printing"}'
# {"detail":"An order cannot start printing without an assigned machine. ..."}

# Guard: machine under maintenance -> 400
curl -s -X POST http://localhost:8000/api/orders/2/transition/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' -d '{"to_status":"printing","machine":3}'
# {"detail":"Machine 'Form-3L-C' is under maintenance and cannot accept work."}

# Guard: wrong printer technology for the material -> 400
curl -s -X POST http://localhost:8000/api/orders/4/transition/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' -d '{"to_status":"printing","machine":2}'
# {"detail":"Machine 'Fuse-1-B' is SLS and cannot print material 'resin_standard'."}

# Unknown status -> 400 from the serializer, before the service is reached
curl -s -X POST http://localhost:8000/api/orders/1/transition/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' -d '{"to_status":"teleported"}'
# {"to_status":["\"teleported\" is not a valid choice."]}

# Customer attempting any transition -> 403
curl -s -X POST http://localhost:8000/api/orders/1/transition/ -H "Authorization: Token $CU" \
  -H 'Content-Type: application/json' -d '{"to_status":"paid"}'
# {"detail":"Only operators may change an order's status."}
```

### Requote

```bash
# POST /api/orders/{id}/requote/ - retry the quoting service for an order
# stuck at quote_pending. Operator only.
curl -s -X POST http://localhost:8000/api/orders/7/requote/ -H "Authorization: Token $OP"
# -> 200, {"status":"quoted","quoted_price":"30.83","quoted_lead_days":4,...}

# Still down -> 400, order left untouched
# {"detail":"The quoting service is still unavailable. The order remains
#  'quote_pending'; try again shortly.", "error":"illegal_transition", ...}

# Already priced -> 400
# {"detail":"Only orders in 'quote_pending' can be requoted; this one is 'paid'."}
```

### Audit log

```bash
# GET /api/orders/{id}/audit/ - one order's history, newest first
curl -s http://localhost:8000/api/orders/6/audit/ -H "Authorization: Token $OP"
```
```json
[
  {"id": 3, "order": 6, "actor": 2, "actor_username": "omar_operator",
   "from_status": "paid", "to_status": "printing",
   "timestamp": "2026-09-17T07:06:10.412Z", "note": ""},
  {"id": 2, "order": 6, "actor": 2, "actor_username": "omar_operator",
   "from_status": "quoted", "to_status": "paid",
   "timestamp": "2026-09-17T07:06:02.118Z", "note": "card charged"},
  {"id": 1, "order": 6, "actor": 2, "actor_username": "omar_operator",
   "from_status": "", "to_status": "quoted",
   "timestamp": "2026-09-17T07:05:47.760Z",
   "note": "Order created and priced by the quoting service."}
]
```

`from_status: ""` means the order did not exist before that row - it is the
creation entry.

```bash
# GET /api/audit-logs/ - across all orders. Customers see only rows for
# their own orders. ?order=, ?to_status=, ?from_status=, ?actor= filter.
curl -s 'http://localhost:8000/api/audit-logs/?to_status=failed' -H "Authorization: Token $OP"

# GET /api/audit-logs/1/
curl -s http://localhost:8000/api/audit-logs/1/ -H "Authorization: Token $OP"

# The log is append-only: there is no create/update/delete route -> 405
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8000/api/audit-logs/ \
  -H "Authorization: Token $OP" -H 'Content-Type: application/json' \
  -d '{"order":1,"to_status":"shipped"}'
```

### Public stats (no auth)

```bash
# GET /api/public/stats/ - the one deliberately public endpoint, so the
# landing page can show live numbers. Counts only: no names, no prices, no
# part geometry, no order ids. authentication_classes = [] so a stale token
# header cannot turn it into a 401.
curl -s http://localhost:8000/api/public/stats/
```
```json
{
  "orders": {"total": 18, "active": 15, "shipped": 3, "by_status": {"quoted": 3, "...": 0}},
  "pipeline": [{"status": "quote_pending", "label": "Quote pending", "count": 1}],
  "exceptions": [{"status": "failed", "label": "Failed", "count": 2}],
  "machines": {"total": 7, "busy": 3, "idle": 3, "maintenance": 1, "by_status": {}},
  "transitions_recorded": 62
}
```

### Quoting service (port 8001)

```bash
# POST /quote
curl -s -X POST http://localhost:8001/quote -H 'Content-Type: application/json' \
  -d '{"material":"nylon_pa12","quantity":4,"length_mm":180,"width_mm":30,"height_mm":18}'
```
```json
{
  "price": 149.42,
  "lead_time_days": 7,
  "currency": "USD",
  "breakdown": {"volume_cm3": 97.2, "rate_per_cm3": 0.32, "material_cost": 124.42,
                "setup_fee": 25.0, "rush_applied": false, "rush_multiplier": 1.0,
                "machine_load_factor": 1.1}
}
```
```bash
# Low quantity triggers the rush multiplier
curl -s -X POST http://localhost:8001/quote -H 'Content-Type: application/json' \
  -d '{"material":"resin_standard","quantity":1,"length_mm":40,"width_mm":25,"height_mm":12}'
# "rush_applied": true, "rush_multiplier": 1.35, and a shorter lead_time_days

# Validation failures -> 422, field by field
curl -s -X POST http://localhost:8001/quote -H 'Content-Type: application/json' \
  -d '{"material":"unobtanium","quantity":0,"length_mm":0,"width_mm":30,"height_mm":18}'
# {"detail":[{"type":"literal_error","loc":["body","material"],...},
#            {"type":"greater_than_equal","loc":["body","quantity"],...},
#            {"type":"greater_than","loc":["body","length_mm"],...}]}

# GET /materials - the live rate card
curl -s http://localhost:8001/materials

# GET /health - what compose's healthcheck hits
curl -s http://localhost:8001/health

# Auto-generated docs
open http://localhost:8001/docs           # Swagger UI
curl -s http://localhost:8001/openapi.json
```

### Pricing

```
price = bbox_volume_cm3 × material_rate × quantity × rush_multiplier + setup_fee
```

Lead time is `3 days + ceil(quantity / 5) + material curing days`, scaled by a
machine-load factor, minus a day for rush jobs, floored at 1. Every number
lives in [quoting_service/app/config.py](quoting_service/app/config.py) - 
`MATERIAL_RATES`, `SETUP_FEE_USD` (\$25), `RUSH_MAX_QUANTITY` (≤3 parts),
`RUSH_MULTIPLIER` (1.35).

The rush surcharge is not a customer-selected option: a one-off build cannot
amortise setup across a full plate, so small quantities cost more per part and
get scheduled ahead of big batches.

---

## Integration behaviour: when the quoting service is down

Verified by stopping the container mid-flight:

```bash
docker compose stop quoting

curl -s -X POST http://localhost:8000/api/orders/ -H "Authorization: Token $OP" \
  -H 'Content-Type: application/json' -d '{"part":6,"customer":1}'
# -> 201 Created, {"status":"quote_pending","quoted_price":null,...}

docker compose start quoting
curl -s -X POST http://localhost:8000/api/orders/7/requote/ -H "Authorization: Token $OP"
# -> 200, {"status":"quoted","quoted_price":"30.83","quoted_lead_days":4}
```

Timeouts, connection refusals, 5xx, 422, non-JSON bodies and JSON missing the
expected keys are all handled the same way: log a warning, return `None`, save
the order as `quote_pending`. The customer sees a `201`, never a `500`.
`QUOTING_SERVICE_TIMEOUT` (default 3s) bounds how long the request can hang.

---

## Django admin

<http://localhost:8000/admin/> after `createsuperuser`. All four models are
registered, with filters, search and `date_hierarchy`.

Two deliberate guardrails: an order's `status` is read-only (editing it in the
admin would bypass the state machine and write no audit row - use the API), and
`AuditLog` has add/change/delete all disabled, so the log stays append-only
regardless of who is logged in. An order's history renders inline on its page.

---

## Layout

```
django_service/
  config/settings.py              env-driven settings; DRF config; quoting URL
  config/urls.py                  DefaultRouter -> one route set per ViewSet
  orders/
    models.py                     Machine, Part, Order, AuditLog + TextChoices enums
    services.py                   ALLOWED_TRANSITIONS, transition_order, create_order
    quoting.py                    httpx client; the only module that knows service 2 exists
    permissions.py                DRF permission classes
    serializers.py                JSON <-> model translation
    views.py                      thin ViewSets + @action routes
    exceptions.py                 IllegalTransition -> 400
    roles.py                      customer/operator via auth.Group
    admin.py                      admin registration
    migrations/0001_initial.py    schema
    migrations/0002_role_groups.py  data migration creating the two role groups
    management/commands/seed.py   manage.py seed - the spec's 3/2/5 dataset
    management/commands/demo.py   manage.py demo - bigger dataset, all 9 statuses
    tests/                        152 pytest-django tests
quoting_service/
  app/config.py                   rate card and scheduling constants
  app/schemas.py                  Pydantic v2 request/response models
  app/pricing.py                  pure pricing maths
  app/main.py                     FastAPI app; async /quote
  tests/test_quote.py             17 tests via httpx.AsyncClient
frontend/
  app/page.tsx                    landing page (public)
  app/login/page.tsx              token exchange
  app/dashboard/page.tsx          hero figure, KPI row, pipeline chart, printers
  app/orders/page.tsx             list + status filters
  app/orders/[id]/page.tsx        detail, transition controls, audit timeline
  app/machines/page.tsx           fleet + utilisation meter
  app/globals.css                 design tokens (swap here for a brand palette)
  components/PipelineChart.tsx    single-series bar chart + table-view twin
  components/Figures.tsx          stat tile, hero figure, meter
  components/TransitionControls.tsx  buttons driven by allowed_transitions
  components/QuoteCalculator.tsx  live call to the FastAPI service
  lib/api.ts                      server-only data access
  lib/actions.ts                  server actions (every mutation)
docker-compose.yml
.env.example
```

### Notes for reading the Django code

Two things in the model layer are worth knowing up front.

`Order.customer` is a field the spec did not list. It has to exist: the
requirement "a customer may read their own orders" is only answerable in SQL if
the row records who owns it. It is nullable, so an operator can create an order
before a customer account is attached.

Roles use Django's built-in `auth.Group` rather than a custom `role` column.
Groups already exist, the admin manages membership for free, and a user can
hold more than one role later without a schema change. Migration `0002` is a
*data* migration that creates the two groups, so they are present in every
environment - including the test database, which pytest-django builds by
running migrations.

Beyond that, every module carries comments explaining what the ORM is doing,
why a migration exists, and what each permission class actually checks.
