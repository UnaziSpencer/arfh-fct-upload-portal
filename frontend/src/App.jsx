import { useEffect, useMemo, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://arfh-fct-upload-portal.onrender.com";
const PASSWORD_STORAGE_KEY = "arfh_app_password";

const REPORT_TYPES = {
  PPM: "PPM ETL Upload",
  PMTCT: "Community PMTCT Upload",
};

const FACILITY_MAPPING = {
  Abaji: ["Ni'ma Clinic", "St Peter Hospital"],
  AMAC: [
    "ECWA Comprehensive Clinic",
    "Jikwoyi Medical Center",
    "Sisters of Nativity Hospital Jikwoyi",
    "Freedom Scan Medical Centre",
    "Pan-Raf Hospital",
    "Danfers Hospital Pyakasa",
    "Massan Clinic Lugbe",
    "Medical Missionaries of Mary Aco, Lugbe",
    "Divine Reign Ultimate Hosp. Sauka",
    "Ralph Clinic Bassan Jiwa",
    "Sabo Clinic Bassan Jiwa",
    "Yabisam Hospital",
    "Daniel David Clinic and Maternity",
    "Excel Hospital",
    "Lona Hospital",
    "Wristberg Hospital",
    "Faith Mediplex Karmo",
    "Gopher Ark Hospital Ltd Life Camp",
    "De Mary's Central Hospital FHA",
    "Access Hospital Gwagwa",
    "Consolation Clinic and Maternity Jiwa",
    "Cornelian Maternity and Rural Health-Gidan Mangoro",
    "Cream Medics",
    "God'S Time Hospital Gwagwa",
    "Success Clinic and Maternity",
    "The Crown Hospital Gwagwa",
    "Get Well Hospital Tasha I",
    "Ngoziben Clinic and Maternity Jiwa",
    "Una Clinic",
    "Garki Hospital Abuja",
    "Gem of Hope Medical Centre",
    "Queens Clinic And Maternity",
    "Good Morning Maternity Hospital Apo",
    "Joyland Medical Centre and Children Hospital Dakwo",
    "Rouz Hospital and Maternity Apo",
    "AIDS Health Foundation",
    "Sahad Hospitals",
    "Surgicare Hospital",
    "iMAF Hospital and Maternity",
    "Medimore Hospital",
    "Medford Hospital",
    "Al-Nun Maternity Home Iddo",
    "Arewa Specialist Hospital and Diagnostics",
    "Bethel Clinic and Maternity Iddo",
    "Biocycle Clinic",
    "Ebelechukwu Clinic and Maternity Kabusa",
    "Ganzawo Clinic and Maternity",
    "Helping Hand Clinic",
    "Hospimed Clinic and Maternity",
    "International Organization for Migration (IOM)",
    "Kapital Hospital",
    "Kemas Global Clinic",
    "Lofahad Clinic and Maternity",
    "Meavour Clinic",
    "Nobel Hope Karmo",
    "Olive Hospital and Maternity",
    "Paafag Clinic and Maternity",
    "Saffron Hospital",
    "Sophy Hospital and Maternity",
    "Standard Medical Centre",
    "Taimako Clinic",
    "The Comforter Hospital",
    "Tolbert Specialist Hospital Gaduwa",
    "Evangelical Church of West Africa (ECWA) Health Clinic - Kabusa",
    "Guzape Police Clinic",
    "Zadawura Nursing Home",
  ],
  Bwari: [
    "Express Hospital",
    "VINCA HOSPITAL",
    "Anglican Hospital",
    "Unity Clinic and Maternity",
    "Jalel Bio Clinicals",
    "Omega Hospital",
    "Dawaki Medical Centre",
    "Royal Lords Clinic and Maternity",
    "Daughters of Charity (DOC) Hospital Kubwa",
    "Gabic Divine Clinic and Maternity",
    "Our Lady of Fatima Hospital",
    "Summit Hospital",
    "New Care Hospital and Maternity",
  ],
  Gwagwalada: [
    "Divine Clinic and Maternity",
    "Gonita Clinic and Maternity",
    "Jerab Hospital",
    "Primecare Hospital (Formerly Mummen Hospital)",
    "St Mary Catholic Hospital",
    "Ehibachi Clinic and Maternity",
    "Hope Clinic and Maternity",
    "Minat Hospital",
    "Nasara Hospital",
    "Ojochugun Health Clinic",
  ],
  Kuje: ["Alfa Hospital", "Gede Clinic", "Ila Hospital", "Whitedove Hospital"],
  Kwali: ["Abufati Maternity", "Heti Hospital", "Rhema Hospital", "Wisdom Clinic and Maternity"],
};

const MONTH_OPTIONS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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

  const isPmtct = reportType === REPORT_TYPES.PMTCT;

  const lgaOptions = useMemo(() => Object.keys(FACILITY_MAPPING), []);
  const facilityOptions = useMemo(() => FACILITY_MAPPING[lga] || [], [lga]);

  const filteredFacilities = useMemo(() => {
    if (!facilitySearch.trim()) return facilityOptions;
    return facilityOptions.filter((item) =>
      item.toLowerCase().includes(facilitySearch.toLowerCase())
    );
  }, [facilityOptions, facilitySearch]);

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
  }, [reportType, month, year, lga, facility]);

  const validationPassed = validationData?.status === "passed";

  const resetFeedback = () => {
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

  const buildFormData = () => {
    if (!file) throw new Error("Please choose an Excel file first.");
    if (!isPmtct && !facility) throw new Error("Please select a facility.");

    const formData = new FormData();
    formData.append("facility_name", isPmtct ? "Community PMTCT Cascade" : facility);
    formData.append("lga", lga);
    formData.append("state", stateValue);
    formData.append("report_year", year);
    formData.append("source_month_sheet", month);
    formData.append("target_tab", month);
    formData.append("report_type", reportType);
    formData.append(
      "spreadsheet_name",
      isPmtct ? "Community PMTCT reporting template" : "FCT PPM Indicator reporting template"
    );
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

  const postToBackend = async (endpoint) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: buildFormData(),
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

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    setPreviewData(null);
    setValidationData(null);
    setUploadData(null);
    resetFeedback();
  };

  const handlePreview = async () => {
    try {
      resetFeedback();
      setLoadingAction("preview");
      const data = await postToBackend("/api/preview");
      setPreviewData(data);
      setSuccessMessage(data.message || "Preview loaded successfully.");
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
      const data = await postToBackend("/api/validate");

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
          });
          setSuccessMessage(
            "Validation completed. The Notified versus Diagnosed warning was reviewed and confirmed."
          );
        } else {
          setValidationData({
            ...data,
            warning_confirmed: false,
          });
          setErrorMessage(
            "Validation paused. Please review the Notified and Diagnosed figures, then validate again."
          );
        }
        return;
      }

      setValidationData(data);

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

      const confirmed = window.confirm(
        `Proceed with upload?\n\nReport: ${reportType}\nLGA: ${lga}\nFacility/Workflow: ${
          isPmtct ? "Community PMTCT Cascade" : facility
        }\nMonth: ${month}\nYear: ${year}\nTarget tab: ${previewData?.target_tab || month}`
      );

      if (!confirmed) return;

      resetFeedback();
      setLoadingAction("upload");

      const data = await postToBackend("/api/upload");
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
                ARFH FCT Upload Portal
              </h1>

              <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-100">
                Enter the team access password to preview, validate, and upload facility reporting data.
              </p>
            </section>

            <section className="p-8 md:p-10">
              <h2 className="text-3xl font-bold text-slate-900">Team Login</h2>
              <p className="mt-2 text-slate-600">
                Use the access password provided to authorised ARFH FCT users.
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
                  <select value={reportType} onChange={(e) => setReportType(e.target.value)} className={inputClass}>
                    <option value={REPORT_TYPES.PPM}>PPM ETL Upload</option>
                    <option value={REPORT_TYPES.PMTCT}>Community PMTCT Upload</option>
                  </select>
                </Field>

                <Field label="State">
                  <select value={stateValue} onChange={(e) => setStateValue(e.target.value)} className={inputClass}>
                    <option>FCT</option>
                  </select>
                </Field>

                <Field label="LGA">
                  <select value={lga} onChange={(e) => { setLga(e.target.value); setFacilitySearch(""); }} className={inputClass}>
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
                      <select value={facility} onChange={(e) => setFacility(e.target.value)} className={inputClass}>
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
                    <select value={year} onChange={(e) => setYear(e.target.value)} className={inputClass}>
                      <option value="2026">2026</option>
                    </select>
                  </Field>

                  <Field label="Reporting Month">
                    <select value={month} onChange={(e) => setMonth(e.target.value)} className={inputClass}>
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
                    <h3 className="text-3xl font-bold text-slate-900">Preview results</h3>
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
