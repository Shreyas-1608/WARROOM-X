import os
import asyncio
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from hindsight_client import Hindsight
from groq import Groq
from pydantic import BaseModel


# =========================================================
# CONFIG
# =========================================================

load_dotenv()

HINDSIGHT_URL = os.getenv(
    "HINDSIGHT_API_URL",
    "https://api.hindsight.vectorize.io"
)

HINDSIGHT_KEY = os.getenv("HINDSIGHT_API_KEY")
BANK_ID = os.getenv("HINDSIGHT_BANK_ID", "warroom-x")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv(
    "GROQ_MODEL",
    "openai/gpt-oss-20b"
)


# =========================================================
# APP
# =========================================================

app = FastAPI(
    title="WARROOM X",
    description="Memory-Powered Incident Intelligence",
    version="2.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://warroom-x.kpsshu.workers.dev",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# GROQ
# =========================================================

groq_client = Groq(api_key=GROQ_API_KEY)


# =========================================================
# MODELS
# =========================================================

class IncidentRequest(BaseModel):
    incident: str


class ResolutionRequest(BaseModel):
    incident_id: str
    incident: str
    root_cause: str
    resolution: str
    lesson: str
    severity: str = "medium"


class DeploymentRequest(BaseModel):
    change: str


# =========================================================
# INCIDENT HISTORY
# =========================================================

incident_history = [
    {
        "id": "INC-001",
        "title": "Production API Database Failure",
        "severity": "CRITICAL",
        "status": "RESOLVED",
        "root_cause": "Incorrect database connection-pool configuration",
        "resolution": "Reverted configuration and restarted API service",
        "timestamp": "2026-09-28 18:30"
    }
]


# =========================================================
# HINDSIGHT
# IMPORTANT:
# Create + use client INSIDE the worker thread.
# =========================================================

def hindsight_recall_sync(query: str, max_results: int = 5):

    client = Hindsight(
        base_url=HINDSIGHT_URL,
        api_key=HINDSIGHT_KEY
    )

    result = client.recall(
        bank_id=BANK_ID,
        query=query,
        max_tokens=2048
    )

    memories = []

    for item in result.results:
        text = getattr(item, "text", None)

        if text:
            memories.append(text)

    return memories[:max_results]


def hindsight_retain_sync(
    content: str,
    context: str,
    metadata: dict
):

    client = Hindsight(
        base_url=HINDSIGHT_URL,
        api_key=HINDSIGHT_KEY
    )

    return client.retain(
        bank_id=BANK_ID,
        content=content,
        context=context,
        metadata=metadata
    )


def hindsight_setup_sync():

    client = Hindsight(
        base_url=HINDSIGHT_URL,
        api_key=HINDSIGHT_KEY
    )

    return client.create_bank(
        bank_id=BANK_ID,
        name="WARROOM X"
    )


# =========================================================
# ASYNC BRIDGE
# =========================================================

async def recall_memories(
    query: str,
    max_results: int = 5
):

    return await asyncio.to_thread(
        hindsight_recall_sync,
        query,
        max_results
    )


async def retain_memory(
    content: str,
    context: str,
    metadata: dict
):

    return await asyncio.to_thread(
        hindsight_retain_sync,
        content,
        context,
        metadata
    )


# =========================================================
# GROQ
# =========================================================

def groq_sync(prompt: str):

    response = groq_client.chat.completions.create(
        model=GROQ_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are WARROOM X, a precise and cautious "
                    "AI incident response engineer. "
                    "Never invent evidence."
                )
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0.2
    )

    return response.choices[0].message.content


async def ask_groq(prompt: str):

    return await asyncio.to_thread(
        groq_sync,
        prompt
    )


# =========================================================
# HOME
# =========================================================

@app.get("/")
async def home():

    return {
        "success": True,
        "system": "WARROOM X",
        "version": "2.1.0",
        "status": "online",
        "memory_engine": "Hindsight",
        "reasoning_engine": "Groq"
    }


# =========================================================
# HEALTH
# =========================================================

@app.get("/health")
async def health():

    response = {
        "success": True,
        "backend": True,
        "groq": bool(GROQ_API_KEY),
        "hindsight": False,
        "memory_bank": BANK_ID
    }

    if not HINDSIGHT_KEY:
        response["success"] = False
        return response

    try:

        await recall_memories(
            "WARROOM X health check",
            1
        )

        response["hindsight"] = True

    except Exception as e:

        response["success"] = False
        response["hindsight_error"] = str(e)

    return response


# =========================================================
# SETUP MEMORY
# =========================================================

@app.post("/setup-memory")
async def setup_memory():

    try:

        bank = await asyncio.to_thread(
            hindsight_setup_sync
        )

        return {
            "success": True,
            "message": "WARROOM X memory bank ready.",
            "bank_id": getattr(
                bank,
                "bank_id",
                BANK_ID
            )
        }

    except Exception as e:

        error = str(e)

        if (
            "already" in error.lower()
            or "exist" in error.lower()
            or "409" in error
        ):

            return {
                "success": True,
                "message": "Memory bank already exists.",
                "bank_id": BANK_ID
            }

        return {
            "success": False,
            "error": error
        }


# =========================================================
# ANALYZE INCIDENT
# =========================================================

@app.post("/analyze-incident")
async def analyze_incident(
    request: IncidentRequest
):

    incident = request.incident.strip()

    if len(incident) < 15:

        return {
            "success": False,
            "error": (
                "Please describe the incident in more detail."
            )
        }

    try:

        # -------------------------
        # HINDSIGHT RECALL
        # -------------------------

        memories = await recall_memories(
            incident,
            5
        )

        if memories:

            memory_context = "\n\n".join(
                f"MEMORY {index + 1}:\n{text}"
                for index, text in enumerate(memories)
            )

        else:

            memory_context = (
                "No relevant historical memory was retrieved."
            )


        # -------------------------
        # AI ANALYSIS
        # -------------------------

        prompt = f"""
You are WARROOM X.

Analyze this CURRENT production incident:

{incident}


HISTORICAL MEMORY RETRIEVED FROM HINDSIGHT:

{memory_context}


Rules:

- Analyze the current incident first.
- Historical memory is supporting evidence only.
- Do not force an unrelated memory match.
- Do not invent evidence.
- Clearly distinguish likely causes from confirmed causes.
- Give practical remediation steps.
- Explain whether Hindsight memory influenced your reasoning.

Return EXACTLY:

ROOT CAUSE:
<most likely root cause>

RECOMMENDED ACTION:
1. <action>
2. <action>
3. <action>

RISK:
<risk if unresolved>

MEMORY USED:
<relevant historical lesson, or NO STRONG HISTORICAL MATCH>
"""

        analysis = await ask_groq(prompt)

        return {
            "success": True,
            "incident": incident,
            "memories_found": len(memories),
            "memories": memories,
            "analysis": analysis
        }


    except Exception as e:

        return {
            "success": False,
            "error": str(e)
        }


# =========================================================
# SAVE RESOLUTION
# =========================================================

@app.post("/save-resolution")
async def save_resolution(
    request: ResolutionRequest
):

    incident_id = request.incident_id.strip()
    incident = request.incident.strip()
    root_cause = request.root_cause.strip()
    resolution = request.resolution.strip()
    lesson = request.lesson.strip()
    severity = request.severity.strip().lower()


    if not incident_id:
        return {
            "success": False,
            "error": "Incident ID is required."
        }


    if not incident:
        return {
            "success": False,
            "error": "Incident description is required."
        }


    if not root_cause:
        return {
            "success": False,
            "error": "Root cause is required."
        }


    if not resolution:
        return {
            "success": False,
            "error": "Resolution is required."
        }


    if not lesson:
        return {
            "success": False,
            "error": "Lesson learned is required."
        }


    if severity not in {
        "low",
        "medium",
        "high",
        "critical"
    }:
        severity = "medium"


    try:

        now = datetime.now()

        memory_text = f"""
Incident ID: {incident_id}

Incident:
{incident}

Confirmed Root Cause:
{root_cause}

Resolution:
{resolution}

Lesson Learned:
{lesson}

Severity:
{severity}

Status:
Resolved

Resolved At:
{now.isoformat()}
"""


        result = await retain_memory(
            memory_text,
            (
                "WARROOM X resolved production incident. "
                "Use this experience when analyzing future "
                "incidents and deployment risks."
            ),
            {
                "incident_id": incident_id,
                "severity": severity,
                "status": "resolved",
                "source": "warroom-x"
            }
        )


        # Remove duplicate ID if present
        incident_history[:] = [
            item
            for item in incident_history
            if item["id"] != incident_id
        ]


        incident_history.insert(
            0,
            {
                "id": incident_id,
                "title": (
                    incident[:70]
                    + (
                        "..."
                        if len(incident) > 70
                        else ""
                    )
                ),
                "severity": severity.upper(),
                "status": "RESOLVED",
                "root_cause": root_cause,
                "resolution": resolution,
                "timestamp": now.strftime(
                    "%Y-%m-%d %H:%M"
                )
            }
        )


        return {
            "success": True,
            "message": (
                f"{incident_id} learned successfully. "
                "Hindsight memory updated."
            ),
            "memory_saved": True,
            "result": str(result)
        }


    except Exception as e:

        return {
            "success": False,
            "error": str(e)
        }


# =========================================================
# INCIDENT HISTORY
# =========================================================

@app.get("/incidents")
async def get_incidents():

    return {
        "success": True,
        "count": len(incident_history),
        "incidents": incident_history
    }


# =========================================================
# MEMORY EXPLORER
# =========================================================

@app.get("/memories")
async def get_memories(
    query: str = (
        "production incidents root causes "
        "resolutions lessons learned"
    )
):

    try:

        query = query.strip()

        if not query:

            query = (
                "production incidents root causes "
                "resolutions lessons learned"
            )


        memories = await recall_memories(
            query,
            10
        )


        return {
            "success": True,
            "query": query,
            "count": len(memories),
            "memories": memories
        }


    except Exception as e:

        return {
            "success": False,
            "error": str(e)
        }


# =========================================================
# PRE-DEPLOYMENT RISK SCANNER
# =========================================================

@app.post("/deployment-risk")
async def deployment_risk(
    request: DeploymentRequest
):

    change = request.change.strip()

    if len(change) < 10:

        return {
            "success": False,
            "error": (
                "Describe the deployment change "
                "in more detail."
            )
        }


    try:

        memories = await recall_memories(
            change,
            5
        )


        if memories:

            memory_context = "\n\n".join(
                f"MEMORY {index + 1}:\n{text}"
                for index, text in enumerate(memories)
            )

        else:

            memory_context = (
                "No historical memory was retrieved."
            )


        prompt = f"""
WARROOM X is reviewing a planned production deployment.

PLANNED CHANGE:

{change}


HISTORICAL INCIDENT MEMORY:

{memory_context}


Determine whether this deployment resembles changes that
previously contributed to production incidents.

Rules:

- Do not invent incidents.
- Do not force historical matches.
- Evaluate rollback safety.
- Consider blast radius.
- Use historical memory only when relevant.

Return EXACTLY:

RISK LEVEL:
<LOW, MEDIUM, HIGH or CRITICAL>

HISTORICAL MATCH:
<relevant memory or NO STRONG MATCH>

WHY:
<short explanation>

PRE-DEPLOY CHECKLIST:
1. <check>
2. <check>
3. <check>

RECOMMENDATION:
<PROCEED, PROCEED WITH CAUTION, or BLOCK AND REVIEW>
"""


        analysis = await ask_groq(prompt)


        return {
            "success": True,
            "change": change,
            "memories_found": len(memories),
            "memories": memories,
            "analysis": analysis
        }


    except Exception as e:

        return {
            "success": False,
            "error": str(e)
        }