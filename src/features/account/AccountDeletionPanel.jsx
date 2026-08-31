export default function AccountDeletionPanel({
  expanded, busy, confirmation, error, onExpand, onChange, onDelete, onClose, onSupport,
}) {
  return (
    <div className="account-deletion-card">
      <div>
        <p className="season-label">DANGER ZONE</p>
        <h3>Delete Account</h3>
        <p>
          Permanently remove your login, profile, messages, table submissions,
          ratings, and uploaded images. Match history keeps an anonymous
          “Deleted Player” entry so league records remain accurate.
        </p>
      </div>
      {!expanded ? (
        <button type="button" className="danger-outline-button" onClick={onExpand}>
          Delete My Account
        </button>
      ) : (
        <div className="account-deletion-confirmation" aria-busy={busy}>
          <p id="delete-account-explanation">
            This cannot be undone. Images you uploaded will also be removed
            wherever they appear in a league or table listing. Other members’
            leagues, accounts, and uploads will not be deleted. If you own a
            league, delete it or contact support about transferring ownership first.
          </p>
          <p>
            If deletion is interrupted, some images may already be removed.
            Retry deletion to finish; closing this panel does not cancel a
            deletion already started.
          </p>
          <label htmlFor="delete-account-confirmation">Type <strong>DELETE</strong> to confirm</label>
          <input
            id="delete-account-confirmation" value={confirmation}
            onChange={(event) => onChange(event.target.value)}
            aria-describedby="delete-account-explanation"
            autoCapitalize="characters" autoComplete="off" spellCheck="false" disabled={busy}
          />
          {error && <div className="error-message" role="alert">{error}</div>}
          {busy && <p role="status">Deleting your account and uploaded images. Please keep this screen open.</p>}
          <div className="account-deletion-actions">
            <button type="button" className="delete-account-button"
              disabled={busy || confirmation !== "DELETE"}
              onClick={() => { if (!busy && confirmation === "DELETE") onDelete(); }}>
              {busy ? "Deleting Account…" : "Permanently Delete Account"}
            </button>
            <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Close</button>
            <button type="button" className="secondary-button" onClick={onSupport} disabled={busy}>Contact Support</button>
          </div>
        </div>
      )}
    </div>
  );
}
