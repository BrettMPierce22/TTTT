import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import "./ChatCenter.css";

function Avatar({ player }) {
  const initial = player?.name?.charAt(0)?.toUpperCase() || "?";
  return (
    <span className="direct-chat-avatar" aria-hidden="true">
      {player?.avatar_url ? <img src={player.avatar_url} alt="" /> : initial}
    </span>
  );
}

function ChatCenter({ league, currentPlayer, players, isAdmin, resetSignal = 0 }) {
  const [mode, setMode] = useState("league");
  const [leagueMessages, setLeagueMessages] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [directMessages, setDirectMessages] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [draft, setDraft] = useState("");
  const [blockedPlayerIds, setBlockedPlayerIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [reportTarget, setReportTarget] = useState(null);
  const [reportReason, setReportReason] = useState("harassment");
  const [reportDetails, setReportDetails] = useState("");
  const endRef = useRef(null);

  const activePlayers = useMemo(
    () => players.filter((player) => player.is_active),
    [players]
  );
  const playerById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players]
  );
  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedConversationId
  );
  const otherPlayerId = selectedConversation
    ? selectedConversation.player_low_id === currentPlayer?.id
      ? selectedConversation.player_high_id
      : selectedConversation.player_low_id
    : null;
  const otherPlayer = playerById.get(otherPlayerId);

  const loadLeagueMessages = useCallback(async () => {
    if (!league?.id) return;
    const { data, error } = await supabase
      .from("league_messages")
      .select("id,league_id,player_id,message,created_at")
      .eq("league_id", league.id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    setLeagueMessages(data || []);
  }, [league]);

  const loadConversations = useCallback(async () => {
    if (!league?.id) return;
    const { data, error } = await supabase
      .from("direct_conversations")
      .select("id,league_id,player_low_id,player_high_id,created_at,updated_at")
      .eq("league_id", league.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    setConversations(data || []);
  }, [league]);

  const loadDirectMessages = useCallback(async (conversationId) => {
    if (!conversationId) {
      setDirectMessages([]);
      return;
    }
    const { data, error } = await supabase
      .from("direct_messages")
      .select("id,conversation_id,sender_player_id,message,created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    setDirectMessages(data || []);
  }, []);

  const loadBlocks = useCallback(async () => {
    if (!currentPlayer?.id) return;
    const { data, error } = await supabase
      .from("chat_player_blocks")
      .select("blocked_player_id")
      .eq("blocker_player_id", currentPlayer.id);
    if (error) throw error;
    setBlockedPlayerIds((data || []).map((item) => item.blocked_player_id));
  }, [currentPlayer]);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage("");
      await Promise.all([loadLeagueMessages(), loadConversations(), loadBlocks()]);
    } catch (error) {
      console.error("Could not load chat", error);
      setErrorMessage(
        error.code === "42P01" || error.code === "PGRST205"
          ? "Private messages need the latest Supabase chat migration. League chat is still available."
          : "Chat could not be loaded."
      );
      try {
        await loadLeagueMessages();
      } catch (leagueError) {
        console.error(leagueError);
      }
    } finally {
      setLoading(false);
    }
  }, [loadBlocks, loadConversations, loadLeagueMessages]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadAll(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAll]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMode("league");
      setSelectedConversationId(null);
      setDraft("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [resetSignal]);

  useEffect(() => {
    if (!selectedConversationId) return;
    const timer = window.setTimeout(() => {
      loadDirectMessages(selectedConversationId).catch((error) => {
        console.error(error);
        setErrorMessage("That direct conversation could not be loaded.");
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDirectMessages, selectedConversationId]);

  useEffect(() => {
    const count = mode === "league" ? leagueMessages.length : directMessages.length;
    if (count === 0) return;
    const timer = window.setTimeout(
      () => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
      50
    );
    return () => window.clearTimeout(timer);
  }, [directMessages.length, leagueMessages.length, mode]);

  useEffect(() => {
    if (!league?.id) return undefined;
    const channel = supabase
      .channel(`chat-center-${league.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "league_messages", filter: `league_id=eq.${league.id}` },
        () => loadLeagueMessages().catch(console.error)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "direct_messages" },
        (payload) => {
          loadConversations().catch(console.error);
          if (payload.new?.conversation_id === selectedConversationId || payload.old?.conversation_id === selectedConversationId) {
            loadDirectMessages(selectedConversationId).catch(console.error);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [league?.id, loadConversations, loadDirectMessages, loadLeagueMessages, selectedConversationId]);

  async function openDirectConversation(playerId) {
    try {
      setErrorMessage("");
      const { data, error } = await supabase.rpc("get_or_create_direct_conversation", {
        p_league_id: league.id,
        p_other_player_id: playerId,
      });
      if (error) throw error;
      await loadConversations();
      setSelectedConversationId(data);
      setMode("direct");
      setDraft("");
    } catch (error) {
      console.error(error);
      setErrorMessage(error.message || "Could not start that conversation.");
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const cleanMessage = draft.trim();
    if (!cleanMessage || cleanMessage.length > 500) return;
    try {
      setSending(true);
      setErrorMessage("");
      if (mode === "league") {
        const { error } = await supabase.rpc("send_league_message", {
          p_league_id: league.id,
          p_message: cleanMessage,
        });
        if (error) throw error;
        await loadLeagueMessages();
      } else {
        const { error } = await supabase.rpc("send_direct_message", {
          p_conversation_id: selectedConversationId,
          p_message: cleanMessage,
        });
        if (error) throw error;
        await Promise.all([
          loadDirectMessages(selectedConversationId),
          loadConversations(),
        ]);
      }
      setDraft("");
    } catch (error) {
      console.error(error);
      setErrorMessage(error.message || "Could not send that message.");
    } finally {
      setSending(false);
    }
  }

  async function deleteMessage(message, type) {
    if (!window.confirm("Delete this message?")) return;
    try {
      const { error } = await supabase.rpc(
        type === "league" ? "delete_league_message" : "delete_direct_message",
        type === "league" ? { p_message_id: message.id } : { p_message_id: message.id }
      );
      if (error) throw error;
      if (type === "league") await loadLeagueMessages();
      else await loadDirectMessages(selectedConversationId);
    } catch (error) {
      setErrorMessage(error.message || "Could not delete that message.");
    }
  }

  function openReport(message, type) {
    setReportTarget({ message, type });
    setReportReason("harassment");
    setReportDetails("");
  }

  async function reportMessage(event) {
    event.preventDefault();
    if (!reportTarget) return;
    try {
      const { error } = await supabase.rpc("report_chat_message", {
        p_league_id: league.id,
        p_league_message_id: reportTarget.type === "league" ? reportTarget.message.id : null,
        p_direct_message_id: reportTarget.type === "direct" ? reportTarget.message.id : null,
        p_reason: reportReason,
        p_details: reportDetails.trim() || null,
      });
      if (error) throw error;
      setReportTarget(null);
      setNotice("Message reported. A moderator will review it.");
    } catch (error) {
      setErrorMessage(error.message || "Could not report that message.");
    }
  }

  async function toggleBlock(playerId) {
    if (!playerId) return;
    const isBlocked = blockedPlayerIds.includes(playerId);
    if (!isBlocked && !window.confirm("Block this player from direct chat and hide their chat messages?")) return;
    try {
      const { error } = await supabase.rpc("set_chat_player_block", {
        p_league_id: league.id,
        p_blocked_player_id: playerId,
        p_blocked: !isBlocked,
      });
      if (error) throw error;
      await loadBlocks();
      if (!isBlocked) {
        setMode("league");
        setSelectedConversationId(null);
      }
      setNotice(isBlocked ? "Player unblocked." : "Player blocked.");
    } catch (error) {
      setErrorMessage(error.message || "Could not update the block list.");
    }
  }

  const visibleLeagueMessages = leagueMessages.filter(
    (message) => !blockedPlayerIds.includes(message.player_id)
  );
  const visibleDirectMessages = directMessages.filter(
    (message) => !blockedPlayerIds.includes(message.sender_player_id)
  );
  const currentMessages = mode === "league" ? visibleLeagueMessages : visibleDirectMessages;

  function renderMessages() {
    if (loading && currentMessages.length === 0) {
      return <div className="chat-empty-state">Loading chat…</div>;
    }
    if (currentMessages.length === 0) {
      return (
        <div className="chat-empty-state">
          <span className="direct-chat-empty-icon">💬</span>
          <h3>{mode === "league" ? "Start the league conversation" : "Say hello"}</h3>
          <p>{mode === "league" ? `No messages in ${league.name} yet.` : `Your conversation with ${otherPlayer?.name || "this player"} is private.`}</p>
        </div>
      );
    }
    return currentMessages.map((message) => {
      const senderId = mode === "league" ? message.player_id : message.sender_player_id;
      const sender = playerById.get(senderId) || { name: "Player", avatar_url: null };
      const mine = senderId === currentPlayer?.id;
      return (
        <div className={`chat-message-row ${mine ? "chat-message-mine" : ""}`} key={message.id}>
          <Avatar player={sender} />
          <div className="chat-message-content">
            <div className="chat-message-meta">
              <strong>{sender.name}</strong>
              <span>{new Date(message.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            </div>
            <div className="chat-message-bubble">
              <p>{message.message}</p>
              <div className="direct-chat-message-actions">
                {(mine || (mode === "league" && isAdmin)) && (
                  <button type="button" onClick={() => deleteMessage(message, mode)}>Delete</button>
                )}
                {!mine && <button type="button" onClick={() => openReport(message, mode)}>Report</button>}
              </div>
            </div>
          </div>
        </div>
      );
    });
  }

  return (
    <div className="chat-center">
      <div className="chat-topbar">
        <div className="chat-mode-tabs" role="tablist" aria-label="Chat type">
          <button type="button" className={mode === "league" ? "chat-mode-active" : ""} onClick={() => { setMode("league"); setSelectedConversationId(null); setDraft(""); }}>
            League Chat
          </button>
          <button type="button" className={mode === "direct" ? "chat-mode-active" : ""} onClick={() => setMode("direct")}>
            Direct Messages
          </button>
        </div>
        <div className="chat-topbar-title">
          <strong>{mode === "league" ? league.name : otherPlayer?.name || "Choose a player"}</strong>
          <span>{mode === "league" ? `${activePlayers.length} active players · League chat` : otherPlayer ? "Private league conversation" : "Start a one-to-one chat"}</span>
        </div>
        {mode === "direct" && otherPlayer && (
          <button type="button" className="chat-block-button" onClick={() => toggleBlock(otherPlayer.id)}>
            {blockedPlayerIds.includes(otherPlayer.id) ? "Unblock" : "Block"}
          </button>
        )}
      </div>

      {errorMessage && <div className="direct-chat-alert direct-chat-error">{errorMessage}</div>}
      {notice && <div className="direct-chat-alert direct-chat-notice">{notice}</div>}

      <div className={`chat-workspace ${mode === "direct" ? "chat-workspace-direct" : ""}`}>
        {mode === "direct" && (
          <aside className="direct-chat-sidebar">
            <p className="season-label">MESSAGES</p>
            <div className="direct-conversation-list">
              {conversations.map((conversation) => {
                const nextOtherId = conversation.player_low_id === currentPlayer?.id ? conversation.player_high_id : conversation.player_low_id;
                const nextOther = playerById.get(nextOtherId);
                if (!nextOther || blockedPlayerIds.includes(nextOtherId)) return null;
                return (
                  <button type="button" className={selectedConversationId === conversation.id ? "direct-conversation-active" : ""} key={conversation.id} onClick={() => { setSelectedConversationId(conversation.id); setDraft(""); }}>
                    <Avatar player={nextOther} />
                    <span><strong>{nextOther.name}</strong><small>Private chat</small></span>
                  </button>
                );
              })}
            </div>
            <p className="season-label direct-player-label">START A CHAT</p>
            <div className="direct-player-list">
              {activePlayers.filter((player) => player.id !== currentPlayer?.id && !blockedPlayerIds.includes(player.id)).map((player) => (
                <button type="button" key={player.id} onClick={() => openDirectConversation(player.id)}>
                  <Avatar player={player} /><span>{player.name}</span><b>+</b>
                </button>
              ))}
            </div>
          </aside>
        )}

        <section className="card chat-card chat-card-raised">
          {mode === "direct" && !selectedConversationId ? (
            <div className="chat-empty-state direct-chat-prompt">
              <span className="direct-chat-empty-icon">👤</span>
              <h3>Choose a league player</h3>
              <p>Start an individual conversation from the player list.</p>
            </div>
          ) : (
            <>
              <div className="chat-message-list">{renderMessages()}<div ref={endRef} /></div>
              <form className="chat-composer" onSubmit={sendMessage}>
                <textarea rows="2" maxLength="500" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (!sending && draft.trim()) sendMessage(event); } }} placeholder={mode === "league" ? "Message the league…" : `Message ${otherPlayer?.name || "player"}…`} />
                <div className="chat-composer-footer">
                  <div><span>{draft.length}/500</span><small>Messages are filtered. Use Report or Block for unsafe behavior.</small></div>
                  <button className="primary-button chat-send-button" disabled={sending || !draft.trim()}>{sending ? "Sending…" : "Send"}</button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>

      {reportTarget && (
        <div className="chat-report-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setReportTarget(null);
        }}>
          <form className="chat-report-dialog" onSubmit={reportMessage}>
            <p className="season-label">SAFETY REPORT</p>
            <h3>Report message</h3>
            <blockquote>{reportTarget.message.message}</blockquote>
            <label>
              Reason
              <select value={reportReason} onChange={(event) => setReportReason(event.target.value)}>
                <option value="harassment">Harassment or bullying</option>
                <option value="spam">Spam</option>
                <option value="hate">Hate speech</option>
                <option value="threat">Threat or violence</option>
                <option value="other">Something else</option>
              </select>
            </label>
            <label>
              Details <span>optional</span>
              <textarea rows="4" maxLength="800" value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} placeholder="Tell the moderator what happened." />
              <small>{reportDetails.length}/800</small>
            </label>
            <div className="chat-report-actions">
              <button type="button" onClick={() => setReportTarget(null)}>Cancel</button>
              <button type="submit" className="chat-report-submit">Send report</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default ChatCenter;
