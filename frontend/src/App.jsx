import { useEffect, useMemo, useState } from "react";
import facilities from "./data";

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
                                const u5 = values.tpt_eligible_u5 || {};
                                const ge5 = values.tpt_eligible_ge5 || {};
                                v = {
                                  male_u5: u5.male ?? 0,
                                  male_5_plus: ge5.male ?? 0,
                                  female_u5: u5.female ?? 0,
                                  female_5_plus: ge5.female ?? 0,
                                  total: (Number(u5.total) || 0) + (Number(ge5.total) || 0),
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
