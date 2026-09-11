# India Cafe/Restaurant Compliance — Master Reference (Draft, Dummy Data)

General reference for standard compliance items relevant to a small café in India. Renewal cycles and processing times are approximate — meant to seed the `compliance_reminders` schema (which computes `reminder_date` from `due_date − process_duration_days`), not to be treated as legal advice.

| Compliance item | Typical renewal cycle | Approx. process duration | Notes |
|---|---|---|---|
| FSSAI License (State/Basic, depending on turnover) | 1–5 years (chosen at registration) | 30–45 days | Mandatory for any food business; basic registration for small turnover, state license above threshold |
| Fire Safety NOC | Annual | 15–30 days | Local fire department inspection required |
| Shops & Establishment Registration | 1–5 years, state-dependent | 15–20 days | Uttarakhand state labour department |
| GST Registration | Ongoing (no renewal, but returns are periodic) | N/A (returns filed monthly/quarterly) | Mandatory above turnover threshold |
| Trade License (Municipal/Nagar Palika) | Annual | 20–30 days | Issued by local municipal body |
| Eating House License | Annual (where applicable) | 30–45 days | More commonly required in metro jurisdictions; verify local applicability for Mussoorie |
| Health Trade License | Annual | 15–20 days | Often bundled with municipal trade license in smaller towns |
| Weights & Measures (Legal Metrology) Registration | Varies (1–5 years) | 15 days | Applicable if selling any pre-packaged goods |
| Music License (PPL / IPRS) | Annual | 10–15 days | Required if playing recorded/licensed music in the café |
| Employee ESI/PF Registration | Ongoing (threshold-triggered) | 15–20 days to register | Applies once staff count/wage thresholds are met |
| Signage / Hoarding License | Annual | 15–20 days | Municipal permission for external signage |
| Pollution Control NOC | Annual or as required | 20–30 days | Typically relevant if any solid fuel roasting/cooking is done on-site |

## Musafir Cafe (Mussoorie) — dummy compliance status
| Item | Due date (dummy) | Status |
|---|---|---|
| FSSAI License | 15 days from setup | Upcoming |
| Fire Safety NOC | Cleared 3 weeks ago | Cleared |
| Shops & Establishment Registration | 40 days from setup | Upcoming |
| Trade License | Cleared 2 months ago | Cleared |

These are placeholder dates for testing the reminder computation and proof-upload gating (`proof_document_url`) described in the schema doc.
