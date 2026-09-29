import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Database,
  History,
  Radar,
  Save,
  Search,
  ShieldAlert,
  Terminal,
  Zap,
  Wifi,
  WifiOff,
  Sparkles,
  Clock3,
} from "lucide-react";

import "./App.css";
import GalaxyBackground from "./components/GalaxyBackground";

const API =
  import.meta.env.VITE_API_URL ||
  "http://127.0.0.1:8000";

const DEMO_INCIDENT =
  "Production API is down immediately after a database connection-pool configuration change. Database connections are failing and users cannot access the application.";

const UNRELATED_DEMO =
  "Checkout service is returning HTTP 500 errors after a new payment API deployment. CPU and database metrics are normal, but requests to the external payment gateway are timing out. No database configuration changes were made.";

const RISK_DEMO =
  "A production deployment is planned tonight that changes the database connection-pool configuration from 50 connections to 200 connections without staging validation.";

function parseSections(text = "") {
  const labels = [
    "ROOT CAUSE:",
    "RECOMMENDED ACTION:",
    "RISK:",
    "MEMORY USED:",
  ];

  const result = {};

  labels.forEach((label, index) => {
    const start = text.indexOf(label);

    if (start === -1) return;

    const contentStart = start + label.length;

    const nextPositions = labels
      .slice(index + 1)
      .map((next) => text.indexOf(next, contentStart))
      .filter((position) => position !== -1);

    const end = nextPositions.length
      ? Math.min(...nextPositions)
      : text.length;

    result[label.replace(":", "")] = text
      .slice(contentStart, end)
      .trim();
  });

  return result;
}

function App() {
  const [page, setPage] = useState("command");

  const [health, setHealth] = useState({
    backend: false,
    hindsight: false,
    groq: false,
  });

  const [incident, setIncident] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [incidents, setIncidents] = useState([]);
  const [memories, setMemories] = useState([]);

  const [memoryQuery, setMemoryQuery] = useState("");
  const [memoryLoading, setMemoryLoading] = useState(false);

  const [deployment, setDeployment] = useState("");
  const [deploymentResult, setDeploymentResult] =
    useState(null);

  const [deploymentLoading, setDeploymentLoading] =
    useState(false);

  const [saving, setSaving] = useState(false);

  const [resolution, setResolution] = useState({
    incident_id: "INC-002",
    root_cause: "",
    resolution: "",
    lesson: "",
    severity: "high",
  });

  const request = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, options);

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error(
        "WARROOM X backend returned an invalid response."
      );
    }

    if (!response.ok) {
      throw new Error(
        data.detail ||
        data.error ||
        "Backend request failed."
      );
    }

    return data;
  };

  const checkHealth = async () => {
    try {
      const data = await request("/health");

      setHealth({
        backend: Boolean(data.backend),
        hindsight: Boolean(data.hindsight),
        groq: Boolean(data.groq),
      });
    } catch {
      setHealth({
        backend: false,
        hindsight: false,
        groq: false,
      });
    }
  };

  const loadIncidents = async () => {
    try {
      const data = await request("/incidents");

      if (!data.success) return;

      const list = data.incidents || [];

      setIncidents(list);

      const numbers = list
        .map((item) =>
          Number(
            String(item.id || "").replace(/\D/g, "")
          )
        )
        .filter(Number.isFinite);

      const next =
        (numbers.length
          ? Math.max(...numbers)
          : 1) + 1;

      setResolution((current) => ({
        ...current,
        incident_id: `INC-${String(next).padStart(
          3,
          "0"
        )}`,
      }));
    } catch {
      setIncidents([]);
    }
  };

  const loadMemories = async (query = "") => {
    setMemoryLoading(true);

    try {
      const suffix = query
        ? `?query=${encodeURIComponent(query)}`
        : "";

      const data = await request(
        `/memories${suffix}`
      );

      if (data.success) {
        setMemories(data.memories || []);
      }
    } catch {
      setMemories([]);
    } finally {
      setMemoryLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
    loadIncidents();
    loadMemories();

    const timer = setInterval(
      checkHealth,
      15000
    );

    return () => clearInterval(timer);
  }, []);

  const analyzeIncident = async () => {
    setError("");
    setSuccess("");

    if (!incident.trim()) {
      setError(
        "Describe a production incident first."
      );
      return;
    }

    setLoading(true);
    setAnalysis(null);

    try {
      const data = await request(
        "/analyze-incident",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            incident,
          }),
        }
      );

      if (!data.success) {
        setError(
          data.error || "Incident analysis failed."
        );
      } else {
        setAnalysis(data);
      }
    } catch (err) {
      setError(
        err.message ||
        "Unable to connect to WARROOM X."
      );
    } finally {
      setLoading(false);
      checkHealth();
    }
  };

  const saveResolution = async () => {
    setError("");
    setSuccess("");

    if (!incident.trim()) {
      setError(
        "Analyze an incident before saving a resolution."
      );
      return;
    }

    if (
      !resolution.incident_id.trim() ||
      !resolution.root_cause.trim() ||
      !resolution.resolution.trim() ||
      !resolution.lesson.trim()
    ) {
      setError(
        "Complete root cause, resolution and lesson before teaching WARROOM X."
      );
      return;
    }

    setSaving(true);

    try {
      const data = await request(
        "/save-resolution",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...resolution,
            incident,
          }),
        }
      );

      if (!data.success) {
        setError(
          data.error ||
          "Unable to save Hindsight memory."
        );
        return;
      }

      setSuccess(
        data.message ||
        `${resolution.incident_id} learned successfully.`
      );

      setResolution((current) => ({
        ...current,
        root_cause: "",
        resolution: "",
        lesson: "",
      }));

      await Promise.all([
        loadIncidents(),
        loadMemories(),
      ]);

      checkHealth();
    } catch (err) {
      setError(
        err.message ||
        "Unable to save to Hindsight."
      );
    } finally {
      setSaving(false);
    }
  };

  const scanDeployment = async () => {
    setError("");
    setSuccess("");

    if (!deployment.trim()) {
      setError(
        "Describe the planned deployment first."
      );
      return;
    }

    setDeploymentLoading(true);
    setDeploymentResult(null);

    try {
      const data = await request(
        "/deployment-risk",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            change: deployment,
          }),
        }
      );

      if (!data.success) {
        setError(
          data.error || "Risk scan failed."
        );
      } else {
        setDeploymentResult(data);
      }
    } catch (err) {
      setError(
        err.message ||
        "Unable to run deployment risk scan."
      );
    } finally {
      setDeploymentLoading(false);
    }
  };

  const navigate = (nextPage) => {
    setPage(nextPage);
    setError("");
    setSuccess("");

    if (nextPage === "incidents") {
      loadIncidents();
    }

    if (nextPage === "memory") {
      loadMemories(memoryQuery);
    }
  };

  const parsedAnalysis = useMemo(
    () => parseSections(analysis?.analysis),
    [analysis]
  );

  const noStrongMatch = (
    analysis?.analysis || ""
  )
    .toUpperCase()
    .includes("NO STRONG");

  const pageTitle = {
    command: "Command Center",
    incidents: "Incident History",
    memory: "Memory Explorer",
    deployment: "Pre-Deploy Risk Scanner",
  }[page];

  return (
    <div className="app">
      <GalaxyBackground />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <ShieldAlert size={28} />
          </div>

          <div>
            <h2>WARROOM X</h2>
            <span>INCIDENT INTELLIGENCE</span>
          </div>
        </div>

        <nav>
          <NavButton
            active={page === "command"}
            icon={<Activity size={18} />}
            label="Command Center"
            onClick={() =>
              navigate("command")
            }
          />

          <NavButton
            active={page === "incidents"}
            icon={<History size={18} />}
            label="Incidents"
            onClick={() =>
              navigate("incidents")
            }
          />

          <NavButton
            active={page === "memory"}
            icon={<Brain size={18} />}
            label="Memory"
            onClick={() =>
              navigate("memory")
            }
          />

          <NavButton
            active={page === "deployment"}
            icon={<Radar size={18} />}
            label="Risk Scanner"
            onClick={() =>
              navigate("deployment")
            }
          />
        </nav>

        <div className="memory-loop">
          <span>MEMORY LOOP</span>
          <strong>
            INCIDENT → LEARN → PREVENT
          </strong>
        </div>

        <div
          className={`memory-status ${health.hindsight ? "" : "offline"
            }`}
        >
          <div className="status-title">
            <Brain size={18} />
            HINDSIGHT
          </div>

          <div className="connected">
            <span className="dot" />
            {health.hindsight
              ? "MEMORY CONNECTED"
              : "MEMORY OFFLINE"}
          </div>
        </div>
      </aside>

      <main className="main">
        <header>
          <div>
            <p className="eyebrow">
              AI INCIDENT RESPONSE · PERSISTENT
              MEMORY
            </p>

            <h1>{pageTitle}</h1>
          </div>

          <div
            className={`system-online ${health.backend ? "" : "offline"
              }`}
          >
            {health.backend ? (
              <Wifi size={14} />
            ) : (
              <WifiOff size={14} />
            )}

            <span className="dot" />

            {health.backend
              ? "SYSTEM ONLINE"
              : "SYSTEM OFFLINE"}
          </div>
        </header>

        <div className="engine-strip">
          <EngineStatus
            label="BACKEND"
            active={health.backend}
          />

          <EngineStatus
            label="HINDSIGHT"
            active={health.hindsight}
          />

          <EngineStatus
            label="GROQ"
            active={health.groq}
          />

          <span className="engine-note">
            ROOT-CAUSE MEMORY ACTIVE
          </span>
        </div>

        {error && (
          <div className="error-box">
            <AlertTriangle size={19} />
            {error}
          </div>
        )}

        {success && (
          <div className="success-box">
            <CheckCircle2 size={19} />
            {success}
          </div>
        )}

        {page === "command" && (
          <>
            <section className="panel hero-panel">
              <div className="section-title">
                <div>
                  <p className="eyebrow">
                    LIVE ANALYSIS
                  </p>

                  <h2>
                    <ShieldAlert size={22} />
                    Active Incident
                  </h2>
                </div>

                <span className="critical">
                  LIVE
                </span>
              </div>

              <textarea
                value={incident}
                onChange={(e) =>
                  setIncident(e.target.value)
                }
                placeholder="Describe symptoms, affected services and recent changes..."
              />

              <div className="button-row">
                <button
                  onClick={analyzeIncident}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Search
                        className="spin"
                        size={18}
                      />
                      RECALLING MEMORY...
                    </>
                  ) : (
                    <>
                      <Zap size={18} />
                      ANALYZE INCIDENT
                    </>
                  )}
                </button>

                <button
                  className="secondary-button"
                  onClick={() =>
                    setIncident(DEMO_INCIDENT)
                  }
                >
                  LOAD MEMORY DEMO
                </button>

                <button
                  className="ghost-button"
                  onClick={() =>
                    setIncident(
                      UNRELATED_DEMO
                    )
                  }
                >
                  LOAD UNRELATED TEST
                </button>
              </div>
            </section>

            {analysis?.success && (
              <>
                <div className="stats">
                  <StatCard
                    icon={<Brain />}
                    title="MEMORIES RETRIEVED"
                    value={
                      analysis.memories_found
                    }
                  />

                  <StatCard
                    icon={<Activity />}
                    title="AI ENGINE"
                    value="ACTIVE"
                  />

                  <StatCard
                    icon={
                      noStrongMatch ? (
                        <CheckCircle2 />
                      ) : (
                        <AlertTriangle />
                      )
                    }
                    title="MEMORY VERDICT"
                    value={
                      noStrongMatch
                        ? "NO STRONG MATCH"
                        : "MATCH FOUND"
                    }
                    danger={!noStrongMatch}
                  />
                </div>

                <section className="panel intelligence-panel">
                  <div className="panel-heading">
                    <Sparkles size={20} />
                    WARROOM INTELLIGENCE
                  </div>

                  {parsedAnalysis[
                    "ROOT CAUSE"
                  ] ? (
                    <div className="analysis-grid">
                      <InsightCard
                        title="LIKELY ROOT CAUSE"
                        text={
                          parsedAnalysis[
                          "ROOT CAUSE"
                          ]
                        }
                      />

                      <InsightCard
                        title="RECOMMENDED ACTION"
                        text={
                          parsedAnalysis[
                          "RECOMMENDED ACTION"
                          ]
                        }
                      />

                      <InsightCard
                        title="OPERATIONAL RISK"
                        text={
                          parsedAnalysis["RISK"]
                        }
                      />

                      <InsightCard
                        title="HINDSIGHT VERDICT"
                        text={
                          parsedAnalysis[
                          "MEMORY USED"
                          ]
                        }
                        accent
                      />
                    </div>
                  ) : (
                    <pre>
                      {analysis.analysis}
                    </pre>
                  )}
                </section>

                <section className="panel">
                  <div className="panel-heading">
                    <Database size={20} />
                    ROOT CAUSE MEMORY
                  </div>

                  <p className="muted">
                    Hindsight retrieves historical
                    context. WARROOM X decides whether
                    that context is actually relevant.
                  </p>

                  {noStrongMatch ? (
                    <div className="no-match">
                      <CheckCircle2 size={23} />

                      <div>
                        <strong>
                          NO STRONG HISTORICAL
                          MATCH
                        </strong>

                        <p>
                          Historical memories were
                          retrieved, but WARROOM X
                          rejected them as unrelated
                          evidence.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="memory-grid">
                      {analysis.memories?.map(
                        (item, index) => (
                          <div
                            className="memory-card"
                            key={index}
                          >
                            <span>
                              MEMORY{" "}
                              {String(
                                index + 1
                              ).padStart(
                                2,
                                "0"
                              )}
                            </span>

                            <p>{item}</p>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </section>

                <section className="panel teach-panel">
                  <div className="panel-heading">
                    <Save size={20} />
                    RESOLVE & TEACH WARROOM X
                  </div>

                  <p className="muted">
                    Confirm what actually happened.
                    Hindsight retains the resolution
                    so future incidents and
                    deployments can learn from it.
                  </p>

                  <div className="form-grid">
                    <input
                      value={
                        resolution.incident_id
                      }
                      onChange={(e) =>
                        setResolution({
                          ...resolution,
                          incident_id:
                            e.target.value,
                        })
                      }
                      placeholder="Incident ID"
                    />

                    <select
                      value={
                        resolution.severity
                      }
                      onChange={(e) =>
                        setResolution({
                          ...resolution,
                          severity:
                            e.target.value,
                        })
                      }
                    >
                      <option value="low">
                        Low
                      </option>

                      <option value="medium">
                        Medium
                      </option>

                      <option value="high">
                        High
                      </option>

                      <option value="critical">
                        Critical
                      </option>
                    </select>
                  </div>

                  <input
                    value={
                      resolution.root_cause
                    }
                    onChange={(e) =>
                      setResolution({
                        ...resolution,
                        root_cause:
                          e.target.value,
                      })
                    }
                    placeholder="Confirmed root cause"
                  />

                  <textarea
                    className="small-textarea"
                    value={
                      resolution.resolution
                    }
                    onChange={(e) =>
                      setResolution({
                        ...resolution,
                        resolution:
                          e.target.value,
                      })
                    }
                    placeholder="How was the incident resolved?"
                  />

                  <textarea
                    className="small-textarea"
                    value={resolution.lesson}
                    onChange={(e) =>
                      setResolution({
                        ...resolution,
                        lesson:
                          e.target.value,
                      })
                    }
                    placeholder="What should WARROOM X remember next time?"
                  />

                  <button
                    onClick={saveResolution}
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <Search
                          className="spin"
                          size={18}
                        />
                        WRITING MEMORY...
                      </>
                    ) : (
                      <>
                        <Brain size={18} />
                        SAVE TO HINDSIGHT
                        MEMORY
                      </>
                    )}
                  </button>
                </section>
              </>
            )}
          </>
        )}

        {page === "incidents" && (
          <section className="panel">
            <div className="panel-heading">
              <History size={20} />
              RESOLVED INCIDENTS
            </div>

            <p className="muted">
              Every confirmed resolution becomes
              operational knowledge for WARROOM X.
            </p>

            <div className="incident-list">
              {incidents.length === 0 && (
                <EmptyState text="No resolved incidents loaded." />
              )}

              {incidents.map((item) => (
                <div
                  className="incident-row"
                  key={`${item.id}-${item.timestamp}`}
                >
                  <div>
                    <div className="incident-id">
                      {item.id}
                    </div>

                    <h3>{item.title}</h3>

                    <p>
                      {item.root_cause}
                    </p>
                  </div>

                  <div className="incident-meta">
                    <span
                      className={`severity ${item.severity?.toLowerCase()}`}
                    >
                      {item.severity}
                    </span>

                    <span className="resolved">
                      {item.status}
                    </span>

                    <small>
                      <Clock3 size={12} />
                      {item.timestamp}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {page === "memory" && (
          <>
            <section className="panel">
              <div className="panel-heading">
                <Brain size={20} />
                HINDSIGHT MEMORY EXPLORER
              </div>

              <p className="muted">
                Search persistent operational
                knowledge captured from previous
                incidents.
              </p>

              <div className="search-row">
                <input
                  value={memoryQuery}
                  onChange={(e) =>
                    setMemoryQuery(
                      e.target.value
                    )
                  }
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter"
                    ) {
                      loadMemories(
                        memoryQuery
                      );
                    }
                  }}
                  placeholder="Search: database, deployment, outage, rollback..."
                />

                <button
                  onClick={() =>
                    loadMemories(
                      memoryQuery
                    )
                  }
                  disabled={memoryLoading}
                >
                  {memoryLoading ? (
                    <Search
                      className="spin"
                      size={17}
                    />
                  ) : (
                    <Search size={17} />
                  )}

                  RECALL
                </button>
              </div>
            </section>

            <section className="panel">
              <div className="memory-grid">
                {memories.length === 0 && (
                  <EmptyState text="No memory nodes returned." />
                )}

                {memories.map(
                  (item, index) => (
                    <div
                      className="memory-card"
                      key={index}
                    >
                      <span>
                        MEMORY NODE{" "}
                        {String(
                          index + 1
                        ).padStart(2, "0")}
                      </span>

                      <p>{item}</p>
                    </div>
                  )
                )}
              </div>
            </section>
          </>
        )}

        {page === "deployment" && (
          <>
            <section className="panel scanner risk-hero">
              <div className="panel-heading">
                <Radar size={20} />
                PRE-DEPLOY MEMORY CHECK
              </div>

              <h2>
                Stop the next outage before
                production.
              </h2>

              <p className="muted">
                Compare a planned production
                change with incident memory
                retained by Hindsight.
              </p>

              <textarea
                value={deployment}
                onChange={(e) =>
                  setDeployment(
                    e.target.value
                  )
                }
                placeholder="Describe the planned production change..."
              />

              <div className="button-row">
                <button
                  onClick={scanDeployment}
                  disabled={
                    deploymentLoading
                  }
                >
                  {deploymentLoading ? (
                    <>
                      <Search
                        className="spin"
                        size={18}
                      />
                      SCANNING MEMORY...
                    </>
                  ) : (
                    <>
                      <Radar size={18} />
                      SCAN DEPLOYMENT RISK
                    </>
                  )}
                </button>

                <button
                  className="secondary-button"
                  onClick={() =>
                    setDeployment(
                      RISK_DEMO
                    )
                  }
                >
                  LOAD KILLER DEMO
                </button>
              </div>
            </section>

            {deploymentResult?.success && (
              <>
                <div className="stats">
                  <StatCard
                    icon={<Database />}
                    title="MEMORIES CHECKED"
                    value={
                      deploymentResult.memories_found
                    }
                  />

                  <StatCard
                    icon={<Radar />}
                    title="SCANNER"
                    value="ACTIVE"
                  />

                  <StatCard
                    icon={<ShieldAlert />}
                    title="MODE"
                    value="PREVENT"
                    danger
                  />
                </div>

                <section className="panel risk-result">
                  <div className="panel-heading">
                    <Terminal size={20} />
                    DEPLOYMENT INTELLIGENCE
                  </div>

                  <pre>
                    {
                      deploymentResult.analysis
                    }
                  </pre>

                  <div className="memory-chain">
                    <div>
                      <span>01</span>
                      PREVIOUS INCIDENT
                    </div>

                    <strong>→</strong>

                    <div>
                      <span>02</span>
                      HINDSIGHT RECALL
                    </div>

                    <strong>→</strong>

                    <div>
                      <span>03</span>
                      PREVENTIVE WARNING
                    </div>
                  </div>
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}) {
  return (
    <button
      className={`nav-item ${active ? "active" : ""
        }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function EngineStatus({
  label,
  active,
}) {
  return (
    <div
      className={`engine-pill ${active ? "active" : "inactive"
        }`}
    >
      <span />
      {label}
    </div>
  );
}

function StatCard({
  icon,
  title,
  value,
  danger = false,
}) {
  return (
    <div
      className={`stat-card ${danger ? "danger" : ""
        }`}
    >
      {icon}

      <div>
        <span>{title}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function InsightCard({
  title,
  text,
  accent = false,
}) {
  return (
    <div
      className={`insight-card ${accent ? "accent" : ""
        }`}
    >
      <span>{title}</span>

      <div className="insight-text">
        {text || "No data returned."}
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="empty-state">
      <Database size={22} />
      <span>{text}</span>
    </div>
  );
}

export default App;