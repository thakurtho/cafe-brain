-- Outlet Brain — Ask rebuilt against Schema Living Doc v4 §7 ("Ask fully
-- collapses into Tell's pipeline"). Every Ask session now writes a
-- session_classifications row even on a plain successful lookup, tagged
-- with a content type that didn't exist before: 'query'.

alter type classification_type add value 'query';
