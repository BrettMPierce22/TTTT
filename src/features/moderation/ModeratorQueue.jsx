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

function humanize(value) {
  return value ? value.replaceAll("_", " ") : "";
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

    setItems([...(queueResult.data || []), ...photoItems]);
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
            const busy = savingId === item.item_id;
            return (
              <article className="moderator-card" key={`${item.item_type}-${item.item_id}`}>
                <div className="moderator-card-heading">
                  <div>
                    <span className={`moderator-type moderator-type-${item.item_type}`}>
                      {TYPE_LABELS[item.item_type]}
                    </span>
                    {item.item_status === "reviewing" && <span className="moderator-reviewing">Reviewing</span>}
                  </div>
                  <time>{new Date(item.created_at).toLocaleString()}</time>
                </div>
                <h3>{item.title}</h3>
                {item.reason && <p className="moderator-reason">Reason: {humanize(item.reason)}</p>}
                {item.body && <blockquote>{item.body}</blockquote>}
                {item.details && <p className="moderator-details">Reporter details: {item.details}</p>}
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
                  {isSubmission ? (
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
