-- Outlet Brain — Musafir Cafe seed (pure SQL, no API keys required)
--
-- Run this in Supabase Studio → SQL Editor (same place you ran the 7
-- migrations), after all 7 migrations have been applied. Safe to re-run —
-- every insert is guarded by WHERE NOT EXISTS on a natural key, so running
-- it twice just does nothing the second time.
--
-- Why SQL instead of the seed.ts script: SQL Editor runs as the database
-- owner, which bypasses RLS and can insert into auth.users directly — so
-- no anon key, and critically no service_role key, ever needs to leave
-- your Supabase dashboard.
--
-- One real tradeoff, flagged plainly: the 3 staff auth accounts below are
-- created by inserting directly into auth.users with phone_confirmed_at
-- set to now() — a dummy/dev-only shortcut, not the real phone-OTP sign-up
-- flow. It's enough to populate the users table correctly for this schema
-- sanity check. When these 3 people need to actually log in for real,
-- either they sign up fresh via real OTP (then you'd merge/replace these
-- rows), or you accept these as their permanent accounts and just have
-- them do their first real OTP login against this same phone number —
-- worth revisiting once auth flows are actually being built.

begin;

-- ---------------------------------------------------------------------
-- Brand & outlet (docs/00_Brand_Outlet_Users.md)
-- ---------------------------------------------------------------------

insert into public.brands (name)
select 'Musafir Cafe'
where not exists (select 1 from public.brands where name = 'Musafir Cafe');

insert into public.outlets (brand_id, name, location)
select b.id, 'Musafir Cafe — Mussoorie', 'Mall Road, Mussoorie, Uttarakhand'
from public.brands b
where b.name = 'Musafir Cafe'
  and not exists (select 1 from public.outlets where name = 'Musafir Cafe — Mussoorie');

-- ---------------------------------------------------------------------
-- Auth users + public.users — see the header note on this shortcut.
-- ---------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000'::uuid, gen_random_uuid(),
  'authenticated', 'authenticated', '+919876510001', now(),
  '{"provider":"phone","providers":["phone"]}'::jsonb, '{"name":"Ritika Bisht"}'::jsonb,
  now(), now()
where not exists (select 1 from auth.users where phone = '+919876510001');

insert into auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000'::uuid, gen_random_uuid(),
  'authenticated', 'authenticated', '+919876510002', now(),
  '{"provider":"phone","providers":["phone"]}'::jsonb, '{"name":"Aman Rawat"}'::jsonb,
  now(), now()
where not exists (select 1 from auth.users where phone = '+919876510002');

insert into auth.users (
  instance_id, id, aud, role, phone, phone_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000'::uuid, gen_random_uuid(),
  'authenticated', 'authenticated', '+919876510003', now(),
  '{"provider":"phone","providers":["phone"]}'::jsonb, '{"name":"Sneha Thapa"}'::jsonb,
  now(), now()
where not exists (select 1 from auth.users where phone = '+919876510003');

with target as (
  select b.id as brand_id, o.id as outlet_id
  from public.brands b
  join public.outlets o on o.brand_id = b.id and o.name = 'Musafir Cafe — Mussoorie'
  where b.name = 'Musafir Cafe'
)
insert into public.users (id, brand_id, outlet_id, name, phone, email, role, access_tier, language_preference)
select u.id, t.brand_id, t.outlet_id, v.name, v.phone, v.email, v.role, v.access_tier::access_tier, v.lang
from target t
join (values
  ('+919876510001', 'Ritika Bisht', 'ritika.bisht@musafircafe.in', 'Outlet Manager', 'outlet_manager', 'English'),
  ('+919876510002', 'Aman Rawat', 'aman.rawat@musafircafe.in', 'Captain / Senior Barista', 'shift_manager', 'Hindi'),
  ('+919876510003', 'Sneha Thapa', 'sneha.thapa@musafircafe.in', 'Barista', 'floor_staff', 'Hindi')
) as v(phone, name, email, role, access_tier, lang) on true
join auth.users u on u.phone = v.phone
where not exists (select 1 from public.users pu where pu.id = u.id);

-- ---------------------------------------------------------------------
-- Org positions — Biller/Cashier intentionally vacant
-- ---------------------------------------------------------------------

with t as (select id as outlet_id from public.outlets where name = 'Musafir Cafe — Mussoorie')
insert into public.org_positions (outlet_id, role_title, reports_to_position_id, filled_by, level)
select t.outlet_id, 'Outlet Manager', null, (select id from public.users where phone = '+919876510001'), 2
from t
where not exists (
  select 1 from public.org_positions op where op.outlet_id = t.outlet_id and op.role_title = 'Outlet Manager'
);

with t as (select id as outlet_id from public.outlets where name = 'Musafir Cafe — Mussoorie')
insert into public.org_positions (outlet_id, role_title, reports_to_position_id, filled_by, level)
select t.outlet_id, v.role_title,
  (select id from public.org_positions where outlet_id = t.outlet_id and role_title = 'Outlet Manager'),
  v.filled_by, v.level
from t
join (values
  ('Captain / Senior Barista', (select id from public.users where phone = '+919876510002'), 1),
  ('Barista', (select id from public.users where phone = '+919876510003'), 1),
  ('Biller / Cashier', null::uuid, 1) -- vacant, by design
) as v(role_title, filled_by, level) on true
where not exists (
  select 1 from public.org_positions op where op.outlet_id = t.outlet_id and op.role_title = v.role_title
);

-- ---------------------------------------------------------------------
-- Menu items (docs/01_Menu_and_Recipes.md)
-- ---------------------------------------------------------------------

with t as (select id as outlet_id from public.outlets where name = 'Musafir Cafe — Mussoorie')
insert into public.menu_items (outlet_id, name, category, price)
select t.outlet_id, v.name, v.category, v.price
from t
join (values
  ('Americano','Basic Coffee',130),
  ('Cappuccino','Basic Coffee',150),
  ('Macchiato','Basic Coffee',140),
  ('Espresso','Basic Coffee',110),
  ('Latte','Basic Coffee',160),
  ('Iced Americano','Cold Coffee',150),
  ('Iced Latte','Cold Coffee',180),
  ('Iced Mocha','Cold Coffee',200),
  ('Cold Brew','Cold Coffee',190),
  ('Nitro Cold Brew','Cold Coffee',220),
  ('Green Tea','Tea & Non-Coffee',120),
  ('Hot Chocolate','Tea & Non-Coffee',170),
  ('Iced Tea','Tea & Non-Coffee',140),
  ('Caramel Macchiato','Specialty Drinks',210),
  ('Vanilla Latte','Specialty Drinks',190),
  ('Hazelnut Mocha','Specialty Drinks',220),
  ('Chai Latte','Specialty Drinks',150),
  ('Matcha Latte','Specialty Drinks',210),
  ('Croissants','Bakery & Snacks',140),
  ('Muffins (Blueberry, Chocolate, Plain)','Bakery & Snacks',130),
  ('Scones','Bakery & Snacks',150),
  ('Cookies (Chocolate, Oatmeal, Sugar)','Bakery & Snacks',90),
  ('Bagels (Cream Cheese or Butter)','Bakery & Snacks',120)
) as v(name, category, price) on true
where not exists (
  select 1 from public.menu_items mi where mi.outlet_id = t.outlet_id and mi.name = v.name
);

-- ---------------------------------------------------------------------
-- Machines (docs/02_Equipment_Master_DB.md)
-- ---------------------------------------------------------------------

with t as (select id as outlet_id from public.outlets where name = 'Musafir Cafe — Mussoorie')
insert into public.machines (outlet_id, name, type)
select t.outlet_id, v.name, v.type
from t
join (values
  ('Benki Bombat 2GR', 'Espresso Machine'),
  ('Mazzer Super Jolly Electronic', 'Grinder')
) as v(name, type) on true
where not exists (select 1 from public.machines m where m.outlet_id = t.outlet_id and m.name = v.name);

-- ---------------------------------------------------------------------
-- Base recipes — bakery items excluded (sourced pre-made, service-only)
-- ---------------------------------------------------------------------

with t as (select id as outlet_id from public.outlets where name = 'Musafir Cafe — Mussoorie'),
     head_barista as (select id from public.users where phone = '+919876510002')
insert into public.recipes (outlet_id, menu_item_id, steps, owner_id, version, status, approved_by, approved_at)
select t.outlet_id, mi.id, v.steps, (select id from head_barista), 1, 'approved'::approval_status,
  (select id from head_barista), now()
from t
join (values
  ('Espresso', $$18g fine-ground coffee, double basket
Extract 36g liquid in 25–30 seconds
Base shot for all espresso-based drinks below$$),
  ('Americano', $$1 shot espresso (single) or 2 shots (double, on request)
Top with 150ml hot water
Serve immediately, no stirring required$$),
  ('Cappuccino', $$1 double shot espresso
120ml milk, steamed to microfoam, ~60–65°C
1:1:1 ratio approx — espresso, steamed milk, foam
Dust with cocoa powder (optional, ask customer)$$),
  ('Macchiato', $$1 double shot espresso
Top with a small dollop of steamed milk foam only (no liquid milk)$$),
  ('Latte', $$1 double shot espresso
180ml steamed milk, thin microfoam layer
Optional latte art if trained$$),
  ('Iced Americano', $$1 double shot espresso, poured over ice
Top with 120ml cold water
Serve in tall glass with ice to rim$$),
  ('Iced Latte', $$1 double shot espresso over ice
180ml cold milk
Light stir before serving$$),
  ('Cold Brew', $$Pre-batched: coarse ground coffee steeped in cold water 16–18 hours, 1:8 ratio
Serve 200ml over ice, no dilution needed (already batch-diluted)$$),
  ('Nitro Cold Brew', $$Cold brew concentrate charged through nitro tap
Serve straight, no ice (nitro creates natural cascade and creamy head)$$),
  ('Caramel Macchiato', $$1 double shot espresso
180ml steamed milk with vanilla syrup (2 pumps)
Top with caramel drizzle in a crosshatch pattern$$),
  ('Chai Latte', $$Chai concentrate (pre-brewed with masala spice mix), 90ml
150ml steamed milk
Combine and serve hot; dust with cinnamon on request$$),
  ('Matcha Latte', $$2g culinary-grade matcha, whisked with 30ml hot water until frothy
180ml steamed milk
Combine, no sugar added unless requested$$)
) as v(item, steps) on true
join public.menu_items mi on mi.outlet_id = t.outlet_id and mi.name = v.item
where not exists (
  select 1 from public.recipes r where r.outlet_id = t.outlet_id and r.menu_item_id = mi.id
);

-- ---------------------------------------------------------------------
-- Recipe variants (customisation & improv layer)
-- ---------------------------------------------------------------------

with t as (select id as outlet_id from public.outlets where name = 'Musafir Cafe — Mussoorie')
insert into public.recipe_variants (base_recipe_id, outlet_id, description, submitted_by, status, approved_by, approved_at, is_standing_option)
select r.id, t.outlet_id, v.description,
  (select id from public.users where phone = '+919876510003'),
  v.status::approval_status,
  case when v.status = 'approved' then (select id from public.users where phone = '+919876510002') end,
  case when v.status = 'approved' then now() end,
  v.is_standing
from t
join (values
  ('Iced Latte', 'Oat milk swap', 'pending', false),
  ('Chai Latte', 'Half-sugar', 'approved', true)
) as v(item, description, status, is_standing) on true
join public.menu_items mi on mi.outlet_id = t.outlet_id and mi.name = v.item
join public.recipes r on r.outlet_id = t.outlet_id and r.menu_item_id = mi.id
where not exists (
  select 1 from public.recipe_variants rv where rv.base_recipe_id = r.id and rv.description = v.description
);

-- ---------------------------------------------------------------------
-- Customers (docs/03_Customers.md)
-- ---------------------------------------------------------------------

with t as (select id as outlet_id from public.outlets where name = 'Musafir Cafe — Mussoorie')
insert into public.customers (outlet_id, name, phone, preferences)
select t.outlet_id, v.name, v.phone, v.preferences
from t
join (values
  ('Shweta Malhotra', '+919001122001', 'Cappuccino, no sugar. Usually visits weekday afternoons.'),
  ('Rohan Kapoor', '+919001122002', 'Double espresso, extra hot. Regular, comes in before opening rush.'),
  ('Priya Negi', '+919001122003', 'Iced Latte, oat milk swap. Studies at the corner table most evenings.'),
  ('Vikram Chauhan', '+919001122004', 'Americano, black, no additions. Comes with a laptop, stays long.'),
  ('Ananya Rawat', '+919001122005', 'Chai Latte, half-sugar. Local resident, weekend regular.'),
  ('Farhan Sheikh', '+919001122006', 'Cold Brew, extra ice. Tourist-season regular — visits when in Mussoorie.'),
  ('Meera Joshi', '+919001122007', 'Matcha Latte, no honey. Allergic to nuts — flag on any bakery order.'),
  ('Devansh Bisht', '+919001122008', 'Cappuccino with extra foam. Brings his dog, prefers outdoor seating.'),
  ('Kavya Menon', '+919001122009', 'Caramel Macchiato, extra caramel drizzle. Celebrates birthday here annually.'),
  ('Arjun Thakur', '+919001122010', $$Hot Chocolate, kids' portion. Comes with family on weekends.$$)
) as v(name, phone, preferences) on true
where not exists (select 1 from public.customers c where c.outlet_id = t.outlet_id and c.phone = v.phone);

-- ---------------------------------------------------------------------
-- Vendors (docs/04_Vendors.md)
-- ---------------------------------------------------------------------

with t as (select id as outlet_id from public.outlets where name = 'Musafir Cafe — Mussoorie')
insert into public.vendors (outlet_id, name, category, supplies)
select t.outlet_id, v.name, v.category, v.supplies
from t
join (values
  ('Hilltop Roastery Co.', 'Coffee', 'Roasted coffee beans (house blend + single origin)'),
  ('Kaapi Solutions Service Partner — Dehradun', 'Equipment', 'Machine & grinder sales, servicing, AMC'),
  ('Doon Valley Dairy Suppliers', 'Dairy', 'Milk, cream, butter'),
  ('Hilltop Bakers', 'Bakery', 'Croissants, muffins, scones, cookies, bagels (daily delivery)'),
  ('Mussoorie Fresh Farms', 'Produce', 'Fruits, vegetables (for seasonal specials, garnish)'),
  ('Himalayan Beverage Distributors', 'Beverage', 'Syrups, bottled water, soft drinks, tea leaves'),
  ('Rawat General Maintenance', 'Maintenance', 'Plumbing, electrical, general repairs'),
  ('EcoPack Uttarakhand', 'Packaging', 'Cups, lids, napkins, takeaway containers')
) as v(name, category, supplies) on true
where not exists (select 1 from public.vendors ve where ve.outlet_id = t.outlet_id and ve.name = v.name);

-- ---------------------------------------------------------------------
-- SOPs (docs/05_SOPs_and_Checklists.md) — drafts, per the doc's title
-- ---------------------------------------------------------------------

with t as (select id as outlet_id from public.outlets where name = 'Musafir Cafe — Mussoorie'),
     owner as (select id from public.users where phone = '+919876510001')
insert into public.sops (outlet_id, topic, linked_machine_id, content, owner_id, version, status)
select t.outlet_id, v.topic, m.id, v.content, (select id from owner), 1, 'draft'::approval_status
from t
join (values
  ('Opening Checklist', null::text, $$Unlock and switch on all equipment (espresso machine, grinder, POS)
Machine warm-up — 15 minutes minimum before first shot (photo proof)
Grinder calibration check — pull a test shot, confirm 25–30 second extraction (reading: extraction time in seconds)
Milk stock check — confirm sufficient stock for the shift (voice confirm)
Wipe down counters, restock napkins/sugar/stirrers
Review handover notes from previous shift, acknowledge or flag discrepancy
Cash float count (reading: ₹ amount)$$),
  ('Closing Checklist', null::text, $$Machine backflush and clean (photo proof, per Machine Cleaning SOP)
Grinder hopper emptied and wiped if closing for the night
Till count and reconciliation (reading: ₹ amount)
Wastage log submitted (via Tell — voice or photo)
Fridge and dairy stock check, note anything nearing expiry
Floor swept, chairs stacked, trash taken out
All equipment powered down except fridge$$),
  ('Machine Cleaning SOP', 'Benki Bombat 2GR', $$Backflush with blind filter and cleaning detergent — daily, end of day
Wipe steam wand after every use, purge before and after steaming
Group head cleaned with brush — daily
Full descale — every 4–6 weeks depending on water hardness (compliance-style reminder, not a daily task)$$),
  ('Milk Steaming SOP', null::text, $$Cold milk only, fill pitcher to just below the spout line
Purge steam wand before inserting
Position wand just below milk surface for aeration (5–8 seconds), then submerge for heating
Target 60–65°C (do not exceed 70°C — scalding affects taste)
Swirl to integrate foam before pouring$$),
  ('Order-Taking SOP', null::text, $$Greet customer, confirm dine-in or takeaway
Confirm any customisation (sugar level, milk type) at time of order
Repeat order back before billing
For repeat customers, check customer notes if available (e.g. "usual order")$$),
  ('Spill / Breakage SOP', null::text, $$Cordon off the area if there's a slip hazard
Clean up immediately
Log via Tell (voice + photo) — becomes an Observation unless injury or ongoing hazard, in which case it's an Incident requiring resolution before shift close$$),
  ('Customer Complaint Handling SOP', null::text, $$Listen without interrupting, acknowledge the issue
Offer to remake the drink or adjust the bill, at staff discretion for minor issues
For anything beyond a simple remake, escalate to Outlet Manager during the shift
Log the interaction via Tell — this feeds the judgment-call capture mechanism if a discretionary call was made$$)
) as v(topic, machine_name, content) on true
left join public.machines m on m.outlet_id = t.outlet_id and m.name = v.machine_name
where not exists (select 1 from public.sops s where s.outlet_id = t.outlet_id and s.topic = v.topic);

-- ---------------------------------------------------------------------
-- Checklist items (derived from the Opening/Closing checklists above)
-- ---------------------------------------------------------------------

with t as (select id as outlet_id from public.outlets where name = 'Musafir Cafe — Mussoorie')
insert into public.checklist_items (outlet_id, title, linked_sop_id, proof_type, required, category)
select t.outlet_id, v.title, s.id, v.proof_type::proof_type, v.required, v.category::checklist_category
from t
join (values
  ('Machine warm-up', 'Machine Cleaning SOP'::text, 'photo', true, 'opening'),
  ('Grinder calibration check', null::text, 'reading', true, 'opening'),
  ('Milk stock check', null::text, 'voice', true, 'opening'),
  ('Review handover notes from previous shift', null::text, 'confirm', true, 'opening'),
  ('Cash float count', null::text, 'reading', true, 'opening'),
  ('Wipe down counters, restock napkins/sugar/stirrers', null::text, 'confirm', false, 'opening'),
  ('Machine backflush and clean', 'Machine Cleaning SOP', 'photo', true, 'closing'),
  ('Till count and reconciliation', null::text, 'reading', true, 'closing'),
  ('Wastage log submitted', null::text, 'voice', true, 'closing'),
  ('Grinder hopper emptied and wiped', null::text, 'confirm', false, 'closing'),
  ('Fridge and dairy stock check', null::text, 'confirm', false, 'closing'),
  ('Floor swept, chairs stacked, trash taken out', null::text, 'confirm', false, 'closing'),
  ('All equipment powered down except fridge', null::text, 'confirm', false, 'closing')
) as v(title, sop_topic, proof_type, required, category) on true
left join public.sops s on s.outlet_id = t.outlet_id and s.topic = v.sop_topic
where not exists (select 1 from public.checklist_items ci where ci.outlet_id = t.outlet_id and ci.title = v.title);

-- ---------------------------------------------------------------------
-- Training modules (docs/06_Training_Modules.md) — drafts
-- ---------------------------------------------------------------------

with t as (select id as outlet_id from public.outlets where name = 'Musafir Cafe — Mussoorie'),
     owner as (select id from public.users where phone = '+919876510001')
insert into public.training_modules (outlet_id, title, content, owner_id, version, status)
select t.outlet_id, v.title, v.content, (select id from owner), 1, 'draft'::approval_status
from t
join (values
  ('Module 1: Coffee Fundamentals', $$Coffee origins, processing basics (washed vs natural)
Roast levels and how they affect taste
Reading the house menu and ingredient list$$),
  ('Module 2: Espresso Extraction Basics', $$Dose, yield, time — the three levers of a shot
Recognising under-extraction (sour, thin) vs over-extraction (bitter, harsh)
Basic grinder adjustment for dial-in$$),
  ('Module 3: Milk Steaming & Latte Art Basics', $$Microfoam technique
Temperature control
Basic pour patterns (heart, rosette) — optional add-on skill$$),
  ('Module 4: Customer Service & Complaint Handling', $$Greeting and order-taking standards
De-escalation basics for an unhappy customer
When to use discretion vs when to escalate$$),
  ('Module 5: Cash Handling & POS Basics', $$Till float and reconciliation procedure
Basic POS order entry and billing
Handling refunds/voids (requires manager sign-off)$$),
  ('Module 6: Food Safety & Hygiene Basics', $$Handwashing and glove use standards
Dairy storage temperature checks
Allergen awareness (nuts, gluten) — cross-reference customer notes$$),
  ('Module 7: Opening & Closing Procedures', $$Full walkthrough of the opening and closing checklists
Proof requirements (photo, reading, voice) and why they matter$$),
  ('Module 8: Machine Troubleshooting Basics', $$Common Benki Bombat 2GR issues and first-line fixes
When to escalate to a service call vs when it's a quick fix
Logging every incident, even resolved ones$$)
) as v(title, content) on true
where not exists (select 1 from public.training_modules tm where tm.outlet_id = t.outlet_id and tm.title = v.title);

-- ---------------------------------------------------------------------
-- Training progress (dummy state from docs/06_Training_Modules.md)
-- ---------------------------------------------------------------------

with t as (select id as outlet_id from public.outlets where name = 'Musafir Cafe — Mussoorie')
insert into public.training_progress (outlet_id, user_id, training_module_id, status, completed_at)
select t.outlet_id, u.id, tm.id, v.status, case when v.status = 'done' then now() end
from t
join (values
  ('+919876510002', 'Module 1: Coffee Fundamentals', 'done'),
  ('+919876510002', 'Module 2: Espresso Extraction Basics', 'done'),
  ('+919876510002', 'Module 3: Milk Steaming & Latte Art Basics', 'done'),
  ('+919876510002', 'Module 4: Customer Service & Complaint Handling', 'done'),
  ('+919876510002', 'Module 5: Cash Handling & POS Basics', 'done'),
  ('+919876510002', 'Module 6: Food Safety & Hygiene Basics', 'done'),
  ('+919876510002', 'Module 7: Opening & Closing Procedures', 'done'),
  ('+919876510002', 'Module 8: Machine Troubleshooting Basics', 'done'),
  ('+919876510003', 'Module 1: Coffee Fundamentals', 'done'),
  ('+919876510003', 'Module 2: Espresso Extraction Basics', 'done'),
  ('+919876510003', 'Module 3: Milk Steaming & Latte Art Basics', 'in_progress'),
  ('+919876510003', 'Module 4: Customer Service & Complaint Handling', 'done'),
  ('+919876510003', 'Module 5: Cash Handling & POS Basics', 'not_started'),
  ('+919876510003', 'Module 6: Food Safety & Hygiene Basics', 'done'),
  ('+919876510003', 'Module 7: Opening & Closing Procedures', 'done'),
  ('+919876510003', 'Module 8: Machine Troubleshooting Basics', 'not_started')
) as v(phone, module_title, status) on true
join public.users u on u.phone = v.phone
join public.training_modules tm on tm.outlet_id = t.outlet_id and tm.title = v.module_title
where not exists (
  select 1 from public.training_progress tp where tp.user_id = u.id and tp.training_module_id = tm.id
);

-- ---------------------------------------------------------------------
-- Compliance reminders (docs/07_Compliance_DB.md dummy status table)
-- ---------------------------------------------------------------------

with t as (select id as outlet_id from public.outlets where name = 'Musafir Cafe — Mussoorie'),
     manager as (select id from public.users where phone = '+919876510001')
insert into public.compliance_reminders (outlet_id, topic, due_date, process_duration_days, status, proof_document_url, cleared_by)
select t.outlet_id, v.topic, v.due_date, v.process_duration_days, v.status::compliance_status, v.proof_url,
  case when v.status = 'cleared' then (select id from manager) end
from t
join (values
  ('FSSAI License', current_date + 15, 30, 'upcoming', null::text),
  ('Fire Safety NOC', current_date - 21, 20, 'cleared', 'https://placeholder.outletbrain.dev/proof/fire-safety-noc.pdf'),
  ('Shops & Establishment Registration', current_date + 40, 15, 'upcoming', null::text),
  ('Trade License', current_date - 60, 25, 'cleared', 'https://placeholder.outletbrain.dev/proof/trade-license.pdf')
) as v(topic, due_date, process_duration_days, status, proof_url) on true
where not exists (select 1 from public.compliance_reminders cr where cr.outlet_id = t.outlet_id and cr.topic = v.topic);

-- ---------------------------------------------------------------------
-- Inventory items & facility areas — added for the Tell v4 rebuild's
-- subject taxonomy (Schema Living Doc v4 §0). Neither has a source in the
-- 8 dummy-data docs: this list is hand-written from item names that do
-- appear incidentally elsewhere (oat milk / vanilla syrup in
-- 01_Menu_and_Recipes.md's recipe variants, milk/dairy/sugar/napkins in
-- 05_SOPs_and_Checklists.md's opening/closing checklists). Facility areas
-- have no grounding at all — a plain, generic small set. Flagged in
-- SCHEMA_NOTES.md; treat both as placeholders to correct once real
-- inventory/facility lists exist.
-- ---------------------------------------------------------------------

with t as (select id as outlet_id from public.outlets where name = 'Musafir Cafe — Mussoorie')
insert into public.inventory_items (outlet_id, name)
select t.outlet_id, v.name
from t
join (values
  ('Milk'), ('Oat Milk'), ('Coffee Beans'), ('Sugar'), ('Vanilla Syrup'), ('Napkins'), ('Stirrers')
) as v(name) on true
where not exists (select 1 from public.inventory_items i where i.outlet_id = t.outlet_id and i.name = v.name);

with t as (select id as outlet_id from public.outlets where name = 'Musafir Cafe — Mussoorie')
insert into public.facility_areas (outlet_id, name)
select t.outlet_id, v.name
from t
join (values
  ('Seating Area'), ('Counter'), ('Storage Room'), ('Restroom')
) as v(name) on true
where not exists (select 1 from public.facility_areas f where f.outlet_id = t.outlet_id and f.name = v.name);

commit;

-- ---------------------------------------------------------------------
-- Verification — row counts per seeded table. Run this block again on its
-- own any time to check current state (it's outside the transaction above).
-- ---------------------------------------------------------------------

select 'brands' as table_name, count(*) from public.brands
union all select 'outlets', count(*) from public.outlets
union all select 'users', count(*) from public.users
union all select 'org_positions', count(*) from public.org_positions
union all select 'menu_items', count(*) from public.menu_items
union all select 'machines', count(*) from public.machines
union all select 'recipes', count(*) from public.recipes
union all select 'recipe_variants', count(*) from public.recipe_variants
union all select 'customers', count(*) from public.customers
union all select 'vendors', count(*) from public.vendors
union all select 'sops', count(*) from public.sops
union all select 'checklist_items', count(*) from public.checklist_items
union all select 'training_modules', count(*) from public.training_modules
union all select 'training_progress', count(*) from public.training_progress
union all select 'compliance_reminders', count(*) from public.compliance_reminders
union all select 'inventory_items', count(*) from public.inventory_items
union all select 'facility_areas', count(*) from public.facility_areas
order by table_name;
