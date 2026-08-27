// Stable per-tab identity for the editor lock. Each browser tab gets a random
// UUID on first use, stored in sessionStorage so it survives page refreshes
// within the same tab but resets when the tab is closed. Different tabs (and
// therefore different sessionStorage instances) naturally get different IDs.

const SESSION_ID_KEY = "prodoc_editor_session_id";

export function getEditorSessionId(): string {
  let id = sessionStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}
