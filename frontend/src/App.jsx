import { useEffect, useMemo, useState } from "react";
import facilities from "./data";
import lcAssignments from "./lcAssignments";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://arfh-fct-upload-portal.onrender.com";
const PASSWORD_STORAGE_KEY = "arfh_app_password";

const REPORT_TYPES = {
  PPM: "PPM ETL Upload",
  PMTCT: "Community PMTCT Upload",
};

const MONTH_OPTIONS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Monthly targets apply to each LC for every LGA in which they supervise facilities.
const LC_MONTHLY_TARGETS = {
  amac: { presumptive: 100, notified: 10 },
  abaji: { presumptive: 50, notified: 5 },
  bwari: { presumptive: 100, notified: 10 },
  kwali: { presumptive: 75, notified: 8 },
  kuje: { presumptive: 50, notified: 5 },
  gwagwalada: { presumptive: 100, notified: 10 },
};

const lcAchievementStyle = (value) => value >= 100
  ? { color: "#047857", background: "#ecfdf5", bar: "#059669", label: "Target met" }
  : value >= 80
    ? { color: "#92400e", background: "#fffbeb", bar: "#d97706", label: "Near target" }
    : { color: "#b91c1c", background: "#fef2f2", bar: "#dc2626", label: "Below target" };

function LcTargetCell({ actual, target, hasReport }) {
  if (!hasReport) return <span className="italic text-slate-400">No report</span>;
  if (!target) return <span className="text-slate-500">N/A</span>;
  const percentage = actual / target * 100;
  const style = lcAchievementStyle(percentage);
  return <div className="min-w-[125px] rounded-lg px-2 py-1.5" style={{backgroundColor:style.background,color:style.color}} title={`${style.label}: ${actual} / ${target}`}>
    <div className="flex items-baseline justify-between gap-2"><strong>{percentage.toFixed(1)}%</strong><span className="text-[11px]">{actual.toLocaleString()} / {target.toLocaleString()}</span></div>
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full" style={{width:`${Math.min(100,Math.max(0,percentage))}%`,backgroundColor:style.bar}}/></div>
  </div>;
}

export default function App() {
  const [password, setPassword] = useState(localStorage.getItem(PASSWORD_STORAGE_KEY) || "");
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(localStorage.getItem(PASSWORD_STORAGE_KEY)));
  const [loginError, setLoginError] = useState("");

  const [stateValue, setStateValue] = useState("FCT");
  const [lga, setLga] = useState("AMAC");
  const [facilitySearch, setFacilitySearch] = useState("");
  const [facility, setFacility] = useState("Jikwoyi Medical Center");
  const [year, setYear] = useState("2026");
  const [month, setMonth] = useState("March");
  const [reportType, setReportType] = useState(REPORT_TYPES.PPM);
  const [file, setFile] = useState(null);

  const [loadingAction, setLoadingAction] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [previewData, setPreviewData] = useState(null);
  const [validationData, setValidationData] = useState(null);
  const [uploadData, setUploadData] = useState(null);
  const [uploadLogs, setUploadLogs] = useState([]);
  const [activeView, setActiveView] = useState("upload");
  const [performanceRows, setPerformanceRows] = useState([]);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceError, setPerformanceError] = useState("");
  const [dashboardState, setDashboardState] = useState("All");
  const [dashboardMonth, setDashboardMonth] = useState("All");
  const [dashboardYear, setDashboardYear] = useState("2026");
  const [dashboardLga, setDashboardLga] = useState("All");
  const [chartMetric, setChartMetric] = useState("notified");
  const [lcLga, setLcLga] = useState("All");
  const [lcSelected, setLcSelected] = useState("All");
  const [lcSort, setLcSort] = useState("notifiedAchievement");
  const [contributionType, setContributionType] = useState("All");

  const isPmtct = reportType === REPORT_TYPES.PMTCT;

  const stateOptions = useMemo(() => Object.keys(facilities), []);
  const lgaOptions = useMemo(
    () => Object.keys(facilities[stateValue] || {}),
    [stateValue]
  );
  const facilityOptions = useMemo(
    () => facilities[stateValue]?.[lga] || [],
    [stateValue, lga]
  );

  const filteredFacilities = useMemo(() => {
    if (!facilitySearch.trim()) return facilityOptions;
    return facilityOptions.filter((item) =>
      item.toLowerCase().includes(facilitySearch.toLowerCase())
    );
  }, [facilityOptions, facilitySearch]);

  useEffect(() => {
    if (!lgaOptions.includes(lga)) {
      setLga(lgaOptions[0] || "");
      setFacilitySearch("");
    }
  }, [stateValue, lgaOptions, lga]);

  useEffect(() => {
    if (!isPmtct && !facilityOptions.includes(facility)) {
      setFacility(facilityOptions[0] || "");
    }
  }, [facilityOptions, facility, isPmtct]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    setPreviewData(null);
    setValidationData(null);
    setUploadData(null);
    setErrorMessage("");
    setSuccessMessage("");
  }, [reportType, month, year, stateValue, lga, facility]);

  const validationPassed = validationData?.status === "passed";

  const resetFeedback = () => {
    setErrorMessage("");
    setSuccessMessage("");
  };

  const clearWorkflowState = () => {
    setPreviewData(null);
    setValidationData(null);
    setUploadData(null);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const handleLogin = async () => {
    const cleanPassword = password.trim();

    if (!cleanPassword) {
      setLoginError("Please enter the team access password.");
      return;
    }

    try {
      setLoginError("");
      const response = await fetch(`${API_BASE_URL}/api/upload-logs`, {
        headers: {
          "X-App-Password": cleanPassword,
        },
      });

      if (!response.ok) {
        throw new Error("Invalid password. Please try again.");
      }

      localStorage.setItem(PASSWORD_STORAGE_KEY, cleanPassword);
      setPassword(cleanPassword);
      setIsAuthenticated(true);
    } catch (error) {
      setLoginError(error.message || "Login failed. Please try again.");
      localStorage.removeItem(PASSWORD_STORAGE_KEY);
      setIsAuthenticated(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(PASSWORD_STORAGE_KEY);
    setPassword("");
    setIsAuthenticated(false);
    setUploadLogs([]);
    setPreviewData(null);
    setValidationData(null);
    setUploadData(null);
    resetFeedback();
  };

  const getAuthHeaders = () => ({
    "X-App-Password": localStorage.getItem(PASSWORD_STORAGE_KEY) || password,
  });

  const getCurrentRequestContext = () => ({
    facility_name: isPmtct ? "Community PMTCT Cascade" : facility,
    lga,
    state: stateValue,
    report_year: year,
    source_month_sheet: month,
    target_tab: month,
    report_type: reportType,
    spreadsheet_name: isPmtct
      ? "Community PMTCT reporting template"
      : `${stateValue} PPM Indicator reporting template`,
    file_name: file?.name || "",
    file_size: file?.size || 0,
    file_last_modified: file?.lastModified || 0,
  });

  const contextsMatch = (a, b) => {
    if (!a || !b) return false;
    return (
      a.facility_name === b.facility_name &&
      a.lga === b.lga &&
      a.state === b.state &&
      a.report_year === b.report_year &&
      a.source_month_sheet === b.source_month_sheet &&
      a.report_type === b.report_type &&
      a.file_name === b.file_name &&
      a.file_size === b.file_size &&
      a.file_last_modified === b.file_last_modified
    );
  };

  const buildFormData = (context) => {
    if (!file) throw new Error("Please choose an Excel file first.");
    if (!isPmtct && !context?.facility_name) throw new Error("Please select a facility.");

    const formData = new FormData();
    formData.append("facility_name", context.facility_name);
    formData.append("lga", context.lga);
    formData.append("state", context.state);
    formData.append("report_year", context.report_year);
    formData.append("source_month_sheet", context.source_month_sheet);
    formData.append("target_tab", context.target_tab);
    formData.append("report_type", context.report_type);
    formData.append("spreadsheet_name", context.spreadsheet_name);
    formData.append(
      "warning_acknowledged",
      validationData?.warning_confirmed ? "true" : "false"
    );
    formData.append("file", file);
    return formData;
  };

  const formatBackendError = (data, status) => {
    const detail = data?.detail;

    if (typeof detail === "string") {
      return detail;
    }

    if (detail && typeof detail === "object") {
      const heading =
        detail.message ||
        data?.message ||
        `Request failed with status ${status}`;

      const issues = Array.isArray(detail.issues)
        ? detail.issues
        : Array.isArray(detail.warnings)
          ? detail.warnings
          : [];

      if (issues.length > 0) {
        const issueLines = issues.map((issue, index) => {
          if (typeof issue === "string") {
            return `${index + 1}. ${issue}`;
          }

          if (issue?.message) {
            return `${index + 1}. ${issue.message}`;
          }

          const location = [
            issue?.provider ? `Provider: ${issue.provider}` : "",
            issue?.sex ? `Sex: ${issue.sex}` : "",
            issue?.age_band ? `Age band: ${issue.age_band}` : "",
          ]
            .filter(Boolean)
            .join(" | ");

          return `${index + 1}. ${location || "Validation issue"}`;
        });

        return `${heading}\n\n${issueLines.join("\n")}`;
      }

      if (Array.isArray(detail.available_worksheets)) {
        return `${heading}\n\nAvailable worksheets: ${detail.available_worksheets.join(", ")}`;
      }

      if (Array.isArray(detail.expected_age_bands)) {
        const found = Array.isArray(detail.age_bands_found)
          ? detail.age_bands_found.join(", ")
          : "Not available";

        return `${heading}\n\nExpected: ${detail.expected_age_bands.join(", ")}\nFound: ${found}`;
      }

      return heading;
    }

    if (typeof data?.message === "string") {
      return data.message;
    }

    return `Request failed with status ${status}`;
  };

  const postToBackend = async (endpoint, requestContext) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: buildFormData(requestContext),
    });

    let data = {};

    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      if (response.status === 401) {
        localStorage.removeItem(PASSWORD_STORAGE_KEY);
        setIsAuthenticated(false);
      }

      throw new Error(formatBackendError(data, response.status));
    }

    return data;
  };

  const fetchLogs = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/upload-logs`, {
        headers: getAuthHeaders(),
      });

      if (response.status === 401) {
        localStorage.removeItem(PASSWORD_STORAGE_KEY);
        setIsAuthenticated(false);
        return;
      }

      const data = await response.json();
      setUploadLogs(data.logs || []);
    } catch {
      // Ignore logs fetch errors so the upload form remains usable.
    }
  };

  const fetchPerformance = async () => {
    setPerformanceLoading(true);
    setPerformanceError("");
    try {
      const params = new URLSearchParams();
      if (dashboardState !== "All") params.set("state", dashboardState);
      if (dashboardMonth !== "All") params.set("report_month", dashboardMonth);
      if (dashboardYear !== "All") params.set("report_year", dashboardYear);
      const response = await fetch(`${API_BASE_URL}/api/performance?${params}`, { headers: getAuthHeaders() });
      if (response.status === 401) {
        localStorage.removeItem(PASSWORD_STORAGE_KEY);
        setIsAuthenticated(false);
        throw new Error("Session expired. Please log in again.");
      }
      if (!response.ok) throw new Error(`Could not load dashboard (HTTP ${response.status}).`);
      const data = await response.json();
      setPerformanceRows(Array.isArray(data.facilities) ? data.facilities : []);
    } catch (error) {
      setPerformanceRows([]);
      setPerformanceError(error.message || "Dashboard unavailable.");
    } finally {
      setPerformanceLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated && (activeView === "dashboard" || activeView === "lc")) fetchPerformance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeView, dashboardState, dashboardMonth, dashboardYear]);

  useEffect(() => { setDashboardLga("All"); }, [dashboardState, dashboardMonth, dashboardYear]);
  const dashboardLgas = useMemo(() => [...new Set(performanceRows.map((r) => r.lga).filter(Boolean))].sort(), [performanceRows]);
  // Provider breakdown in stored schema v1: facility is Hub; pmv/community/lab/tba are Spokes.
  // Evaluated, treatment started, HIV and ART are only stored as facility-level totals,
  // so never present them as provider-specific figures.
  const PROVIDER_KEYS = ["facility", "pmv", "community", "lab", "tba"];
  const PROVIDER_METRICS = ["attendance", "screened", "presumptive", "diagnosed", "notified", "drtb_presumptive", "drtb_notified", "drtb_started"];
  const providerValue = (row, metric) => {
    if (contributionType === "All") return Number(row.indicators?.totals?.[metric]) || 0;
    if (!PROVIDER_METRICS.includes(metric)) return null;
    const providers = row.indicators?.by_provider;
    if (!providers || !PROVIDER_KEYS.every(k => providers[k] && typeof providers[k][metric] === "number")) return null;
    const keys = contributionType === "Hub" ? ["facility"] : ["pmv", "community", "lab", "tba"];
    return keys.reduce((sum, key) => sum + providers[key][metric], 0);
  };
  useEffect(() => { if (activeView === "lc" && contributionType !== "Spoke") setContributionType("Spoke"); }, [activeView, contributionType]);
  const missingProviderRows = useMemo(() => contributionType === "All" ? 0 : performanceRows.filter(r => providerValue(r, "presumptive") === null).length, [performanceRows, contributionType]);
  const providerRows = useMemo(() => performanceRows.filter(r => contributionType === "All" || providerValue(r, "presumptive") !== null).map(r => ({ ...r, indicators: {
    ...r.indicators,
    totals: contributionType === "All" ? r.indicators?.totals : Object.fromEntries(PROVIDER_METRICS.map(k => [k, providerValue(r, k)]))
  }})), [performanceRows, contributionType]);
  const visibleRows = useMemo(() => providerRows.filter((r) => dashboardLga === "All" || r.lga === dashboardLga), [providerRows, dashboardLga]);
  const monthOrder = MONTH_OPTIONS;
  useEffect(() => { if (contributionType !== "All" && chartMetric === "treatment_started") setChartMetric("notified"); }, [contributionType, chartMetric]);
  const monthlySeries = useMemo(() => monthOrder.map((month) => ({
    month: month.slice(0, 3),
    count: visibleRows.filter((r) => r.report_month === month || r.report_month === month.slice(0, 3))
      .reduce((sum, r) => sum + (Number(r.indicators?.totals?.[chartMetric]) || 0), 0),
  })), [visibleRows, chartMetric]);
  const exportCsv = () => {
    if (!visibleRows.length || performanceRows.length >= 1000) return;
    const keys = contributionType === "All" ? ["attendance", "screened", "presumptive", "evaluated", "diagnosed", "notified", "treatment_started", "hiv_positive", "art", "cpt", "drtb_presumptive", "drtb_evaluated_xpert", "drtb_notified", "drtb_started"] : PROVIDER_METRICS;
    const header = ["State", "LGA", "Facility", "Year", "Month", "Contribution", ...keys];
    const escapeCsv = (v) => `"${String(v ?? "").replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const lines = [header, ...visibleRows.map((r) => [r.state, r.lga, r.facility_name, r.report_year, r.report_month, contributionType, ...keys.map((k) => Number(r.indicators?.totals?.[k]) || 0)])];
    const csv = "\uFEFF" + lines.map((line) => line.map(escapeCsv).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url;
    a.download = `ARFH_TB_${contributionType}_${dashboardState}_${dashboardLga}_${dashboardMonth}_${dashboardYear}.csv`.replace(/[^a-zA-Z0-9_.-]/g, "_");
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  const exportExcel = () => {
    if (!visibleRows.length || performanceRows.length >= 1000) return;
    const keys = ["attendance", "screened", "presumptive", "evaluated", "diagnosed", "notified", "treatment_started", "hiv_positive", "art", "cpt", "drtb_presumptive", "drtb_evaluated_xpert", "drtb_notified", "drtb_started"];
    const sum = (k) => dashboardTotals[k] || 0;
    const ratio = (a,b) => b ? Math.round(a/b*1000)/10 : "N/A";
    const sheets = [
      {name:"Executive Summary", rows:[
        ["ARFH | TB PROGRAMME PERFORMANCE REPORT"],
        ["State",dashboardState,"LGA",dashboardLga,"Month",dashboardMonth,"Year",dashboardYear],
        ["Facility-month records",visibleRows.length],[],
        ["Indicator","Reported count"],
        ...keys.map(k=>[k.replaceAll("_"," ").toUpperCase(),sum(k)]),[],
        ["Performance metric","Rate (%)"],
        ["Presumptive among screened",ratio(sum("presumptive"),sum("screened"))],
        ["Evaluation coverage",ratio(sum("evaluated"),sum("presumptive"))],
        ["Diagnostic yield",ratio(sum("diagnosed"),sum("evaluated"))],
        ["Treatment initiation / notified",ratio(sum("treatment_started"),sum("notified"))],[],
        ["Interpretation","Reporting-period ratios, not longitudinal patient tracking."],
        ["Coverage","Only uploaded facility-month records; no expected reporting denominator supplied."]
      ]},
      {name:"Facility Performance", rows:[
        ["State","LGA","Facility","Year","Month",...keys],
        ...visibleRows.map(r=>[r.state,r.lga,r.facility_name,r.report_year,r.report_month,...keys.map(k=>Number(r.indicators?.totals?.[k])||0)])
      ]},
      {name:"DRTB", rows:[
        ["State","LGA","Facility","Year","Month","DRTB presumptive","DRTB evaluated by Xpert","RR-MDR TB notified","RR-MDR TB started",...Array.from({length:9},(_,i)=>`Regimen 23.${i+1}`)],
        ...visibleRows.map(r=>[r.state,r.lga,r.facility_name,r.report_year,r.report_month,...["drtb_presumptive","drtb_evaluated_xpert","drtb_notified","drtb_started"].map(k=>Number(r.indicators?.totals?.[k])||0),...Array.from({length:9},(_,i)=>Number(r.indicators?.drtb_regimens?.[`23.${i+1}`])||0)])
      ]},
      {name:"Data Quality", rows:[
        ["Check","Result","Comment"],
        ["Records exported",visibleRows.length,"Distinct uploaded facility-month snapshots"],
        ["Backend limit",performanceRows.length>=1000?"Reached":"Not reached","Export blocked if 1,000-record limit reached"],
        ["Missing reporting periods","Not assessed","No expected facility reporting roster is connected"],
        ["Negative values",visibleRows.some(r=>keys.some(k=>(Number(r.indicators?.totals?.[k])||0)<0))?"Review":"None found","Simple aggregate check"],
        ["Presumptive above screened",visibleRows.filter(r=>(Number(r.indicators?.totals?.presumptive)||0)>(Number(r.indicators?.totals?.screened)||0)).length,"Number of facility-month records"],
        ["Evaluated above presumptive",visibleRows.filter(r=>(Number(r.indicators?.totals?.evaluated)||0)>(Number(r.indicators?.totals?.presumptive)||0)).length,"Number of facility-month records"],
        ["Regimen sum above DRTB started",visibleRows.filter(r=>Object.values(r.indicators?.drtb_regimens||{}).reduce((a,v)=>a+(Number(v)||0),0)>(Number(r.indicators?.totals?.drtb_started)||0)).length,"Number of facility-month records"],
        ["Note","Not a full data audit","Checks are indicative and do not replace source validation"]
      ]}
    ];
    const file = makeExcelWorkbook(sheets);
    downloadReportBlob(file,`ARFH_TB_${dashboardState}_${dashboardLga}_${dashboardMonth}_${dashboardYear}.xlsx`);
  };
  const exportPdf = () => {
    if (!visibleRows.length || performanceRows.length >= 1000) return;
    const safe = (v) => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const fmt = k => (dashboardTotals[k]||0).toLocaleString();
    const pct = (a,b) => b ? `${(a/b*100).toFixed(1)}%` : "N/A";
    const metrics = [
      ["Presumptive among screened", "presumptive", "screened"],
      ["Evaluation coverage", "evaluated", "presumptive"],
      ["Diagnostic yield", "diagnosed", "evaluated"],
      ["Treatment initiation / notified", "treatment_started", "notified"]
    ];
    const stages = [["Screened","screened"],["Presumptive","presumptive"],["Evaluated","evaluated"],["Diagnosed","diagnosed"],["Notified","notified"],["Treatment started","treatment_started"]];
    const max = Math.max(1,dashboardTotals.screened);
    const bars = stages.map(([name,k],i)=>`<text x="4" y="${27+i*37}" font-size="12" fill="#243449">${safe(name)}</text><rect x="150" y="${13+i*37}" width="480" height="18" rx="6" fill="#eaf0f6"/><rect x="150" y="${13+i*37}" width="${Math.max(0,480*(dashboardTotals[k]||0)/max)}" height="18" rx="6" fill="#165693"/><text x="642" y="${27+i*37}" font-size="12" font-weight="bold">${fmt(k)}</text>`).join("");
    const monthly = MONTH_OPTIONS.map(m=>({m,n:visibleRows.filter(r=>r.report_month===m||r.report_month===m.slice(0,3)).reduce((a,r)=>a+(Number(r.indicators?.totals?.notified)||0),0),has:visibleRows.some(r=>r.report_month===m||r.report_month===m.slice(0,3))}));
    const mmax = Math.max(1,...monthly.map(x=>x.n));
    const monthlyBars = monthly.map((x,i)=>`<rect x="${22+i*55}" y="${185-x.n/mmax*140}" width="30" height="${x.has?Math.max(2,x.n/mmax*140):0}" rx="3" fill="#2b79bc"/><text x="${37+i*55}" y="205" text-anchor="middle" font-size="11">${x.m.slice(0,3)}</text>${x.has?`<text x="${37+i*55}" y="${178-x.n/mmax*140}" text-anchor="middle" font-size="10">${x.n}</text>`:`<text x="${37+i*55}" y="185" text-anchor="middle" font-size="9" fill="#9aa6b2">—</text>`}`).join("");
    const cards = [["Screened","screened"],["Presumptive","presumptive"],["Evaluated","evaluated"],["Diagnosed","diagnosed"],["Notified","notified"],["Treatment started","treatment_started"],["HIV positive","hiv_positive"],["On ART","art"]].map(([n,k])=>`<div class="kpi"><small>${safe(n)}</small><strong>${fmt(k)}</strong></div>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>ARFH TB Performance Report</title><style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#17243c;margin:0}header{background:#165693;color:white;padding:23px 26px;border-radius:10px}header h1{margin:5px 0;font-size:24px}header p{margin:5px 0;color:#dbeafa}.eyebrow{letter-spacing:2px;text-transform:uppercase;font-size:10px}.meta{margin:16px 0;color:#52657a}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.kpi{border:1px solid #dce6f0;border-radius:8px;padding:12px;background:#f7faff}.kpi small{display:block;color:#536a83;text-transform:uppercase;font-size:9px}.kpi strong{display:block;font-size:21px;margin-top:5px;color:#12395e}h2{font-size:16px;color:#12395e;border-bottom:2px solid #e2ebf4;padding-bottom:7px;margin:22px 0 12px}.rategrid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.rate{padding:11px;background:#eef5fb;border-left:4px solid #165693}.rate b{float:right;font-size:16px}svg{width:100%;height:auto}table{border-collapse:collapse;width:100%;font-size:10px}th,td{padding:8px;border-bottom:1px solid #e2e8f0;text-align:left}th{background:#eaf1f8;color:#12395e}tr{break-inside:avoid}.note{color:#607086;font-size:10px;line-height:1.6}.break{break-before:page}.footer{margin-top:20px;border-top:1px solid #dce6f0;padding-top:9px;color:#64748b;font-size:10px}@media print{header{-webkit-print-color-adjust:exact;print-color-adjust:exact}.kpi,.rate,th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><header><div class="eyebrow">ARFH · Programme intelligence</div><h1>TB Performance Report</h1><p>${safe(dashboardState)} / ${safe(dashboardLga)} · ${safe(dashboardMonth)} ${safe(dashboardYear)}</p></header><div class="meta">${visibleRows.length} facility-month record(s) · Generated ${safe(new Date().toLocaleString())} · Source: ARFH Supabase facility snapshots</div><h2>Executive performance summary</h2><div class="grid">${cards}</div><h2>Service delivery indicators</h2><div class="rategrid">${metrics.map(([n,a,b])=>`<div class="rate">${safe(n)}<b>${pct(dashboardTotals[a],dashboardTotals[b])}</b></div>`).join("")}</div><h2>TB service cascade</h2><svg viewBox="0 0 720 240" xmlns="http://www.w3.org/2000/svg">${bars}</svg><p class="note">Ratios compare counts reported within the selected period and do not establish longitudinal patient linkage.</p><h2>Monthly notification trend</h2><svg viewBox="0 0 700 220" xmlns="http://www.w3.org/2000/svg">${monthlyBars}</svg><p class="note">Dash (—) indicates no uploaded facility-month record in the selected dataset, not zero service activity.</p><h2>Drug-resistant TB</h2><div class="grid">${[["Presumptive","drtb_presumptive"],["Evaluated by Xpert","drtb_evaluated_xpert"],["RR/MDR notified","drtb_notified"],["RR/MDR started","drtb_started"]].map(([n,k])=>`<div class="kpi"><small>${safe(n)}</small><strong>${fmt(k)}</strong></div>`).join("")}</div><h2>Facility performance</h2><table><thead><tr><th>State</th><th>LGA</th><th>Facility</th><th>Month</th><th>Screened</th><th>Diagnosed</th><th>Notified</th><th>DRTB notified</th></tr></thead><tbody>${visibleRows.map(r=>`<tr><td>${safe(r.state)}</td><td>${safe(r.lga)}</td><td>${safe(r.facility_name)}</td><td>${safe(r.report_month)} ${safe(r.report_year)}</td>${["screened","diagnosed","notified","drtb_notified"].map(k=>`<td>${Number(r.indicators?.totals?.[k])||0}</td>`).join("")}</tr>`).join("")}</tbody></table><h2>Data quality and interpretation</h2><p class="note">This report includes only uploaded facility-month snapshots. Reporting completeness cannot be calculated without an expected facility reporting roster. Missing uploads are not treated as zero activity. Counts may represent different patient cohorts or reporting periods; interpret conversion rates accordingly. DRTB regimen categories are not added to notified totals.</p><div class="footer">ARFH TB Programme Intelligence · Generated from filtered uploaded records · Internal programme reporting</div></body></html>`;
    const w=window.open("","_blank");
    if(!w){setPerformanceError("Allow pop-ups to open the printable PDF report.");return;}
    w.document.open();w.document.write(html);w.document.close();w.focus();w.setTimeout(()=>w.print(),500);
  };

  // Match on state + LGA + facility to avoid attributing similarly named facilities incorrectly.
  const normalizeLcKey = (value) => String(value ?? "").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
  const lcMapping = useMemo(() => new Map(lcAssignments.map(a => [
    [a.state, a.lga, a.facility].map(normalizeLcKey).join("|"), a
  ])), []);
  const lcLgas = useMemo(() => [...new Set(lcAssignments.map(a => a.lga))].sort(), []);
  // "All months" means 12 calendar months, even if only one month has uploaded data.
  // With "All years" selected, a denominator is intentionally not inferred.
  const lcTargetMonths = dashboardYear === "All" ? null : (dashboardMonth === "All" ? 12 : 1);
  const lcRoster = useMemo(() => {
    const roster = new Map();
    lcAssignments.filter(a => lcLga === "All" || a.lga === lcLga).forEach(a => {
      if (!roster.has(a.lc)) roster.set(a.lc, { lc:a.lc, lgas:new Set(), facilities:new Set(), reported:new Set(), presumptive:0, diagnosed:0, notified:0, screened:0, evaluated:0, months:new Set() });
      const item = roster.get(a.lc);
      item.lgas.add(a.lga);
      item.facilities.add([a.state,a.lga,a.facility].map(normalizeLcKey).join("|"));
    });
    providerRows.filter(r => normalizeLcKey(r.state) === "fct" && (lcLga === "All" || normalizeLcKey(r.lga) === normalizeLcKey(lcLga))).forEach(r => {
      const key = [r.state,r.lga,r.facility_name].map(normalizeLcKey).join("|");
      const match = lcMapping.get(key);
      if (!match || !roster.has(match.lc)) return;
      const item = roster.get(match.lc);
      if (contributionType !== "All" && r.indicators?.totals?.presumptive == null) return;
      item.reported.add(key);
      item.months.add(`${r.report_year}-${r.report_month}`);
      ["presumptive","diagnosed","notified","screened","evaluated"].forEach(k => { item[k] += Number(r.indicators?.totals?.[k]) || 0; });
    });
    return [...roster.values()].map(x => {
      const monthlyTarget = [...x.lgas].reduce((acc,lga) => {
        const target = LC_MONTHLY_TARGETS[normalizeLcKey(lga)];
        if (target) { acc.presumptive += target.presumptive; acc.notified += target.notified; }
        return acc;
      }, { presumptive: 0, notified: 0 });
      const presumptiveTarget = lcTargetMonths === null ? null : monthlyTarget.presumptive * lcTargetMonths;
      const notifiedTarget = lcTargetMonths === null ? null : monthlyTarget.notified * lcTargetMonths;
      return { ...x, lgas:[...x.lgas].join(", "), assigned:x.facilities.size, reporting:x.reported.size,
      presumptiveTarget, notifiedTarget,
      presumptiveAchievement: x.reported.size && presumptiveTarget ? x.presumptive / presumptiveTarget * 100 : null,
      notifiedAchievement: x.reported.size && notifiedTarget ? x.notified / notifiedTarget * 100 : null,
      diagnosticYield:(contributionType === "All" ? x.evaluated : x.presumptive) ? x.diagnosed / (contributionType === "All" ? x.evaluated : x.presumptive) * 100 : null,
      notificationRate:x.diagnosed ? x.notified / x.diagnosed * 100 : null
    }; });
  }, [providerRows, lcMapping, lcLga, contributionType, lcTargetMonths]);
  const lcRows = useMemo(() => lcRoster.filter(x => lcSelected === "All" || x.lc === lcSelected)
    .sort((a,b) => (b[lcSort] ?? -1) - (a[lcSort] ?? -1) ||
      (b.notifiedAchievement ?? -1) - (a.notifiedAchievement ?? -1) ||
      (b.presumptiveAchievement ?? -1) - (a.presumptiveAchievement ?? -1) || a.lc.localeCompare(b.lc)), [lcRoster, lcSelected, lcSort]);
  const lcUnmatched = useMemo(() => providerRows.filter(r => normalizeLcKey(r.state)==="fct" &&
    (lcLga === "All" || normalizeLcKey(r.lga)===normalizeLcKey(lcLga)) &&
    !lcMapping.has([r.state,r.lga,r.facility_name].map(normalizeLcKey).join("|"))), [providerRows,lcLga,lcMapping]);
  const lcExport = () => {
    if (!lcRows.length || performanceRows.length >= 1000) return;
    const header=["LC","LGA","Assigned facilities","Facilities reporting","Presumptive","Presumptive target","Presumptive achievement (%)","Diagnosed","Notified","Notified target","Notification target achievement (%)","Diagnostic yield (%)","Notification rate (%)","Contribution","Period months"];
    const esc = v => `"${String(v ?? "").replace(/^[=+@-]/,"'$&").replace(/"/g,'""')}"`;
    const lines=[header,...lcRows.map(x=>[x.lc,x.lgas,x.assigned,x.reporting,x.reporting ? x.presumptive : "No report",x.presumptiveTarget??"N/A",x.presumptiveAchievement?.toFixed(1)??"N/A",x.reporting ? x.diagnosed : "No report",x.reporting ? x.notified : "No report",x.notifiedTarget??"N/A",x.notifiedAchievement?.toFixed(1)??"N/A",x.diagnosticYield?.toFixed(1)??"N/A",x.notificationRate?.toFixed(1)??"N/A",contributionType,lcTargetMonths??"N/A"])];
    const blob=new Blob(["\uFEFF"+lines.map(r=>r.map(esc).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`ARFH_FCT_LC_${contributionType}_${dashboardYear}_${dashboardMonth}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  };

  const dashboardTotals = useMemo(() => {
    const keys = ["attendance", "screened", "presumptive", "evaluated", "diagnosed", "notified", "treatment_started", "hiv_positive", "art", "cpt", "drtb_presumptive", "drtb_evaluated_xpert", "drtb_notified", "drtb_started"];
    const totals = Object.fromEntries(keys.map((key) => [key, 0]));
    visibleRows.forEach((row) => keys.forEach((key) => { totals[key] += Number(row.indicators?.totals?.[key]) || 0; }));
    return totals;
  }, [visibleRows]);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    clearWorkflowState();
  };

  const handlePreview = async () => {
    try {
      resetFeedback();
      setLoadingAction("preview");
      const requestContext = getCurrentRequestContext();
      const data = await postToBackend("/api/preview", requestContext);
      setPreviewData({ ...data, _requestContext: requestContext });

      const previewWarnings = data?.detailed_age_validation?.warnings || [];

      if (previewWarnings.length > 0) {
        const warningText = previewWarnings
          .map((warning, index) => `${index + 1}. ${warning.message || "Validation warning detected."}`)
          .join("\n\n");

        window.alert(
          `Preview loaded with validation warning(s).\n\n${warningText}\n\n` +
            "Please click Validate Totals to review and confirm before upload."
        );

        setSuccessMessage(
          `Preview loaded with ${previewWarnings.length} warning(s). Click Validate Totals to review and confirm.`
        );
      } else {
        setSuccessMessage(data.message || "Preview loaded successfully.");
      }
    } catch (error) {
      setErrorMessage(error.message || "Preview failed.");
    } finally {
      setLoadingAction("");
    }
  };

  const handleValidate = async () => {
    try {
      resetFeedback();
      setLoadingAction("validate");

      const requestContext = getCurrentRequestContext();

      if (previewData?._requestContext && !contextsMatch(previewData._requestContext, requestContext)) {
        throw new Error(
          "The selected State/LGA/Facility/Month/File changed after Preview. Please run Preview Mapping again before validation."
        );
      }

      const data = await postToBackend("/api/validate", requestContext);

      if (data.status === "warning" && Array.isArray(data.warnings) && data.warnings.length > 0) {
        const warningText = data.warnings
          .map((warning, index) => `${index + 1}. ${warning.message || "Notified exceeds Diagnosed."}`)
          .join("\n\n");

        const confirmed = window.confirm(
          `Validation warning\n\n${warningText}\n\n` +
            "This can occur when a person diagnosed in a previous reporting month " +
            "starts treatment in the current month.\n\n" +
            "Have you double-checked the figures and confirmed that they reflect the true program situation?"
        );

        if (confirmed) {
          setValidationData({
            ...data,
            status: "passed",
            warning_confirmed: true,
            _requestContext: requestContext,
          });
          setSuccessMessage(
            "Validation completed. The Notified versus Diagnosed warning was reviewed and confirmed."
          );
        } else {
          setValidationData({
            ...data,
            warning_confirmed: false,
            _requestContext: requestContext,
          });
          setErrorMessage(
            "Validation paused. Please review the Notified and Diagnosed figures, then validate again."
          );
        }
        return;
      }

      setValidationData({ ...data, _requestContext: requestContext });

      if (data.status === "failed") {
        const issueText = Array.isArray(data.issues) ? data.issues.join("\n") : "";
        setErrorMessage(issueText || data.message || "Validation failed.");
      } else {
        setSuccessMessage(data.message || "Validation completed.");
      }
    } catch (error) {
      setErrorMessage(error.message || "Validation failed.");
    } finally {
      setLoadingAction("");
    }
  };

  const handleUpload = async () => {
    try {
      if (!validationPassed) {
        throw new Error("Please run validation successfully before upload.");
      }

      const requestContext = getCurrentRequestContext();

      if (!contextsMatch(validationData?._requestContext, requestContext)) {
        throw new Error(
          "The selected State/LGA/Facility/Month/File changed after validation. Please run Preview Mapping and Validate Totals again before upload."
        );
      }

      const confirmed = window.confirm(
        `Proceed with upload?\n\nReport: ${requestContext.report_type}\nState: ${requestContext.state}\nLGA: ${requestContext.lga}\nFacility/Workflow: ${requestContext.facility_name}\nMonth: ${requestContext.source_month_sheet}\nYear: ${requestContext.report_year}\nTarget tab: ${previewData?.target_tab || requestContext.target_tab}`
      );

      if (!confirmed) return;

      resetFeedback();
      setLoadingAction("upload");

      const data = await postToBackend("/api/upload", requestContext);
      setUploadData(data);
      setSuccessMessage(data.message || "Upload successful.");
      fetchLogs();
    } catch (error) {
      setErrorMessage(error.message || "Upload failed.");
    } finally {
      setLoadingAction("");
    }
  };

  const previewSummary = previewData?.summary || {};
  const summaryEntries = Object.entries(previewSummary);
  const previewTotals = Object.values(previewSummary).map((v) => Number(v) || 0);
  const matchedSections = previewTotals.filter((v) => v > 0).length;
  const totalSections = Object.keys(previewSummary).length || 0;
  const errorCount = validationData?.error_count ?? 0;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-100 px-4 py-8">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
          <div className="grid w-full overflow-hidden rounded-[32px] bg-white shadow-xl lg:grid-cols-[0.95fr_1fr]">
            <section className="bg-[#165693] p-8 text-white md:p-10">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                Secure GF Reporting Portal
              </div>

              <h1 className="max-w-xl text-4xl font-bold leading-tight md:text-5xl">
                ARFH GF Upload Portal
              </h1>

              <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-100">
                Enter the team access password to preview, validate, and upload facility reporting data.
              </p>
            </section>

            <section className="p-8 md:p-10">
              <h2 className="text-3xl font-bold text-slate-900">Team Login</h2>
              <p className="mt-2 text-slate-600">
                Use the access password provided to authorised ARFH users.
              </p>

              <div className="mt-8 space-y-4">
                <input
                  type="password"
                  placeholder="Enter access password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleLogin();
                  }}
                  className={inputClass}
                />

                {loginError && (
                  <div className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {loginError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleLogin}
                  className="w-full rounded-[20px] bg-[#165693] px-6 py-3 text-lg font-semibold text-white transition hover:opacity-95"
                >
                  Login
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-300"
          >
            Logout
          </button>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          <button type="button" onClick={() => setActiveView("upload")} className={`rounded-xl px-5 py-2.5 font-semibold ${activeView === "upload" ? "bg-[#165693] text-white" : "bg-white text-slate-700"}`}>Upload reports</button>
          <button type="button" onClick={() => setActiveView("dashboard")} className={`rounded-xl px-5 py-2.5 font-semibold ${activeView === "dashboard" ? "bg-[#165693] text-white" : "bg-white text-slate-700"}`}>Analytics dashboard</button>
          <button type="button" onClick={() => { setDashboardState("FCT"); setContributionType("Spoke"); setActiveView("lc"); }} className={`rounded-xl px-5 py-2.5 font-semibold ${activeView === "lc" ? "bg-[#165693] text-white" : "bg-white text-slate-700"}`}>LC Performance</button>
        </div>
        {activeView === "lc" ? (
          <section className="space-y-5 rounded-[28px] bg-white p-5 shadow-sm md:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-3xl font-bold text-slate-900">LC Performance Analysis</h2><p className="text-sm text-slate-500">FCT pilot · Spoke contributions only (PMV, community pharmacy, standalone laboratory and TBA/healer). Facility-based activity belongs to Screening Officers.</p></div><button type="button" onClick={fetchPerformance} className={secondaryButtonClass} disabled={performanceLoading}>{performanceLoading?"Loading…":"Refresh data"}</button></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="LGA"><select className={inputClass} value={lcLga} onChange={e=>{setLcLga(e.target.value);setLcSelected("All");}}><option value="All">All FCT LGAs</option>{lcLgas.map(x=><option key={x}>{x}</option>)}</select></Field>
              <Field label="LC contribution basis"><div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">Spoke only · PMV, pharmacy, lab, TBA</div></Field>
              <Field label="LC"><select className={inputClass} value={lcSelected} onChange={e=>setLcSelected(e.target.value)}><option value="All">All LCs</option>{lcRoster.map(x=><option key={x.lc} value={x.lc}>{x.lc}</option>)}</select></Field>
              <Field label="Month"><select className={inputClass} value={dashboardMonth} onChange={e=>setDashboardMonth(e.target.value)}><option value="All">All months</option>{MONTH_OPTIONS.map(x=><option key={x}>{x}</option>)}</select></Field>
              <Field label="Year"><select className={inputClass} value={dashboardYear} onChange={e=>setDashboardYear(e.target.value)}><option value="All">All years</option><option value="2026">2026</option></select></Field>
            </div>
            {contributionType !== "All" && <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">Hub = facility-based; Spoke = PMV + community pharmacy + standalone lab + TBA/healer. Provider-level evaluated, treatment initiation, HIV and ART are not stored, so these cannot be broken down. Excel and PDF exports remain available for All contributions only; use CSV for Hub/Spoke.</p>}
            {missingProviderRows > 0 && contributionType !== "All" && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{missingProviderRows} records lack a complete provider breakdown and are excluded from provider-specific totals. Do not use these figures as complete programme totals.</p>}
            {performanceError && <p className="rounded-xl bg-red-50 p-3 text-red-700">{performanceError}</p>}
            {performanceRows.length >= 1000 && <p className="rounded-xl bg-amber-50 p-3 text-amber-800">Backend 1,000-record limit reached. Results may be incomplete; narrow month and year before comparing LCs.</p>}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <InfoCard title="LCs in selection" value={lcRows.length}/>
              <InfoCard title="Assigned facilities" value={lcRows.reduce((n,x)=>n+x.assigned,0)}/>
              <InfoCard title="Facilities reporting" value={lcRows.reduce((n,x)=>n+x.reporting,0)}/>
              <InfoCard title="Unmatched facility-month records" value={lcUnmatched.length}/>
            </div>
            <div className="rounded-2xl border border-slate-200 p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xl font-bold">Presumptive vs Diagnosed vs Notified</h3><p className="text-xs text-slate-500">Only Spoke contributions are summed across each LC's assigned facilities for the selected period. Facility-based contributions are excluded.</p></div><button className={secondaryButtonClass} type="button" disabled={!lcRows.length||performanceRows.length>=1000} onClick={lcExport}>Download LC CSV</button></div>
              <div className="space-y-4">{lcRows.map(x=>{const max=Math.max(1,...lcRows.map(r=>r.presumptive),...lcRows.map(r=>r.diagnosed),...lcRows.map(r=>r.notified));return <div key={x.lc} className="border-b border-slate-100 pb-3"><div className="mb-2 flex flex-wrap justify-between gap-2 text-sm font-semibold"><span>{x.lc}</span><span className="text-slate-500">{x.reporting}/{x.assigned} facilities reporting</span></div>{x.reporting===0?<p className="text-xs italic text-slate-500">No uploaded report for selected period</p>:[["Presumptive","presumptive","#2563eb"],["Diagnosed","diagnosed","#7c3aed"],["Notified","notified","#059669"]].map(([label,k,color])=><div key={k} className="mb-1 grid grid-cols-[90px_1fr_55px] items-center gap-2 text-xs"><span>{label}</span><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{backgroundColor:color,width:`${x[k]/max*100}%`}}/></div><strong className="text-right">{x[k].toLocaleString()}</strong></div>)}</div>})}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div><h3 className="text-xl font-bold">LC comparison and target achievement</h3><p className="mt-1 text-xs text-slate-500">Monthly LC targets apply to Spoke contributions only · green ≥100%, amber 80–99.9%, red &lt;80% · facility count does not affect achievement.</p></div>
                <label className="text-sm">Sort by <select className="ml-2 rounded-lg border border-slate-200 p-2" value={lcSort} onChange={e=>setLcSort(e.target.value)}>{[["notifiedAchievement","Notification target achievement"],["presumptiveAchievement","Presumptive target achievement"],["notified","Notified count"],["presumptive","Presumptive count"],["diagnosed","Diagnosed count"],["diagnosticYield","Diagnostic yield"],["notificationRate","Notification rate"],["reporting","Facilities reporting"]].map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
              </div>
              {lcTargetMonths === null ? <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Select a specific year to calculate target achievement. "All years" has no defined target denominator.</p> : <p className="mb-3 text-sm text-slate-600">Selected target period: <strong>{lcTargetMonths} month{lcTargetMonths===1?"":"s"}</strong>. {dashboardMonth === "All" ? "All months uses January–December, including months without uploaded reports." : "A single month's target applies."} LCs assigned facilities in more than one LGA have their LGA targets added.</p>}
              <div className="overflow-x-auto"><table className="min-w-full text-left text-sm">
                <thead className="bg-slate-100"><tr>{["LC","LGA","Facilities reporting","Presumptive","Presumptive target achieved","Diagnosed","Notified","Notification target achieved","Diagnostic yield","Notification rate"].map(h=><th key={h} className="whitespace-nowrap px-3 py-3">{h}</th>)}</tr></thead>
                <tbody>{lcRows.map(x=><tr key={x.lc} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-3 font-semibold whitespace-nowrap">{x.lc}</td><td className="px-3 py-3">{x.lgas}</td><td className="px-3 py-3">{x.reporting}/{x.assigned}</td>
                  <td className="px-3 py-3">{x.reporting ? x.presumptive.toLocaleString() : <span className="italic text-slate-400">No report</span>}</td>
                  <td className="px-3 py-3"><LcTargetCell actual={x.presumptive} target={x.presumptiveTarget} hasReport={x.reporting>0}/></td>
                  <td className="px-3 py-3">{x.reporting ? x.diagnosed.toLocaleString() : "—"}</td>
                  <td className="px-3 py-3">{x.reporting ? x.notified.toLocaleString() : "—"}</td>
                  <td className="px-3 py-3"><LcTargetCell actual={x.notified} target={x.notifiedTarget} hasReport={x.reporting>0}/></td>
                  <td className="px-3 py-3">{!x.reporting||x.diagnosticYield===null?"—":`${x.diagnosticYield.toFixed(1)}%`}</td>
                  <td className="px-3 py-3">{!x.reporting||x.notificationRate===null?"—":`${x.notificationRate.toFixed(1)}%`}</td>
                </tr>)}</tbody>
              </table></div>
            </div>
            {lcUnmatched.length>0&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>{lcUnmatched.length} uploaded FCT facility-month record(s) could not be matched to an LC.</strong><p className="mt-1">Review the facility names in the mapping before treating LC totals as complete.</p><div className="mt-2">{[...new Set(lcUnmatched.map(x=>`${x.lga} — ${x.facility_name}`))].slice(0,20).map(x=><p key={x}>{x}</p>)}</div></div>}
            <p className="text-xs text-slate-500">Diagnostic yield = diagnosed / evaluated for All contributions, or diagnosed / presumptive for Hub/Spoke (provider-level evaluated is unavailable); notification rate = notified / diagnosed. Rates are reporting-period ratios, not individual patient follow-up. Facility reporting counts indicate uploaded facilities, not formal reporting completeness across months. Target rankings use the selected calendar period and each LC's LGA targets; facility counts do not affect target achievement. No report means missing uploads, not zero activity.</p>
          </section>
        ) : activeView === "dashboard" ? (

          <section className="space-y-5 rounded-[28px] bg-white p-5 shadow-sm md:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-3xl font-bold text-slate-900">TB Performance Dashboard</h2><p className="mt-1 text-sm text-slate-500">Facility-level records from successful PPM uploads. No estimates or duplicate regimen additions.</p></div>
              <button type="button" onClick={fetchPerformance} disabled={performanceLoading} className={secondaryButtonClass}>{performanceLoading ? "Loading…" : "Refresh data"}</button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Contribution"><select className={inputClass} value={contributionType} onChange={e=>setContributionType(e.target.value)}><option value="All">All contributions</option><option value="Hub">Hub · Facility-based</option><option value="Spoke">Spokes · PMV, pharmacy, lab, TBA</option></select></Field>
              <Field label="State"><select className={inputClass} value={dashboardState} onChange={(e) => setDashboardState(e.target.value)}><option value="All">All states</option>{stateOptions.map((x) => <option key={x} value={x}>{x}</option>)}</select></Field>
              <Field label="Month"><select className={inputClass} value={dashboardMonth} onChange={(e) => setDashboardMonth(e.target.value)}><option value="All">All months</option>{MONTH_OPTIONS.map((x) => <option key={x} value={x}>{x}</option>)}</select></Field>
              <Field label="Year"><select className={inputClass} value={dashboardYear} onChange={(e) => setDashboardYear(e.target.value)}><option value="All">All years</option><option value="2026">2026</option></select></Field>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-semibold text-slate-700">LGA</label>
              <select className="rounded-xl border border-slate-200 bg-white px-4 py-2" value={dashboardLga} onChange={(e) => setDashboardLga(e.target.value)}><option value="All">All LGAs</option>{dashboardLgas.map((name) => <option key={name} value={name}>{name}</option>)}</select>
              <div className="ml-auto flex flex-wrap gap-2">
                <button type="button" disabled={contributionType !== "All" || !visibleRows.length || performanceRows.length >= 1000} onClick={exportExcel} className={secondaryButtonClass}>Download Excel (.xlsx)</button>
                <button type="button" disabled={!visibleRows.length || performanceRows.length >= 1000} onClick={exportCsv} className={secondaryButtonClass}>Download CSV</button>
                <button type="button" disabled={contributionType !== "All" || !visibleRows.length || performanceRows.length >= 1000} onClick={exportPdf} className={primaryButtonClass}>Print / Save PDF</button>
              </div>
            </div>
            {contributionType !== "All" && <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">Hub = facility-based; Spoke = PMV + community pharmacy + standalone lab + TBA/healer. Provider-level evaluated, treatment initiation, HIV and ART are not stored, so these cannot be broken down. Excel and PDF exports remain available for All contributions only; use CSV for Hub/Spoke.</p>}
            {missingProviderRows > 0 && contributionType !== "All" && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{missingProviderRows} records lack a complete provider breakdown and are excluded from provider-specific totals. Do not use these figures as complete programme totals.</p>}
            {performanceError && <p className="rounded-xl bg-red-50 p-3 text-red-700">{performanceError}</p>}
            <p className="text-sm text-slate-500">{visibleRows.length} matching facility-month records ({performanceRows.length} fetched){performanceRows.length === 1000 ? " (backend limit reached: totals may be incomplete; narrow filters)" : ""}. Each facility may appear in multiple months.</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {(contributionType === "All" ? [["Screened", "screened"], ["Presumptive", "presumptive"], ["Evaluated", "evaluated"], ["Diagnosed", "diagnosed"], ["Notified (DS-TB)", "notified"], ["Treatment started (DS-TB)", "treatment_started"], ["HIV positive", "hiv_positive"], ["On ART", "art"]] : [["Screened", "screened"], ["Presumptive", "presumptive"], ["Diagnosed", "diagnosed"], ["Notified (DS-TB)", "notified"]]).map(([label, key]) => <InfoCard key={key} title={label} value={dashboardTotals[key].toLocaleString()} />)}
            </div>
            <div className="rounded-2xl border border-slate-200 p-5">
              <div className="mb-4">
                <h3 className="text-xl font-bold text-slate-900">TB Performance Summary</h3>
                <p className="mt-1 text-sm text-slate-500">Rates calculated from the selected reporting records. A missing denominator displays N/A.</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Presumptive yield", "presumptive", "screened", "#2563eb"],
                  ...(contributionType === "All" ? [["Evaluation coverage", "evaluated", "presumptive", "#059669"]] : []),
                  [contributionType === "All" ? "Diagnostic yield" : "Diagnosed / presumptive", "diagnosed", contributionType === "All" ? "evaluated" : "presumptive", "#7c3aed"],
                  ...(contributionType === "All" ? [["Treatment initiation", "treatment_started", "notified", "#0891b2"]] : []),
                ].map(([label, numeratorKey, denominatorKey, barColor]) => {
                  const numerator = dashboardTotals[numeratorKey];
                  const denominator = dashboardTotals[denominatorKey];
                  const rate = denominator > 0 ? (numerator / denominator) * 100 : null;
                  return (
                    <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                      <p className="mt-2 text-3xl font-bold text-slate-900">{rate === null ? "N/A" : `${rate.toFixed(1)}%`}</p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${rate === null ? 0 : Math.min(100, Math.max(0, rate))}%`, backgroundColor: barColor }} />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">{numerator.toLocaleString()} / {denominator.toLocaleString()} reported</p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-slate-500">These ratios compare counts within the selected reporting period; they do not establish that the same patients moved through each stage. Colours distinguish indicators, not performance ratings.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <h3 className="mb-4 text-xl font-bold">TB service cascade</h3>
              {(contributionType === "All" ? [["Screened", "screened"], ["Presumptive", "presumptive"], ["Evaluated", "evaluated"], ["Diagnosed", "diagnosed"], ["Notified", "notified"], ["Treatment started", "treatment_started"]] : [["Screened", "screened"], ["Presumptive", "presumptive"], ["Diagnosed", "diagnosed"], ["Notified", "notified"]]).map(([label, key]) => (
                <div key={key} className="mb-3 grid grid-cols-[110px_1fr_65px] items-center gap-3 text-sm"><span>{label}</span><div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#165693]" style={{width: `${dashboardTotals.screened > 0 ? Math.min(100, dashboardTotals[key] / dashboardTotals.screened * 100) : 0}%`}} /></div><strong className="text-right">{dashboardTotals[key].toLocaleString()}</strong></div>
              ))}
            </div>
            <div className="rounded-2xl border border-slate-200 p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-xl font-bold text-slate-900">Monthly reporting trends</h3><p className="text-sm text-slate-500">Hover over a bar for its value. Months without uploaded records are marked as missing.</p></div><select aria-label="Trend indicator" className="rounded-xl border border-slate-200 px-4 py-2" value={chartMetric} onChange={(e) => setChartMetric(e.target.value)}>{(contributionType === "All" ? [["Notified", "notified"], ["Screened", "screened"], ["Presumptive", "presumptive"], ["Diagnosed", "diagnosed"], ["Treatment started", "treatment_started"], ["DRTB notified", "drtb_notified"]] : [["Notified", "notified"], ["Screened", "screened"], ["Presumptive", "presumptive"], ["Diagnosed", "diagnosed"], ["DRTB notified", "drtb_notified"]]).map(([label,key])=><option key={key} value={key}>{label}</option>)}</select></div>
              <div className="flex h-56 items-end gap-2 border-b border-slate-200 pb-1">{monthlySeries.map((point,i)=>{const max=Math.max(1,...monthlySeries.map(p=>p.count));const reported=visibleRows.some(r=>r.report_month===MONTH_OPTIONS[i]||r.report_month===point.month);return <div key={i} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${point.month}: ${reported ? point.count.toLocaleString() : "No uploaded report"}`}><span className="text-xs font-semibold text-slate-700 opacity-0 transition group-hover:opacity-100">{reported ? point.count.toLocaleString() : "No data"}</span><div className="w-full max-w-16 rounded-t-lg bg-[#165693] transition hover:bg-sky-500" style={{height:`${reported ? Math.max(point.count?5:1,point.count/max*88) : 0}%`}} role="img" aria-label={`${point.month}: ${reported ? point.count : "No report"}`} /><span className="text-[11px] text-slate-500">{point.month}</span></div>})}</div>
              <p className="mt-3 text-xs text-slate-500">Data represents uploaded facility-month records, not projected activity.</p>
            </div>
            <div><h3 className="mb-3 text-xl font-bold">Drug-resistant TB</h3><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{(contributionType === "All" ? [["DRTB presumptive", "drtb_presumptive"], ["DRTB evaluated by Xpert", "drtb_evaluated_xpert"], ["RR/MDR-TB notified", "drtb_notified"], ["RR/MDR-TB started", "drtb_started"]] : [["DRTB presumptive", "drtb_presumptive"], ["RR/MDR-TB notified", "drtb_notified"], ["RR/MDR-TB started", "drtb_started"]]).map(([label, key]) => <InfoCard key={key} title={label} value={dashboardTotals[key].toLocaleString()} />)}</div></div>
            <div><h3 className="mb-3 text-xl font-bold">Facility performance</h3><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-100"><tr>{["State", "LGA", "Facility", "Month", "Screened", "Diagnosed", "Notified", "DRTB notified"].map((x) => <th key={x} className="whitespace-nowrap px-3 py-3">{x}</th>)}</tr></thead><tbody>{visibleRows.map((r, i) => <tr key={`${r.state}-${r.lga}-${r.facility_name}-${r.report_year}-${r.report_month}-${i}`} className="border-b border-slate-100"><td className="px-3 py-2">{r.state}</td><td className="px-3 py-2">{r.lga}</td><td className="px-3 py-2">{r.facility_name}</td><td className="px-3 py-2">{r.report_month} {r.report_year}</td>{["screened", "diagnosed", "notified", "drtb_notified"].map((key) => <td key={key} className="px-3 py-2">{Number(r.indicators?.totals?.[key] || 0).toLocaleString()}</td>)}</tr>)}</tbody></table>{!visibleRows.length && !performanceLoading && <p className="p-4 text-slate-500">No performance records found for the selected filters.</p>}</div></div>
          </section>
        ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.2fr]">
          <section className="rounded-[28px] bg-[#165693] p-6 text-white shadow-lg">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              GF Reporting Workflow
            </div>

            <h1 className="max-w-xl text-4xl font-bold leading-tight md:text-5xl">
              Upload, validate, and update facility data with confidence.
            </h1>

            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-100">
              Pilot-safe ARFH reporting portal with PPM and Community PMTCT upload workflows.
            </p>
          </section>

          <section className="space-y-6">
            <div className="rounded-[28px] bg-white p-6 shadow-sm">
              <h2 className="text-3xl font-bold text-slate-900">Upload GF Report</h2>
              <p className="mt-2 text-base leading-relaxed text-slate-600">
                Select the facility details, attach the source Excel report, preview, validate, then upload.
              </p>

              <div className="mt-6 grid grid-cols-1 gap-5">
                <Field label="Report Type">
                  <select
                    value={reportType}
                    onChange={(e) => {
                      setReportType(e.target.value);
                      clearWorkflowState();
                    }}
                    className={inputClass}
                  >
                    <option value={REPORT_TYPES.PPM}>PPM ETL Upload</option>
                    <option value={REPORT_TYPES.PMTCT}>Community PMTCT Upload</option>
                  </select>
                </Field>

                <Field label="State">
                  <select
                    value={stateValue}
                    onChange={(e) => {
                      setStateValue(e.target.value);
                      setFacilitySearch("");
                      clearWorkflowState();
                    }}
                    className={inputClass}
                  >
                    {stateOptions.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </Field>

                <Field label="LGA">
                  <select
                    value={lga}
                    onChange={(e) => {
                      setLga(e.target.value);
                      setFacilitySearch("");
                      clearWorkflowState();
                    }}
                    className={inputClass}
                  >
                    {lgaOptions.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </Field>

                {!isPmtct && (
                  <>
                    <Field label="Facility Search">
                      <input
                        type="text"
                        placeholder="Type facility name to filter..."
                        value={facilitySearch}
                        onChange={(e) => setFacilitySearch(e.target.value)}
                        className={inputClass}
                      />
                    </Field>

                    <Field label="Facility">
                      <select
                        value={facility}
                        onChange={(e) => {
                          setFacility(e.target.value);
                          clearWorkflowState();
                        }}
                        className={inputClass}
                      >
                        {filteredFacilities.map((item) => (
                          <option key={item} value={item}>{item}</option>
                        ))}
                      </select>
                    </Field>
                  </>
                )}

                {isPmtct && (
                  <div className="rounded-[20px] border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    Community PMTCT upload reads all community/TBA rows in the uploaded Excel file,
                    matches existing names in the master sheet, and creates new rows where needed.
                  </div>
                )}

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <Field label="Year">
                    <select
                      value={year}
                      onChange={(e) => {
                        setYear(e.target.value);
                        clearWorkflowState();
                      }}
                      className={inputClass}
                    >
                      <option value="2026">2026</option>
                    </select>
                  </Field>

                  <Field label="Reporting Month">
                    <select
                      value={month}
                      onChange={(e) => {
                        setMonth(e.target.value);
                        clearWorkflowState();
                      }}
                      className={inputClass}
                    >
                      {MONTH_OPTIONS.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Source Excel File">
                  <div className="flex flex-col gap-3 rounded-[22px] border border-dashed border-slate-300 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="truncate text-base text-slate-500">
                      {file?.name || "No file selected"}
                    </div>
                    <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl bg-[#09163b] px-6 py-3 text-base font-semibold text-white">
                      Browse
                      <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
                    </label>
                  </div>
                </Field>

                {errorMessage && (
                  <div className="whitespace-pre-line rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700">
                    {errorMessage}
                  </div>
                )}

                {successMessage && (
                  <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-base text-emerald-700">
                    {successMessage}
                  </div>
                )}

                {uploadData?.facility_name &&
                  !isPmtct &&
                  uploadData.facility_name !== facility && (
                    <div className="rounded-[20px] border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
                      Safety check: backend returned facility "{uploadData.facility_name}" while the currently selected facility is "{facility}".
                      Stop further uploads and re-run Preview and Validate.
                    </div>
                  )}

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <button type="button" onClick={handlePreview} disabled={loadingAction !== ""} className={secondaryButtonClass}>
                    {loadingAction === "preview" ? "Loading preview..." : "Preview Mapping"}
                  </button>

                  <button type="button" onClick={handleValidate} disabled={loadingAction !== ""} className={warningButtonClass}>
                    {loadingAction === "validate" ? "Validating..." : "Validate Totals"}
                  </button>

                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={loadingAction !== "" || !validationPassed}
                    className={`${primaryButtonClass} ${!validationPassed ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {loadingAction === "upload" ? "Uploading..." : "Upload"}
                  </button>
                </div>

                {!validationPassed && (
                  <div className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Upload is locked until validation passes.
                  </div>
                )}
              </div>
            </div>

            {previewData && (
              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-3xl font-bold text-slate-900">Preview results</h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">Preview v2</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      Report: {reportType} · Target tab: {previewData.target_tab || "N/A"} · Row:{" "}
                      {previewData.matched_target_row ?? previewData.matched_rows ?? "Multiple"}
                    </p>
                  </div>
                  <span className="inline-flex w-fit rounded-full bg-blue-100 px-4 py-1.5 text-sm font-semibold text-blue-700">
                    Preview loaded
                  </span>
                </div>

                <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <InfoCard title="Total Sections" value={totalSections} />
                  <InfoCard title="Matched Sections" value={matchedSections} />
                  <InfoCard title="Errors" value={errorCount} />
                </div>

                {summaryEntries.length > 0 && (
                  <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-5">
                    {summaryEntries.slice(0, 10).map(([key, value]) => (
                      <InfoCard key={key} title={formatSummaryTitle(key)} value={value ?? 0} />
                    ))}
                  </div>
                )}

                {isPmtct && previewData.new_rows_created !== undefined && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <InfoCard title="Matched Existing Rows" value={previewData.matched_rows ?? 0} />
                    <InfoCard title="New Rows Created" value={previewData.new_rows_created ?? 0} />
                    <InfoCard title="Prepared Updates" value={previewData.prepared_updates ?? 0} />
                  </div>
                )}

                {!isPmtct && previewData.new_indicators_preview && (
                  <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                    <h4 className="text-xl font-bold text-slate-900">New DSTB / DRTB Indicators</h4>
                    <p className="mt-1 text-sm text-slate-600">Values extracted from the uploaded ETL before upload.</p>

                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                      <PreviewValue label="Currently receiving treatment" value={previewData.new_indicators_preview.currently_receiving_treatment} />
                      <PreviewValue label="Referred to public/other facilities" value={previewData.new_indicators_preview.referred_public_other} />
                      <PreviewValue label="DRTB presumptive – Total" value={previewData.new_indicators_preview.drtb_presumptive_total} />
                      <PreviewValue label="DRTB evaluated by Xpert" value={previewData.new_indicators_preview.drtb_evaluated_xpert} />
                      <PreviewValue label="RR/MDR-TB notified – Total" value={previewData.new_indicators_preview.drtb_notified_total} />
                      <PreviewValue label="RR/MDR-TB started treatment – Total" value={previewData.new_indicators_preview.drtb_started_total} />
                    </div>

                    <CompactValues
                      title="DRTB presumptive by referral source"
                      values={previewData.new_indicators_preview.drtb_presumptive}
                    />
                    <CompactValues
                      title="RR/MDR-TB notified by referral source"
                      values={previewData.new_indicators_preview.drtb_notified}
                    />
                    <CompactValues
                      title="RR/MDR-TB started treatment by referral source"
                      values={previewData.new_indicators_preview.drtb_started}
                    />
                    <CompactValues
                      title="DRTB regimen (23.1–23.9)"
                      values={previewData.new_indicators_preview.drtb_regimens}
                    />
                  </div>
                )}

                {!isPmtct && previewData.contact_investigation && (
                  <div className="mt-6 rounded-[24px] border border-blue-200 bg-blue-50 p-5">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h4 className="text-xl font-bold text-slate-900">DSTB Contact Investigation</h4>
                        <p className="mt-1 text-sm text-slate-600">
                          {previewData.contact_investigation.target_tab || "N/A"} · Row {previewData.contact_investigation.matched_target_row ?? "N/A"}
                        </p>
                      </div>
                      <span className="inline-flex w-fit rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">Ready</span>
                    </div>

                    {previewData.contact_investigation.values && (
                      <div className="mt-4 overflow-x-auto rounded-[18px] border border-blue-100 bg-white">
                        <table className="min-w-full text-left text-sm">
                          <thead className="bg-slate-50 text-slate-500">
                            <tr>
                              <th className="px-4 py-3">Indicator</th>
                              <th className="px-3 py-3">Male U-5</th>
                              <th className="px-3 py-3">Male 5+</th>
                              <th className="px-3 py-3">Female U-5</th>
                              <th className="px-3 py-3">Female 5+</th>
                              <th className="px-3 py-3 font-semibold">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              ["Index TB cases", "index_cases"],
                              ["Bacteriological index cases", "bact_index_cases"],
                              ["Bacteriological index cases traced", "bact_index_traced"],
                              ["Contacts identified", "contacts_identified"],
                              ["Contacts screened", "contacts_screened"],
                              ["Presumptive contacts", "presumptive_contacts"],
                              ["Presumptive contacts evaluated", "evaluated_contacts"],
                              ["Contacts diagnosed with TB", "diagnosed_contacts"],
                              ["Diagnosed contacts started treatment", "treated_contacts"],
                              ["Total eligible for TPT", "__total_tpt_eligible"],
                              ["Total placed on TPT", "__total_tpt_placed"],
                            ].map(([label, key]) => {
                              const values = previewData.contact_investigation.values;
                              let v = values[key] || {};

                              if (key === "__total_tpt_eligible") {
                                // Display-only preview: a presumptive contact is not removed from
                                // TPT eligibility merely for being presumptive. Only contacts
                                // diagnosed with active TB are excluded here.
                                const screened = values.contacts_screened || {};
                                const diagnosed = values.diagnosed_contacts || {};
                                v = {
                                  male_u5: Math.max(0, (Number(screened.male_u5) || 0) - (Number(diagnosed.male_u5) || 0)),
                                  male_5_plus: Math.max(0, (Number(screened.male_5_plus) || 0) - (Number(diagnosed.male_5_plus) || 0)),
                                  female_u5: Math.max(0, (Number(screened.female_u5) || 0) - (Number(diagnosed.female_u5) || 0)),
                                  female_5_plus: Math.max(0, (Number(screened.female_5_plus) || 0) - (Number(diagnosed.female_5_plus) || 0)),
                                  total: Math.max(0, (Number(screened.total) || 0) - (Number(diagnosed.total) || 0)),
                                };
                              }

                              if (key === "__total_tpt_placed") {
                                const regimenKeys = [
                                  ["tpt_1hp_u5", "tpt_1hp_ge5"],
                                  ["tpt_3hp_u5", "tpt_3hp_ge5"],
                                  ["tpt_3hr_u5", "tpt_3hr_ge5"],
                                  ["tpt_6h_u5", "tpt_6h_ge5"],
                                ];
                                v = regimenKeys.reduce(
                                  (acc, [u5Key, ge5Key]) => {
                                    const u5 = values[u5Key] || {};
                                    const ge5 = values[ge5Key] || {};
                                    acc.male_u5 += Number(u5.male) || 0;
                                    acc.male_5_plus += Number(ge5.male) || 0;
                                    acc.female_u5 += Number(u5.female) || 0;
                                    acc.female_5_plus += Number(ge5.female) || 0;
                                    acc.total += (Number(u5.total) || 0) + (Number(ge5.total) || 0);
                                    return acc;
                                  },
                                  { male_u5: 0, male_5_plus: 0, female_u5: 0, female_5_plus: 0, total: 0 }
                                );
                              }
                              return (
                                <tr key={key} className="border-t border-slate-100">
                                  <td className="px-4 py-2.5 font-medium text-slate-700">{label}</td>
                                  <td className="px-3 py-2.5">{v.male_u5 ?? 0}</td>
                                  <td className="px-3 py-2.5">{v.male_5_plus ?? 0}</td>
                                  <td className="px-3 py-2.5">{v.female_u5 ?? 0}</td>
                                  <td className="px-3 py-2.5">{v.female_5_plus ?? 0}</td>
                                  <td className="px-3 py-2.5 font-bold">{v.total ?? 0}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                  </div>
                )}
              </div>
            )}

            {validationData && (
              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-2xl font-bold text-slate-900">Validation summary</h3>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
                  <InfoCard title="Status" value={validationData.status || "N/A"} />
                  <InfoCard title="Sheet Checked" value={validationData.sheet_checked || "N/A"} />
                  <InfoCard title="Errors" value={validationData.error_count ?? 0} />
                  <InfoCard
                    title={isPmtct ? "Matched Rows" : "Matched Row"}
                    value={validationData.matched_rows ?? validationData.matched_target_row ?? "N/A"}
                  />
                </div>
              </div>
            )}

            {uploadData && (
              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-2xl font-bold text-slate-900">Upload summary</h3>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
                  <InfoCard title="Status" value={uploadData.status || "N/A"} />
                  <InfoCard title="Target Tab" value={uploadData.target_tab || "N/A"} />
                  <InfoCard
                    title={isPmtct ? "Matched Rows" : "Matched Row"}
                    value={uploadData.matched_rows ?? uploadData.matched_target_row ?? "N/A"}
                  />
                  <InfoCard title="Updated Cells/Ranges" value={uploadData.updated_cells ?? 0} />
                </div>
              </div>
            )}

            <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-2xl font-bold text-slate-900">Recent upload logs</h3>
                <button onClick={fetchLogs} className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
                  Refresh
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-4">Facility</th>
                      <th className="py-2 pr-4">Month</th>
                      <th className="py-2 pr-4">Tab</th>
                      <th className="py-2 pr-4">Row</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Updated Cells</th>
                      <th className="py-2 pr-4">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadLogs.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="py-4 text-slate-500">No upload logs yet.</td>
                      </tr>
                    ) : (
                      uploadLogs.map((log) => (
                        <tr key={log.id} className="border-b border-slate-100">
                          <td className="py-2 pr-4">{log.facility_name}</td>
                          <td className="py-2 pr-4">{log.report_month}</td>
                          <td className="py-2 pr-4">{log.target_tab}</td>
                          <td className="py-2 pr-4">{log.matched_row}</td>
                          <td className="py-2 pr-4">{log.status}</td>
                          <td className="py-2 pr-4">{log.updated_cells}</td>
                          <td className="py-2 pr-4">{log.created_at}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-2.5 block text-base font-semibold text-slate-800">{label}</label>
      {children}
    </div>
  );
}

function InfoCard({ title, value }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{String(value)}</p>
    </div>
  );
}

function PreviewValue({ label, value }) {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value ?? 0}</p>
    </div>
  );
}

function CompactValues({ title, values }) {
  if (!values) return null;
  return (
    <div className="mt-4 rounded-[18px] border border-slate-200 bg-white px-4 py-3">
      <p className="mb-2 text-sm font-semibold text-slate-700">{title}</p>
      <div className="flex flex-wrap gap-2">
        {Object.entries(values).map(([key, value]) => (
          <span key={key} className="rounded-xl bg-slate-100 px-3 py-1.5 text-sm text-slate-700">
            {formatSummaryTitle(key)}: <strong>{value ?? 0}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function formatSummaryTitle(key) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

const inputClass =
  "w-full rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-blue-100";

const primaryButtonClass =
  "rounded-[20px] bg-[#165693] px-6 py-3 text-lg font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButtonClass =
  "rounded-[20px] bg-slate-200 px-6 py-3 text-lg font-semibold text-slate-800 transition hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-50";

const warningButtonClass =
  "rounded-[20px] bg-amber-200 px-6 py-3 text-lg font-semibold text-amber-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50";


// Dependency-free, standards-compliant XLSX writer (ZIP store method + SpreadsheetML).
// All string cells are inline strings, preventing formula injection in downloaded reports.
function downloadReportBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function makeExcelWorkbook(sheets) {
  const enc = new TextEncoder();
  const xml = v => String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
  const colName = n => {let s="";for(let i=n+1;i>0;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;};
  const worksheet = rows => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="16"/><sheetData>${rows.map((row,i)=>`<row r="${i+1}">${row.map((v,j)=>{if(v===null||v===undefined||v==="")return "";const ref=`${colName(j)}${i+1}`;return typeof v==="number"&&Number.isFinite(v)?`<c r="${ref}"><v>${v}</v></c>`:`<c r="${ref}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`;}).join("")}</row>`).join("")}</sheetData></worksheet>`;
  const entries = [
    ["[Content_Types].xml",`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels",`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml",`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join("")}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels",`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join("")}</Relationships>`],
    ...sheets.map((s,i)=>[`xl/worksheets/sheet${i+1}.xml`,worksheet(s.rows)])
  ];
  const table = new Uint32Array(256);
  for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[i]=c>>>0;}
  const crc32 = data => {let c=0xffffffff;for(const b of data)c=table[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
  const u16 = n => [n&255,(n>>>8)&255];
  const u32 = n => [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];
  const parts=[],central=[];let offset=0;
  for(const [path,content] of entries){
    const name=enc.encode(path),data=enc.encode(content),crc=crc32(data);
    const local=new Uint8Array([80,75,3,4,...u16(20),...u16(0x800),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0)]);
    parts.push(local,name,data);
    central.push(new Uint8Array([80,75,1,2,...u16(20),...u16(20),...u16(0x800),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset)]),name);
    offset+=local.length+name.length+data.length;
  }
  const centralSize=central.reduce((n,p)=>n+p.length,0);
  const end=new Uint8Array([80,75,5,6,...u16(0),...u16(0),...u16(entries.length),...u16(entries.length),...u32(centralSize),...u32(offset),...u16(0)]);
  return new Blob([...parts,...central,end],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
