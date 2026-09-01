import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import "./ModeratorQueue.css";

const TYPE_LABELS = {
  location: "Table location",
  photo_submission: "Table photo",
  review: "Table rating",
  location_report: "Location report",
  chat_report: "Chat report",
};

const FILTERS = [
  ["all", "All"],
  ["submissions", "Submissions"],
  ["reports", "Reports"],
  ["chat", "Chat"],
];

const TABLE_EDIT_SUGGESTION_PREFIX = "TTTT_EDIT_SUGGESTION_V1:";
const EDIT_FIELD_CONFIG = {
  name: { label: "Name", column: "name" },
  address: { label: "Street address", column: "address" },
  city: { label: "City", column: "city" },
  region: { label: "State or region", column: "region" },
  postalCode: { label: "ZIP or postal code", column: "postal_code", optional: true },
  venueType: { label: "Venue type", column: "venue_type" },
  accessType: { label: "Access", column: "access_type" },
  indoor: { label: "Setting", column: "indoor" },
  tableCount: { label: "Number of tables", column: "table_count" },
  hoursText: { label: "Hours", column: "hours_text", optional: true },
  notes: { label: "Public notes", column: "notes", optional: true },
  websiteUrl: { label: "Website", column: "website_url", optional: true },
};

const LOCATION_EDIT_COLUMNS = [
  "id",
  ...new Set(Object.values(EDIT_FIELD_CONFIG).map((field) => field.column)),
].join(",");

function humanize(value) {
  return value ? value.replaceAll("_", " ") : "";
}

function parseEditSuggestion(item) {
  if (
    item?.item_type !== "location_report" ||
    typeof item.details !== "string" ||
    !item.details.startsWith(TABLE_EDIT_SUGGESTION_PREFIX)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(item.details.slice(TABLE_EDIT_SUGGESTION_PREFIX.length));
    const changes = Object.fromEntries(
      Object.entries(parsed?.changes || {}).filter(([key]) => EDIT_FIELD_CONFIG[key])
    );
    return Object.keys(changes).length > 0 ? { changes } : null;
  } catch {
    return null;
  }
}

function displayEditValue(key, value) {
  if (key === "indoor") return value ? "Indoor" : "Outdoor";
  if (key === "venueType" || key === "accessType") return humanize(String(value));
  if (value == null || value === "") return "Not provided";
  return String(value);
}

function ModeratorQueue() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    const [queueResult, photoResult] = await Promise.all([
      supabase.rpc("get_moderator_queue"),
      supabase
        .from("table_location_photo_submissions")
        .select("id,location_id,photo_path,status,created_at,table_locations(name)")
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
    ]);

    if (queueResult.error) {
      console.error("Could not load moderator queue", queueResult.error);
      setErrorMessage(
        queueResult.error.code === "PGRST202" || queueResult.error.code === "42883"
          ? "The moderator queue migration is ready but has not been installed yet."
          : queueResult.error.message || "The moderator queue could not be loaded."
      );
    }

    const queueItems = queueResult.data || [];
    const editLocationIds = [
      ...new Set(
        queueItems
          .filter((item) => parseEditSuggestion(item))
          .map((item) => item.context?.locationId)
          .filter(Boolean)
      ),
    ];
    let editLocationsById = {};

    if (editLocationIds.length > 0) {
      const { data: editLocations, error: editLocationError } = await supabase
        .from("table_locations")
        .select(LOCATION_EDIT_COLUMNS)
        .in("id", editLocationIds);

      if (editLocationError) {
        console.error("Could not load current listing values", editLocationError);
      } else {
        editLocationsById = Object.fromEntries(
          (editLocations || []).map((location) => [location.id, location])
        );
      }
    }

    let photoItems = [];
    const photoMigrationMissing = ["42P01", "PGRST205"].includes(photoResult.error?.code);
    if (photoResult.error && !photoMigrationMissing) {
      console.error("Could not load table photo suggestions", photoResult.error);
      if (!queueResult.error) {
        setErrorMessage("Table photo suggestions could not be loaded.");
      }
    } else if (!photoResult.error && photoResult.data?.length) {
      const paths = photoResult.data.map((item) => item.photo_path);
      const { data: signedPhotos, error: photoError } = await supabase.storage
        .from("table-location-photos")
        .createSignedUrls(paths, 900);

      if (photoError) {
        console.error("Could not preview suggested table photos", photoError);
      }

      const urlsByPath = Object.fromEntries(
        (signedPhotos || [])
          .filter((photo) => photo.path && photo.signedUrl)
          .map((photo) => [photo.path, photo.signedUrl])
      );

      photoItems = photoResult.data.map((item) => ({
        item_type: "photo_submission",
        item_id: item.id,
        item_status: item.status,
        title: item.table_locations?.name || "Table photo suggestion",
        body: null,
        reason: null,
        details: null,
        created_at: item.created_at,
        context: {
          locationId: item.location_id,
          photoPath: item.photo_path,
          photoUrl: urlsByPath[item.photo_path] || null,
        },
      }));
    }

    setItems([
      ...queueItems.map((item) => ({
        ...item,
        context: {
          ...(item.context || {}),
          ...(parseEditSuggestion(item)
            ? { location: editLocationsById[item.context?.locationId] || null }
            : {}),
        },
      })),
      ...photoItems,
    ]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadQueue, 0);
    return () => window.clearTimeout(timer);
  }, [loadQueue]);

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (filter === "submissions") return ["location", "photo_submission", "review"].includes(item.item_type);
        if (filter === "reports") return item.item_type.endsWith("report");
        if (filter === "chat") return item.item_type === "chat_report";
        return true;
      }),
    [filter, items]
  );

  const counts = useMemo(
    () => ({
      submissions: items.filter((item) => ["location", "photo_submission", "review"].includes(item.item_type)).length,
      reports: items.filter((item) => item.item_type.endsWith("report")).length,
      chat: items.filter((item) => item.item_type === "chat_report").length,
    }),
    [items]
  );

  async function actOnItem(item, action) {
    const terminalAction = ["approved", "rejected", "resolved", "dismissed"].includes(action);
    if (terminalAction && !window.confirm(`${humanize(action)} this ${TYPE_LABELS[item.item_type].toLowerCase()}?`)) {
      return;
    }

    setSavingId(item.item_id);
    setErrorMessage("");
    setNotice("");
    const { error } = item.item_type === "photo_submission"
      ? await supabase.rpc("moderate_table_location_photo_submission", {
          p_submission_id: item.item_id,
          p_action: action,
          p_note: null,
        })
      : await supabase.rpc("moderate_queue_item", {
          p_item_type: item.item_type,
          p_item_id: item.item_id,
          p_action: action,
          p_note: null,
        });
    if (error) {
      console.error("Moderation action failed", error);
      setErrorMessage(error.message || "That moderation action failed.");
    } else {
      setNotice(`Item ${humanize(action)}.`);
      await loadQueue();
    }
    setSavingId(null);
  }

  async function applySuggestedEdit(item) {
    if (!window.confirm(`Apply these changes to ${item.title}?`)) return;

    setSavingId(item.item_id);
    setErrorMessage("");
    setNotice("");

    try {
      const { error } = await supabase.rpc("apply_table_location_edit_suggestion", {
        p_report_id: item.item_id,
      });
      if (error) throw error;
      setNotice("Suggested changes applied to the public listing.");
      await loadQueue();
    } catch (error) {
      console.error("Could not apply suggested listing changes", error);
      setErrorMessage(error.message || "Those suggested changes could not be applied.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="moderator-queue-page">
      <div className="moderator-hero">
        <div>
          <p className="moderator-kicker">TRUST &amp; SAFETY</p>
          <h2>Moderator Queue</h2>
          <p>Review community submissions and safety reports in one secure place.</p>
        </div>
        <span className="moderator-total">{items.length} open</span>
      </div>

      {errorMessage && <div className="moderator-message moderator-error">{errorMessage}</div>}
      {notice && <div className="moderator-message moderator-notice">{notice}</div>}

      <div className="moderator-filters" role="group" aria-label="Filter moderation queue">
        {FILTERS.map(([value, label]) => (
          <button
            type="button"
            key={value}
            className={filter === value ? "moderator-filter-active" : ""}
            onClick={() => setFilter(value)}
          >
            {label}
            {value !== "all" && <span>{counts[value]}</span>}
          </button>
        ))}
        <button type="button" className="moderator-refresh" onClick={loadQueue} disabled={loading}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="moderator-empty">Loading the queue…</div>
      ) : visibleItems.length === 0 ? (
        <div className="moderator-empty">
          <strong>All clear</strong>
          <span>There are no open items in this view.</span>
        </div>
      ) : (
        <div className="moderator-list">
          {visibleItems.map((item) => {
            const isSubmission = ["location", "photo_submission", "review"].includes(item.item_type);
            const editSuggestion = parseEditSuggestion(item);
            const busy = savingId === item.item_id;
            return (
              <article className="moderator-card" key={`${item.item_type}-${item.item_id}`}>
                <div className="moderator-card-heading">
                  <div>
                    <span className={`moderator-type moderator-type-${item.item_type}`}>
                      {editSuggestion ? "Suggested edit" : TYPE_LABELS[item.item_type]}
                    </span>
                    {item.item_status === "reviewing" && <span className="moderator-reviewing">Reviewing</span>}
                  </div>
                  <time>{new Date(item.created_at).toLocaleString()}</time>
                </div>
                <h3>{item.title}</h3>
                {!editSuggestion && item.reason && <p className="moderator-reason">Reason: {humanize(item.reason)}</p>}
                {!editSuggestion && item.body && <blockquote>{item.body}</blockquote>}
                {!editSuggestion && item.details && <p className="moderator-details">Reporter details: {item.details}</p>}
                {editSuggestion && (
                  <div className="moderator-edit-comparison">
                    <p>Review each proposed change before applying it.</p>
                    {Object.entries(editSuggestion.changes).map(([key, proposed]) => {
                      const field = EDIT_FIELD_CONFIG[key];
                      const current = item.context?.location?.[field.column];
                      return (
                        <div className="moderator-edit-row" key={key}>
                          <strong>{field.label}</strong>
                          <span className="moderator-edit-current">
                            <small>Current</small>
                            {displayEditValue(key, current)}
                          </span>
                          <span className="moderator-edit-arrow" aria-hidden="true">→</span>
                          <span className="moderator-edit-proposed">
                            <small>Proposed</small>
                            {displayEditValue(key, proposed)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {item.item_type === "photo_submission" && item.context?.photoUrl && (
                  <img
                    className="moderator-photo-preview"
                    src={item.context.photoUrl}
                    alt={`Suggested photo for ${item.title}`}
                  />
                )}
                {item.item_type === "review" && item.context?.rating && (
                  <p className="moderator-context">{item.context.rating} ★ at {item.context.locationName}</p>
                )}
                {item.item_type === "chat_report" && (
                  <p className="moderator-context">{humanize(item.context?.messageType)} message</p>
                )}

                <div className="moderator-actions">
                  {editSuggestion ? (
                    <>
                      {item.item_status === "open" && (
                        <button className="moderator-review" onClick={() => actOnItem(item, "reviewing")} disabled={busy}>Start review</button>
                      )}
                      <button className="moderator-apply-edit" onClick={() => applySuggestedEdit(item)} disabled={busy || !item.context?.location}>Apply Changes</button>
                      <button className="moderator-dismiss" onClick={() => actOnItem(item, "dismissed")} disabled={busy}>Dismiss</button>
                    </>
                  ) : isSubmission ? (
                    <>
                      <button className="moderator-approve" onClick={() => actOnItem(item, "approved")} disabled={busy}>Approve</button>
                      <button className="moderator-reject" onClick={() => actOnItem(item, "rejected")} disabled={busy}>Reject</button>
                    </>
                  ) : (
                    <>
                      {item.item_status === "open" && (
                        <button className="moderator-review" onClick={() => actOnItem(item, "reviewing")} disabled={busy}>Start review</button>
                      )}
                      <button className="moderator-resolve" onClick={() => actOnItem(item, "resolved")} disabled={busy}>Resolve</button>
                      <button className="moderator-dismiss" onClick={() => actOnItem(item, "dismissed")} disabled={busy}>Dismiss</button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default ModeratorQueue;
