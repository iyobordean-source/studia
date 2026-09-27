import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Download, LoaderCircle, Trash2 } from "lucide-react";
import { supabase, supabaseConfigurationError } from "./supabase";

const bucketName = "course-materials";
const maxFileSize = 20 * 1024 * 1024;
const materialFields = "id, course_id, title, description, file_name, storage_path, mime_type, file_size, created_at, updated_at";

type CourseMaterial = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  created_at: string;
  updated_at: string;
};

type CourseBrainSource = {
  id: string;
  course_material_id: string;
  status: string;
  error_message: string | null;
  updated_at: string;
};

const courseBrainStatusLabels: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

function messageFor(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function formatSize(value: number) {
  if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + " MB";
  return Math.max(1, Math.round(value / 1024)) + " KB";
}

async function validatePdf(file: File): Promise<string | null> {
  if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type.toLowerCase() !== "application/pdf")) {
    return "Choose a PDF file.";
  }
  if (file.size < 1 || file.size > maxFileSize) {
    return "Choose a PDF between 1 byte and 20 MB.";
  }
  const firstKilobyte = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
  if (!firstKilobyte.includes("%PDF-")) {
    return "This file does not appear to contain a PDF document.";
  }
  return null;
}

function CourseBrainProcessingStatus({
  source,
  unavailable,
}: {
  source: CourseBrainSource | undefined;
  unavailable: boolean;
}) {
  const statusLabel = unavailable
    ? "Status unavailable"
    : source
      ? courseBrainStatusLabels[source.status] ?? "Unknown status"
      : "Not initialized";
  const statusTone = !source || unavailable || !courseBrainStatusLabels[source.status]
    ? "unavailable"
    : source.status;

  return (
    <>
      <p className="course-material-brain-status">
        <span>Course Brain</span>
        <span className={`course-material-brain-state course-material-brain-state--${statusTone}`}>
          {statusLabel}
        </span>
      </p>
      {source?.status === "failed" && source.error_message && (
        <p className="course-material-processing-error">{source.error_message}</p>
      )}
    </>
  );
}

export function CourseMaterialsSection({
  courseId,
  canManage,
}: {
  courseId: string;
  canManage: boolean;
}) {
  const [materials, setMaterials] = useState<CourseMaterial[]>([]);
  const [sourcesByMaterial, setSourcesByMaterial] = useState<Record<string, CourseBrainSource>>({});
  const [sourceLoadError, setSourceLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyMaterialId, setBusyMaterialId] = useState("");
  const [busyMaterialAction, setBusyMaterialAction] = useState<"download" | "delete" | null>(null);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const loadMaterials = useCallback(async () => {
    const client = supabase;
    if (!client) {
      setLoadError(supabaseConfigurationError);
      setMaterials([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");
    setSourceLoadError(false);
    setSourcesByMaterial({});
    try {
      const { data, error } = await client
        .from("course_materials")
        .select(materialFields)
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const loadedMaterials = (data ?? []) as unknown as CourseMaterial[];
      setMaterials(loadedMaterials);
      if (canManage && loadedMaterials.length > 0) {
        const { data: sourceRows, error: sourceError } = await client
          .from("course_material_sources")
          .select("id, course_material_id, status, error_message, updated_at")
          .in("course_material_id", loadedMaterials.map((material) => material.id));
        if (sourceError) {
          setSourceLoadError(true);
          return;
        }
        const nextSources: Record<string, CourseBrainSource> = {};
        (sourceRows ?? []).forEach((row) => {
          const source = row as unknown as CourseBrainSource;
          nextSources[source.course_material_id] = source;
        });
        setSourcesByMaterial(nextSources);
      }
    } catch (error) {
      setLoadError(messageFor(error, "Unable to load course materials."));
      setMaterials([]);
      setSourcesByMaterial({});
    } finally {
      setLoading(false);
    }
  }, [canManage, courseId]);

  useEffect(() => {
    void loadMaterials();
  }, [loadMaterials]);

  async function uploadMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = supabase;
    if (!client) {
      setSaveError(supabaseConfigurationError);
      return;
    }

    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    if (!cleanTitle || cleanTitle.length > 160) {
      setSaveError("Enter a material title of 1 to 160 characters.");
      return;
    }
    if (cleanDescription.length > 5000) {
      setSaveError("Keep the description under 5,000 characters.");
      return;
    }
    if (!file) {
      setSaveError("Choose a PDF file to upload.");
      return;
    }

    setSaving(true);
    setSaveError("");
    setNotice("");
    let uploadedPath = "";
    try {
      const fileError = await validatePdf(file);
      if (fileError) throw new Error(fileError);

      const safeFileName = file.name
        .replaceAll("/", "_")
        .replaceAll("\\", "_")
        .replace(/[\u0000-\u001f]/g, "_")
        .trim();
      if (!safeFileName || safeFileName.length > 255) {
        throw new Error("The PDF filename must be 1 to 255 characters.");
      }

      const materialId = crypto.randomUUID();
      const storagePath = courseId + "/" + materialId + "/" + safeFileName;
      const { error: uploadError } = await client.storage
        .from(bucketName)
        .upload(storagePath, file, {
          cacheControl: "3600",
          contentType: "application/pdf",
          upsert: false,
        });
      if (uploadError) throw uploadError;
      uploadedPath = storagePath;

      const { error: recordError } = await client
        .from("course_materials")
        .insert({
          id: materialId,
          course_id: courseId,
          title: cleanTitle,
          description: cleanDescription || null,
          file_name: safeFileName,
          storage_path: storagePath,
          mime_type: "application/pdf",
          file_size: file.size,
        });
      if (recordError) throw recordError;
      uploadedPath = "";

      setTitle("");
      setDescription("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      setNotice(cleanTitle + " was uploaded.");
      await loadMaterials();
    } catch (error) {
      if (uploadedPath) {
        const { error: cleanupError } = await client.storage.from(bucketName).remove([uploadedPath]);
        if (cleanupError) {
          setSaveError("The material record could not be saved, and its uploaded file could not be removed. Try again or contact support.");
          return;
        }
      }
      setSaveError(messageFor(error, "Unable to upload this material."));
    } finally {
      setSaving(false);
    }
  }

  async function deleteMaterial(material: CourseMaterial) {
    const client = supabase;
    if (!client) {
      setSaveError(supabaseConfigurationError);
      return;
    }

    setBusyMaterialId(material.id);
    setBusyMaterialAction("delete");
    setSaveError("");
    setNotice("");
    try {
      const { error: storageError } = await client.storage
        .from(bucketName)
        .remove([material.storage_path]);
      if (storageError) throw storageError;

      const { data, error: recordError } = await client
        .from("course_materials")
        .delete()
        .eq("id", material.id)
        .eq("course_id", courseId)
        .select("id")
        .maybeSingle();
      if (recordError) throw recordError;
      if (!data) throw new Error("This material could not be removed from the course.");

      setMaterials((current) => current.filter((item) => item.id !== material.id));
      setSourcesByMaterial((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([materialId]) => materialId !== material.id),
        ),
      );
      setNotice(material.title + " was deleted.");
    } catch (error) {
      setSaveError(messageFor(error, "Unable to delete this material."));
    } finally {
      setBusyMaterialId("");
      setBusyMaterialAction(null);
    }
  }

  async function downloadMaterial(material: CourseMaterial) {
    const client = supabase;
    if (!client) {
      setSaveError(supabaseConfigurationError);
      return;
    }

    setBusyMaterialId(material.id);
    setBusyMaterialAction("download");
    setSaveError("");
    try {
      const { data, error } = await client.storage
        .from(bucketName)
        .download(material.storage_path);
      if (error) throw error;

      const objectUrl = window.URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = material.file_name;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000);
    } catch (error) {
      setSaveError(messageFor(error, "Unable to download this course material."));
    } finally {
      setBusyMaterialId("");
      setBusyMaterialAction(null);
    }
  }

  return (
    <section className="course-detail-section course-materials-section" aria-labelledby="course-materials-title">
      <p className="auth-kicker">COURSE MATERIALS</p>
      <h2 id="course-materials-title">Course materials</h2>
      <p className="course-materials-intro">
        {canManage
          ? "Share course PDFs with students enrolled in this course."
          : "PDFs your lecturer has shared for this course."}
      </p>

      {notice && <p className="course-success" role="status">{notice}</p>}
      {saveError && <p className="course-enrollment-error" role="alert">{saveError}</p>}

      {canManage && (
        <form className="course-form course-material-form" onSubmit={(event) => void uploadMaterial(event)}>
          <div className="course-form-fields">
            <label className="auth-field">
              <span>Material title</span>
              <input
                name="material-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
                autoComplete="off"
                required
                disabled={saving}
              />
            </label>
            <label className="auth-field course-description-field">
              <span>Description <small>(optional)</small></span>
              <textarea
                name="material-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={5000}
                rows={3}
                disabled={saving}
              />
            </label>
            <label className="auth-field course-description-field">
              <span>PDF file <small>(maximum 20 MB)</small></span>
              <input
                ref={fileInput}
                className="course-material-file-input"
                name="material-file"
                type="file"
                accept=".pdf,application/pdf"
                required
                disabled={saving}
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  setFile(selected);
                  if (selected && !title.trim()) setTitle(selected.name.replace(/\.pdf$/i, ""));
                }}
              />
            </label>
          </div>
          {file && <p className="course-material-selected-file">{file.name} · {formatSize(file.size)}</p>}
          <p className="course-material-help">PDF documents only. Uploads are private to this course and its enrolled students.</p>
          <div className="course-form-actions">
            <button className="button button-primary" type="submit" disabled={saving}>
              {saving && <LoaderCircle aria-hidden="true" size={16} className="auth-spinner" />}
              {saving ? "Uploading PDF..." : "Upload material"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="course-feedback" role="status">
          <LoaderCircle aria-hidden="true" size={16} className="auth-spinner" />
          Loading course materials...
        </p>
      ) : loadError ? (
        <div className="course-empty-state">
          <p className="auth-error" role="alert">{loadError}</p>
          <button className="button identity-secondary" type="button" onClick={() => void loadMaterials()}>
            Try again
          </button>
        </div>
      ) : materials.length === 0 ? (
        <p className="course-empty-state">
          {canManage
            ? "No materials have been added yet. Upload a PDF to share it with enrolled students."
            : "No materials have been shared for this course yet."}
        </p>
      ) : (
        <ul className="course-material-list" aria-label="Course materials">
          {materials.map((material) => (
            <li className="course-material-row" key={material.id}>
              <div className="course-material-copy">
                <h3>{material.title}</h3>
                {material.description && <p>{material.description}</p>}
                <p className="course-material-meta">
                  <span>PDF</span>
                  <span>Uploaded {formatDate(material.created_at)}</span>
                  <span>{formatSize(material.file_size)}</span>
                </p>
                <p className="course-material-filename">{material.file_name}</p>
                {canManage && (
                  <CourseBrainProcessingStatus
                    source={sourcesByMaterial[material.id]}
                    unavailable={sourceLoadError}
                  />
                )}
              </div>
              <div className="course-material-actions">
                <button
                  className="button identity-secondary course-material-action"
                  type="button"
                  onClick={() => void downloadMaterial(material)}
                  disabled={Boolean(busyMaterialId)}
                  aria-label={"Download " + material.title + " PDF"}
                >
                  {busyMaterialId === material.id && busyMaterialAction === "download"
                    ? <LoaderCircle aria-hidden="true" size={15} className="auth-spinner" />
                    : <Download aria-hidden="true" size={15} />}
                  {busyMaterialId === material.id && busyMaterialAction === "download" ? "Preparing..." : "Download PDF"}
                </button>
                {canManage && (
                  <button
                    className="button course-material-delete course-material-action"
                    type="button"
                    onClick={() => void deleteMaterial(material)}
                    disabled={Boolean(busyMaterialId)}
                    aria-label={"Delete " + material.title}
                  >
                    {busyMaterialId === material.id && busyMaterialAction === "delete"
                      ? <LoaderCircle aria-hidden="true" size={15} className="auth-spinner" />
                      : <Trash2 aria-hidden="true" size={15} />}
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}