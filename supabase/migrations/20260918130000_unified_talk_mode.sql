-- Outlet Brain — Ask and Tell merge into one conversational flow.
--
-- A new session_mode value rather than overloading 'tell' or 'ask':
-- neither name fits a session that can both report something AND answer a
-- question in the same thread. 'ask' is left as-is for drill-down
-- conversations (app/drill-down-actions.ts) — an unrelated feature that
-- happens to reuse the same enum value as a generic "this is an open
-- conversation" tag; not touched by this change.

alter type session_mode add value 'talk';
