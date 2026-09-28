import json
import sys
import time
from urllib import request, error, parse

BASE = "http://127.0.0.1:8000"

def call(method, path, payload=None, timeout=45):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with request.urlopen(req, timeout=timeout) as r:
            body = r.read().decode("utf-8")
            return r.status, json.loads(body)
    except error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            body = json.loads(body)
        except Exception:
            pass
        return e.code, body

def check(name, fn):
    print(f"\n{'='*68}\nTEST: {name}\n{'='*68}")
    try:
        ok, details = fn()
        print(("PASS" if ok else "FAIL") + ":", details)
        return ok
    except Exception as e:
        print("FAIL:", repr(e))
        return False

def t_root():
    s, d = call("GET", "/")
    return s == 200 and d.get("success") is True, d

def t_health():
    s, d = call("GET", "/health")
    ok = s == 200 and bool(d.get("backend")) and bool(d.get("hindsight")) and bool(d.get("groq"))
    return ok, d

def t_incidents():
    s, d = call("GET", "/incidents")
    return s == 200 and d.get("success") is True and isinstance(d.get("incidents"), list), d

def t_memories():
    s, d = call("GET", "/memories?query=" + parse.quote("database connection pool production incident"))
    return s == 200 and d.get("success") is True and isinstance(d.get("memories"), list), {
        "success": d.get("success"), "count": d.get("count"), "sample": (d.get("memories") or [])[:2],
        "error": d.get("error")
    }

def t_analyze_match():
    payload = {"incident": "Production API is down immediately after a database connection-pool configuration change. Database connections are failing and users cannot access the application."}
    s, d = call("POST", "/analyze-incident", payload, 90)
    text = (d.get("analysis") or "").upper()
    required = ["ROOT CAUSE:", "RECOMMENDED ACTION:", "RISK:", "MEMORY USED:"]
    ok = s == 200 and d.get("success") is True and all(x in text for x in required)
    return ok, {"success": d.get("success"), "memories_found": d.get("memories_found"), "analysis": d.get("analysis"), "error": d.get("error")}

def t_analyze_unrelated():
    payload = {"incident": "Checkout service is returning HTTP 500 errors after a new payment API deployment. CPU and database metrics are normal, but requests to the external payment gateway are timing out. No database configuration changes were made."}
    s, d = call("POST", "/analyze-incident", payload, 90)
    text = (d.get("analysis") or "").upper()
    ok = s == 200 and d.get("success") is True and "MEMORY USED:" in text
    # We don't fail merely because model wording varies; print whether rejection is explicit.
    rejected = "NO STRONG" in text or "NOT RELEVANT" in text or "UNRELATED" in text
    return ok, {"success": d.get("success"), "explicitly_rejected_old_memory": rejected, "analysis": d.get("analysis"), "error": d.get("error")}

TEST_ID = "INC-QA-9001"
PAYMENT_INCIDENT = "Checkout service is returning HTTP 500 errors after a new payment API deployment because requests to the external payment gateway are timing out."

def t_save():
    payload = {
        "incident_id": TEST_ID,
        "incident": PAYMENT_INCIDENT,
        "root_cause": "External payment gateway endpoint configuration was incorrect after deployment.",
        "resolution": "Corrected the payment gateway endpoint configuration and redeployed the checkout service.",
        "lesson": "Validate third-party payment endpoint configuration in staging and monitor gateway timeouts before production.",
        "severity": "high"
    }
    s, d = call("POST", "/save-resolution", payload, 90)
    return s == 200 and d.get("success") is True, d

def t_history_after_save():
    s, d = call("GET", "/incidents")
    found = any(str(x.get("id")) == TEST_ID for x in (d.get("incidents") or []))
    return s == 200 and d.get("success") is True and found, {"found_test_incident": found, "count": d.get("count")}

def t_recall_after_save():
    q = parse.quote("external payment gateway endpoint checkout timeout staging")
    s, d = call("GET", "/memories?query=" + q, timeout=90)
    blob = " ".join(d.get("memories") or []).lower()
    found = ("payment" in blob and ("gateway" in blob or "endpoint" in blob))
    return s == 200 and d.get("success") is True and found, {
        "found_payment_memory": found, "count": d.get("count"), "sample": (d.get("memories") or [])[:3], "error": d.get("error")
    }

def t_risk():
    payload = {"change": "A production deployment is planned tonight that changes the database connection-pool configuration from 50 connections to 200 connections without staging validation."}
    s, d = call("POST", "/deployment-risk", payload, 90)
    text = (d.get("analysis") or "").upper()
    required = ["RISK LEVEL:", "HISTORICAL MATCH:", "WHY:", "PRE-DEPLOY CHECKLIST:", "RECOMMENDATION:"]
    ok = s == 200 and d.get("success") is True and all(x in text for x in required)
    return ok, {"success": d.get("success"), "memories_found": d.get("memories_found"), "analysis": d.get("analysis"), "error": d.get("error")}

tests = [
    ("Backend root", t_root),
    ("Health/config", t_health),
    ("Incident history", t_incidents),
    ("Hindsight recall", t_memories),
    ("Known incident analysis", t_analyze_match),
    ("Unrelated incident reasoning", t_analyze_unrelated),
    ("Save resolution to Hindsight", t_save),
    ("Saved incident appears in history", t_history_after_save),
    ("New Hindsight memory can be recalled", t_recall_after_save),
    ("Pre-deployment risk scanner", t_risk),
]

print("\nWARROOM X — FULL END-TO-END QA")
print("Backend expected at", BASE)
results = [check(name, fn) for name, fn in tests]

passed = sum(results)
total = len(results)
print(f"\n{'='*68}\nRESULT: {passed}/{total} TESTS PASSED\n{'='*68}")
if passed == total:
    print("WARROOM X BACKEND + HINDSIGHT + GROQ CORE FLOW: PASS")
    print("Now only browser rendering/click behavior needs visual confirmation.")
    sys.exit(0)
else:
    print("One or more checks failed. Copy this terminal output into ChatGPT.")
    sys.exit(1)
