import { useEffect, useMemo, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://arfh-fct-upload-portal.onrender.com";

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
  const [stateValue, setStateValue] = useState("FCT");
  const [lga, setLga] = useState("AMAC");
  const [facilitySearch, setFacilitySearch] = useState("");
  const [facility, setFacility] = useState("Jikwoyi Medical Center");
  const [year, setYear] = useState("2026");
  const [month, setMonth] = useState("March");
  const [reportType, setReportType] = useState("PPM ETL Upload");
  const [file, setFile] = useState(null);

  const [loadingAction, setLoadingAction] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [previewData, setPreviewData] = useState(null);
  const [validationData, setValidationData] = useState(null);
  const [uploadData, setUploadData] = useState(null);
  const [uploadLogs, setUploadLogs] = useState([]);

  const lgaOptions = useMemo(() => Object.keys(FACILITY_MAPPING), []);
  const facilityOptions = useMemo(() => FACILITY_MAPPING[lga] || [], [lga]);

  const filteredFacilities = useMemo(() => {
    if (!facilitySearch.trim()) return facilityOptions;
    return facilityOptions.filter((item) =>
      item.toLowerCase().includes(facilitySearch.toLowerCase())
    );
  }, [facilityOptions, facilitySearch]);

  useEffect(() => {
    if (!facilityOptions.includes(facility)) {
      setFacility(facilityOptions[0] || "");
    }
  }, [facilityOptions, facility]);

  useEffect(() => {
    fetchLogs();
  }, []);

  const validationPassed = validationData?.status === "passed";

  const resetFeedback = () => {
    setErrorMessage("");
    setSuccessMessage("");
  };

  const buildFormData = () => {
    if (!file) throw new Error("Please choose an Excel file first.");
    if (!facility) throw new Error("Please select a facility.");

    const formData = new FormData();
    formData.append("facility_name", facility);
    formData.append("lga", lga);
    formData.append("state", stateValue);
    formData.append("report_year", year);
    formData.append("source_month_sheet", month);
    formData.append("target_tab", month);
    formData.append("report_type", reportType);
    formData.append("spreadsheet_name", "FCT PPM Indicator reporting template");
    formData.append("file", file);
    return formData;
  };

  const postToBackend = async (endpoint) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: "POST",
      body: buildFormData(),
    });

    const data = await response.json();

    if (!response.ok) {
      let message = `Request failed with status ${response.status}`;
      if (typeof data.detail === "string") message = data.detail;
      else if (typeof data.message === "string") message = data.message;
      throw new Error(message);
    }

    return data;
  };

  const fetchLogs = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/upload-logs`);
      const data = await response.json();
      setUploadLogs(data.logs || []);
    } catch {
      // ignore logs fetch errors for now
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
      setValidationData(data);
      setSuccessMessage(data.message || "Validation completed.");
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
        `Proceed with upload?\n\nFacility: ${facility}\nMonth: ${month}\nYear: ${year}\nTarget tab: ${previewData?.target_tab || month}`
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
  const previewTotals = Object.values(previewSummary).map((v) => Number(v) || 0);
  const matchedSections = previewTotals.filter((v) => v > 0).length;
  const totalSections = Object.keys(previewSummary).length || 0;
  const errorCount = 0;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
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
              Pilot-safe ARFH reporting portal with preview, validation, controlled upload, and upload logs.
            </p>
          </section>

          <section className="space-y-6">
            <div className="rounded-[28px] bg-white p-6 shadow-sm">
              <h2 className="text-3xl font-bold text-slate-900">Upload GF Report</h2>
              <p className="mt-2 text-base leading-relaxed text-slate-600">
                Select the facility details, attach the source Excel report, preview, validate, then upload.
              </p>

              <div className="mt-6 grid grid-cols-1 gap-5">
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

                <Field label="Report">
                  <select value={reportType} onChange={(e) => setReportType(e.target.value)} className={inputClass}>
                    <option value="PPM ETL Upload">PPM ETL Upload</option>
                  </select>
                </Field>

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
                  <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700">
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
                      Facility: {previewData.facility_name} · Target tab: {previewData.target_tab} · Row: {previewData.matched_target_row}
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

                {previewData.summary && (
                  <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-5">
                    <InfoCard title="Attendance Total" value={previewData.summary.attendance_total ?? 0} />
                    <InfoCard title="Screened Total" value={previewData.summary.screened_total ?? 0} />
                    <InfoCard title="Presumptive Total" value={previewData.summary.presumptive_total ?? 0} />
                    <InfoCard title="Diagnosed Total" value={previewData.summary.diagnosed_total ?? 0} />
                    <InfoCard title="Notified Total" value={previewData.summary.notified_total ?? 0} />
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
                  <InfoCard title="Matched Row" value={validationData.matched_target_row ?? "N/A"} />
                </div>
              </div>
            )}

            {uploadData && (
              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-2xl font-bold text-slate-900">Upload summary</h3>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
                  <InfoCard title="Status" value={uploadData.status || "N/A"} />
                  <InfoCard title="Target Tab" value={uploadData.target_tab || "N/A"} />
                  <InfoCard title="Matched Row" value={uploadData.matched_target_row ?? "N/A"} />
                  <InfoCard title="Updated Cells" value={uploadData.updated_cells ?? 0} />
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

const inputClass =
  "w-full rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-blue-100";

const primaryButtonClass =
  "rounded-[20px] bg-[#165693] px-6 py-3 text-lg font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButtonClass =
  "rounded-[20px] bg-slate-200 px-6 py-3 text-lg font-semibold text-slate-800 transition hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-50";

const warningButtonClass =
  "rounded-[20px] bg-amber-200 px-6 py-3 text-lg font-semibold text-amber-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50";