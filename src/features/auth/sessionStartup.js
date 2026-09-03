// One owner for session restoration. Auth callbacks never await Supabase work:
// the SDK can still hold its auth lock while delivering these notifications.
export function startSessionStartup({ auth, bootstrap, onSession, onClear, onRecovery, onStatus, shouldResumeRecovery = () => false, timeoutMs = 20000 }) {
  let disposed = false;
  let revision = 0;
  let identity = null;
  let phase = "restoring";
  let timer;
  let task;
  let recovering = false;

  function status(next) {
    phase = next;
    onStatus(next);
  }

  function invalidate() {
    revision += 1;
    clearTimeout(timer);
    clearTimeout(task);
    return revision;
  }

  function fail(token) {
    if (disposed || token !== revision) return;
    invalidate();
    status("error");
  }

  function deadline(token) {
    timer = setTimeout(() => fail(token), timeoutMs);
  }

  function acceptSession(session, event = "SIGNED_IN", force = false) {
    if (disposed) return;
    // Anonymous sessions are not supported by this app. Never bootstrap them.
    const nextUser = session?.user?.is_anonymous ? null : session?.user;
    const nextIdentity = nextUser?.id || null;
    const resumeRecovery = nextIdentity && (event === "PASSWORD_RECOVERY" || shouldResumeRecovery(nextIdentity));
    if (resumeRecovery && recovering && identity === nextIdentity) {
      onSession(session);
      clearTimeout(timer);
      status("ready");
      return;
    }
    if (!force && !resumeRecovery && nextIdentity && identity === nextIdentity && (phase === "restoring" || phase === "ready") && event !== "PASSWORD_RECOVERY") {
      onSession(session);
      return;
    }
    const previousIdentity = identity;
    const token = invalidate();
    identity = nextIdentity;
    recovering = Boolean(resumeRecovery);
    if (!nextIdentity || (previousIdentity && previousIdentity !== nextIdentity)) onClear();
    onSession(nextIdentity ? session : null);

    if (resumeRecovery) {
      onRecovery(session);
      status("ready");
      return;
    }
    if (!nextIdentity) {
      status("ready");
      return;
    }

    status("restoring");
    deadline(token);
    const isCurrent = () => !disposed && revision === token;
    task = setTimeout(async () => {
      if (!isCurrent()) return;
      try {
        await bootstrap(nextIdentity, isCurrent);
        if (!isCurrent()) return;
        clearTimeout(timer);
        status("ready");
      } catch {
        fail(token);
      }
    }, 0);
  }

  async function retry() {
    if (disposed) return;
    const token = invalidate();
    status("restoring");
    deadline(token);
    try {
      const { data, error } = await auth.getSession();
      if (disposed || revision !== token) return;
      if (error) throw error;
      acceptSession(data?.session || null, "RESTORE", true);
    } catch {
      fail(token);
    }
  }

  const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
    // getSession distinguishes "no saved login" from restoration/network errors.
    // The SDK can emit INITIAL_SESSION(null) on an initialization error.
    if (event === "INITIAL_SESSION" && !session?.user) return;
    acceptSession(session, event);
  });
  void retry();

  return {
    retry,
    acceptSession,
    endRecovery() { recovering = false; },
    dispose() {
      disposed = true;
      invalidate();
      subscription.unsubscribe();
    },
  };
}
