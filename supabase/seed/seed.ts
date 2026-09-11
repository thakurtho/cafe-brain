/**
 * Seeds the Musafir Cafe dummy data from /docs into Supabase.
 *
 * Only tables the 8 dummy-data docs actually contain data for get seeded:
 * brands, outlets, users, org_positions, menu_items, recipes,
 * recipe_variants, machines, customers, vendors, sops, checklist_items,
 * training_modules, training_progress, compliance_reminders.
 *
 * Everything else the migrations create (sessions, messages, tasks,
 * incidents, wastage_entries, scheduled_shifts, shift_openings/handovers,
 * patterns, observations, fyis, judgment_calls, knowledge_gaps,
 * pos_permissions, pos_synced_tasks, entity_links, report_definitions,
 * report_instances) is intentionally left empty — there's no real dummy
 * data for it in /docs, and inventing fake session/shift history wasn't
 * part of the brief.
 *
 * Usage:
 *   cp .env.example .env.local   # fill in your Supabase project values
 *   npm install
 *   npm run seed
 *
 * Safe to re-run: uses find-or-create / upsert throughout rather than
 * blind inserts, keyed on natural identifiers (name, phone, title, etc).
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Copy .env.example to .env.local and fill in your project's values."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

function normalizePhone(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

async function findOrCreate<T extends Record<string, unknown>>(
  table: string,
  match: Record<string, unknown>,
  insert: T
): Promise<string> {
  const { data: existing, error: selectError } = await supabase
    .from(table)
    .select("id")
    .match(match)
    .maybeSingle();

  if (selectError) throw new Error(`${table} select failed: ${selectError.message}`);
  if (existing) return (existing as { id: string }).id;

  const { data: created, error: insertError } = await supabase
    .from(table)
    .insert(insert)
    .select("id")
    .single();

  if (insertError) throw new Error(`${table} insert failed: ${insertError.message}`);
  return (created as { id: string }).id;
}

async function getOrCreateAuthUser(phone: string, name: string): Promise<string> {
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    phone,
    phone_confirm: true,
    user_metadata: { name },
  });

  if (!createError && created?.user) return created.user.id;

  // Already exists — look it up. listUsers doesn't support filtering by
  // phone server-side, so page through (fine at this data volume).
  const { data: list, error: listError } = await supabase.auth.admin.listUsers({
    perPage: 200,
  });
  if (listError) throw new Error(`auth listUsers failed: ${listError.message}`);

  const match = list.users.find((u) => u.phone === phone.replace(/^\+/, ""));
  if (match) return match.id;

  throw new Error(
    `Could not create or find auth user for ${name} (${phone}): ${createError?.message}`
  );
}

// ---------------------------------------------------------------------
// Dummy data — transcribed from docs/00_Brand_Outlet_Users.md through
// docs/07_Compliance_DB.md
// ---------------------------------------------------------------------

async function main() {
  console.log("Seeding Musafir Cafe...\n");

  // --- Brand & outlet (docs/00_Brand_Outlet_Users.md) ---
  const brandId = await findOrCreate(
    "brands",
    { name: "Musafir Cafe" },
    { name: "Musafir Cafe" }
  );
  console.log("brand:", brandId);

  const outletId = await findOrCreate(
    "outlets",
    { brand_id: brandId, name: "Musafir Cafe — Mussoorie" },
    {
      brand_id: brandId,
      name: "Musafir Cafe — Mussoorie",
      location: "Mall Road, Mussoorie, Uttarakhand",
    }
  );
  console.log("outlet:", outletId);

  // --- Users ---
  const staff = [
    {
      name: "Ritika Bisht",
      phone: normalizePhone("+91 98765 10001"),
      email: "ritika.bisht@musafircafe.in",
      role: "Outlet Manager",
      access_tier: "outlet_manager",
      language_preference: "English",
    },
    {
      name: "Aman Rawat",
      phone: normalizePhone("+91 98765 10002"),
      email: "aman.rawat@musafircafe.in",
      role: "Captain / Senior Barista",
      access_tier: "shift_manager",
      language_preference: "Hindi",
    },
    {
      name: "Sneha Thapa",
      phone: normalizePhone("+91 98765 10003"),
      email: "sneha.thapa@musafircafe.in",
      role: "Barista",
      access_tier: "floor_staff",
      language_preference: "Hindi",
    },
  ] as const;

  const userIds: Record<string, string> = {};

  for (const person of staff) {
    const authId = await getOrCreateAuthUser(person.phone, person.name);
    const { error } = await supabase.from("users").upsert(
      {
        id: authId,
        brand_id: brandId,
        outlet_id: outletId,
        name: person.name,
        phone: person.phone,
        email: person.email,
        role: person.role,
        access_tier: person.access_tier,
        language_preference: person.language_preference,
      },
      { onConflict: "id" }
    );
    if (error) throw new Error(`users upsert failed for ${person.name}: ${error.message}`);
    userIds[person.name] = authId;
  }
  console.log("users:", userIds);

  // --- Org positions (Biller/Cashier intentionally vacant) ---
  const outletManagerPositionId = await findOrCreate(
    "org_positions",
    { outlet_id: outletId, role_title: "Outlet Manager" },
    {
      outlet_id: outletId,
      role_title: "Outlet Manager",
      reports_to_position_id: null,
      filled_by: userIds["Ritika Bisht"],
      level: 2,
    }
  );

  await findOrCreate(
    "org_positions",
    { outlet_id: outletId, role_title: "Captain / Senior Barista" },
    {
      outlet_id: outletId,
      role_title: "Captain / Senior Barista",
      reports_to_position_id: outletManagerPositionId,
      filled_by: userIds["Aman Rawat"],
      level: 1,
    }
  );

  await findOrCreate(
    "org_positions",
    { outlet_id: outletId, role_title: "Barista" },
    {
      outlet_id: outletId,
      role_title: "Barista",
      reports_to_position_id: outletManagerPositionId,
      filled_by: userIds["Sneha Thapa"],
      level: 1,
    }
  );

  await findOrCreate(
    "org_positions",
    { outlet_id: outletId, role_title: "Biller / Cashier" },
    {
      outlet_id: outletId,
      role_title: "Biller / Cashier",
      reports_to_position_id: outletManagerPositionId,
      filled_by: null, // vacant, by design — exercises the org-chart vacancy feature
      level: 1,
    }
  );
  console.log("org_positions: done (Biller/Cashier vacant)");

  // --- Menu items (docs/01_Menu_and_Recipes.md) ---
  const menuItems: Array<{ name: string; category: string; price: number }> = [
    { name: "Americano", category: "Basic Coffee", price: 130 },
    { name: "Cappuccino", category: "Basic Coffee", price: 150 },
    { name: "Macchiato", category: "Basic Coffee", price: 140 },
    { name: "Espresso", category: "Basic Coffee", price: 110 },
    { name: "Latte", category: "Basic Coffee", price: 160 },
    { name: "Iced Americano", category: "Cold Coffee", price: 150 },
    { name: "Iced Latte", category: "Cold Coffee", price: 180 },
    { name: "Iced Mocha", category: "Cold Coffee", price: 200 },
    { name: "Cold Brew", category: "Cold Coffee", price: 190 },
    { name: "Nitro Cold Brew", category: "Cold Coffee", price: 220 },
    { name: "Green Tea", category: "Tea & Non-Coffee", price: 120 },
    { name: "Hot Chocolate", category: "Tea & Non-Coffee", price: 170 },
    { name: "Iced Tea", category: "Tea & Non-Coffee", price: 140 },
    { name: "Caramel Macchiato", category: "Specialty Drinks", price: 210 },
    { name: "Vanilla Latte", category: "Specialty Drinks", price: 190 },
    { name: "Hazelnut Mocha", category: "Specialty Drinks", price: 220 },
    { name: "Chai Latte", category: "Specialty Drinks", price: 150 },
    { name: "Matcha Latte", category: "Specialty Drinks", price: 210 },
    { name: "Croissants", category: "Bakery & Snacks", price: 140 },
    { name: "Muffins (Blueberry, Chocolate, Plain)", category: "Bakery & Snacks", price: 130 },
    { name: "Scones", category: "Bakery & Snacks", price: 150 },
    { name: "Cookies (Chocolate, Oatmeal, Sugar)", category: "Bakery & Snacks", price: 90 },
    { name: "Bagels (Cream Cheese or Butter)", category: "Bakery & Snacks", price: 120 },
  ];

  const menuItemIds: Record<string, string> = {};
  for (const item of menuItems) {
    menuItemIds[item.name] = await findOrCreate(
      "menu_items",
      { outlet_id: outletId, name: item.name },
      { outlet_id: outletId, name: item.name, category: item.category, price: item.price }
    );
  }
  console.log(`menu_items: ${Object.keys(menuItemIds).length} items`);

  // --- Machines (docs/02_Equipment_Master_DB.md) ---
  const espressoMachineId = await findOrCreate(
    "machines",
    { outlet_id: outletId, name: "Benki Bombat 2GR" },
    { outlet_id: outletId, name: "Benki Bombat 2GR", type: "Espresso Machine" }
  );
  await findOrCreate(
    "machines",
    { outlet_id: outletId, name: "Mazzer Super Jolly Electronic" },
    { outlet_id: outletId, name: "Mazzer Super Jolly Electronic", type: "Grinder" }
  );
  console.log("machines: done");

  // --- Base recipes (docs/01_Menu_and_Recipes.md) — bakery items excluded
  // (they're sourced pre-made; the doc explicitly says their SOP is
  // plating/service, not preparation).
  const recipes: Array<{ item: string; steps: string }> = [
    {
      item: "Espresso",
      steps:
        "18g fine-ground coffee, double basket\nExtract 36g liquid in 25–30 seconds\nBase shot for all espresso-based drinks below",
    },
    {
      item: "Americano",
      steps:
        "1 shot espresso (single) or 2 shots (double, on request)\nTop with 150ml hot water\nServe immediately, no stirring required",
    },
    {
      item: "Cappuccino",
      steps:
        "1 double shot espresso\n120ml milk, steamed to microfoam, ~60–65°C\n1:1:1 ratio approx — espresso, steamed milk, foam\nDust with cocoa powder (optional, ask customer)",
    },
    {
      item: "Macchiato",
      steps:
        "1 double shot espresso\nTop with a small dollop of steamed milk foam only (no liquid milk)",
    },
    {
      item: "Latte",
      steps:
        "1 double shot espresso\n180ml steamed milk, thin microfoam layer\nOptional latte art if trained",
    },
    {
      item: "Iced Americano",
      steps:
        "1 double shot espresso, poured over ice\nTop with 120ml cold water\nServe in tall glass with ice to rim",
    },
    {
      item: "Iced Latte",
      steps: "1 double shot espresso over ice\n180ml cold milk\nLight stir before serving",
    },
    {
      item: "Cold Brew",
      steps:
        "Pre-batched: coarse ground coffee steeped in cold water 16–18 hours, 1:8 ratio\nServe 200ml over ice, no dilution needed (already batch-diluted)",
    },
    {
      item: "Nitro Cold Brew",
      steps:
        "Cold brew concentrate charged through nitro tap\nServe straight, no ice (nitro creates natural cascade and creamy head)",
    },
    {
      item: "Caramel Macchiato",
      steps:
        "1 double shot espresso\n180ml steamed milk with vanilla syrup (2 pumps)\nTop with caramel drizzle in a crosshatch pattern",
    },
    {
      item: "Chai Latte",
      steps:
        "Chai concentrate (pre-brewed with masala spice mix), 90ml\n150ml steamed milk\nCombine and serve hot; dust with cinnamon on request",
    },
    {
      item: "Matcha Latte",
      steps:
        "2g culinary-grade matcha, whisked with 30ml hot water until frothy\n180ml steamed milk\nCombine, no sugar added unless requested",
    },
  ];

  const recipeIds: Record<string, string> = {};
  for (const r of recipes) {
    const menuItemId = menuItemIds[r.item];
    recipeIds[r.item] = await findOrCreate(
      "recipes",
      { outlet_id: outletId, menu_item_id: menuItemId },
      {
        outlet_id: outletId,
        menu_item_id: menuItemId,
        steps: r.steps,
        owner_id: userIds["Aman Rawat"], // doc: "owner: Head Barista — Aman Rawat"
        version: 1,
        status: "approved",
        approved_by: userIds["Aman Rawat"],
        approved_at: new Date().toISOString(),
      }
    );
  }
  console.log(`recipes: ${Object.keys(recipeIds).length} base recipes`);

  // --- Recipe variants (customisation & improv layer) ---
  await findOrCreate(
    "recipe_variants",
    { base_recipe_id: recipeIds["Iced Latte"], description: "Oat milk swap" },
    {
      base_recipe_id: recipeIds["Iced Latte"],
      outlet_id: outletId,
      description: "Oat milk swap",
      submitted_by: userIds["Sneha Thapa"],
      status: "pending",
      is_standing_option: false,
    }
  );
  await findOrCreate(
    "recipe_variants",
    { base_recipe_id: recipeIds["Chai Latte"], description: "Half-sugar" },
    {
      base_recipe_id: recipeIds["Chai Latte"],
      outlet_id: outletId,
      description: "Half-sugar",
      submitted_by: userIds["Sneha Thapa"],
      status: "approved",
      approved_by: userIds["Aman Rawat"],
      approved_at: new Date().toISOString(),
      is_standing_option: true,
    }
  );
  console.log("recipe_variants: done");

  // --- Customers (docs/03_Customers.md) ---
  const customers: Array<{ name: string; phone: string; preferences: string }> = [
    {
      name: "Shweta Malhotra",
      phone: "+91 90011 22001",
      preferences: "Cappuccino, no sugar. Usually visits weekday afternoons.",
    },
    {
      name: "Rohan Kapoor",
      phone: "+91 90011 22002",
      preferences: "Double espresso, extra hot. Regular, comes in before opening rush.",
    },
    {
      name: "Priya Negi",
      phone: "+91 90011 22003",
      preferences: "Iced Latte, oat milk swap. Studies at the corner table most evenings.",
    },
    {
      name: "Vikram Chauhan",
      phone: "+91 90011 22004",
      preferences: "Americano, black, no additions. Comes with a laptop, stays long.",
    },
    {
      name: "Ananya Rawat",
      phone: "+91 90011 22005",
      preferences: "Chai Latte, half-sugar. Local resident, weekend regular.",
    },
    {
      name: "Farhan Sheikh",
      phone: "+91 90011 22006",
      preferences: "Cold Brew, extra ice. Tourist-season regular — visits when in Mussoorie.",
    },
    {
      name: "Meera Joshi",
      phone: "+91 90011 22007",
      preferences: "Matcha Latte, no honey. Allergic to nuts — flag on any bakery order.",
    },
    {
      name: "Devansh Bisht",
      phone: "+91 90011 22008",
      preferences: "Cappuccino with extra foam. Brings his dog, prefers outdoor seating.",
    },
    {
      name: "Kavya Menon",
      phone: "+91 90011 22009",
      preferences: "Caramel Macchiato, extra caramel drizzle. Celebrates birthday here annually.",
    },
    {
      name: "Arjun Thakur",
      phone: "+91 90011 22010",
      preferences: "Hot Chocolate, kids' portion. Comes with family on weekends.",
    },
  ];

  for (const c of customers) {
    await findOrCreate(
      "customers",
      { outlet_id: outletId, phone: normalizePhone(c.phone) },
      {
        outlet_id: outletId,
        name: c.name,
        phone: normalizePhone(c.phone),
        preferences: c.preferences,
      }
    );
  }
  console.log(`customers: ${customers.length} rows`);

  // --- Vendors (docs/04_Vendors.md) ---
  const vendors: Array<{ category: string; name: string; supplies: string }> = [
    { category: "Coffee", name: "Hilltop Roastery Co.", supplies: "Roasted coffee beans (house blend + single origin)" },
    { category: "Equipment", name: "Kaapi Solutions Service Partner — Dehradun", supplies: "Machine & grinder sales, servicing, AMC" },
    { category: "Dairy", name: "Doon Valley Dairy Suppliers", supplies: "Milk, cream, butter" },
    { category: "Bakery", name: "Hilltop Bakers", supplies: "Croissants, muffins, scones, cookies, bagels (daily delivery)" },
    { category: "Produce", name: "Mussoorie Fresh Farms", supplies: "Fruits, vegetables (for seasonal specials, garnish)" },
    { category: "Beverage", name: "Himalayan Beverage Distributors", supplies: "Syrups, bottled water, soft drinks, tea leaves" },
    { category: "Maintenance", name: "Rawat General Maintenance", supplies: "Plumbing, electrical, general repairs" },
    { category: "Packaging", name: "EcoPack Uttarakhand", supplies: "Cups, lids, napkins, takeaway containers" },
  ];

  for (const v of vendors) {
    await findOrCreate(
      "vendors",
      { outlet_id: outletId, name: v.name },
      { outlet_id: outletId, name: v.name, category: v.category, supplies: v.supplies }
    );
  }
  console.log(`vendors: ${vendors.length} rows`);

  // --- SOPs (docs/05_SOPs_and_Checklists.md) — drafts, per the doc's title ---
  const sops: Array<{ topic: string; content: string; linkedMachineId?: string }> = [
    {
      topic: "Opening Checklist",
      content: [
        "Unlock and switch on all equipment (espresso machine, grinder, POS)",
        "Machine warm-up — 15 minutes minimum before first shot (photo proof)",
        "Grinder calibration check — pull a test shot, confirm 25–30 second extraction (reading: extraction time in seconds)",
        "Milk stock check — confirm sufficient stock for the shift (voice confirm)",
        "Wipe down counters, restock napkins/sugar/stirrers",
        "Review handover notes from previous shift, acknowledge or flag discrepancy",
        "Cash float count (reading: ₹ amount)",
      ].join("\n"),
    },
    {
      topic: "Closing Checklist",
      content: [
        "Machine backflush and clean (photo proof, per Machine Cleaning SOP)",
        "Grinder hopper emptied and wiped if closing for the night",
        "Till count and reconciliation (reading: ₹ amount)",
        "Wastage log submitted (via Tell — voice or photo)",
        "Fridge and dairy stock check, note anything nearing expiry",
        "Floor swept, chairs stacked, trash taken out",
        "All equipment powered down except fridge",
      ].join("\n"),
    },
    {
      topic: "Machine Cleaning SOP",
      linkedMachineId: espressoMachineId,
      content: [
        "Backflush with blind filter and cleaning detergent — daily, end of day",
        "Wipe steam wand after every use, purge before and after steaming",
        "Group head cleaned with brush — daily",
        "Full descale — every 4–6 weeks depending on water hardness (compliance-style reminder, not a daily task)",
      ].join("\n"),
    },
    {
      topic: "Milk Steaming SOP",
      content: [
        "Cold milk only, fill pitcher to just below the spout line",
        "Purge steam wand before inserting",
        "Position wand just below milk surface for aeration (5–8 seconds), then submerge for heating",
        "Target 60–65°C (do not exceed 70°C — scalding affects taste)",
        "Swirl to integrate foam before pouring",
      ].join("\n"),
    },
    {
      topic: "Order-Taking SOP",
      content: [
        "Greet customer, confirm dine-in or takeaway",
        "Confirm any customisation (sugar level, milk type) at time of order",
        "Repeat order back before billing",
        'For repeat customers, check customer notes if available (e.g. "usual order")',
      ].join("\n"),
    },
    {
      topic: "Spill / Breakage SOP",
      content: [
        "Cordon off the area if there's a slip hazard",
        "Clean up immediately",
        "Log via Tell (voice + photo) — becomes an Observation unless injury or ongoing hazard, in which case it's an Incident requiring resolution before shift close",
      ].join("\n"),
    },
    {
      topic: "Customer Complaint Handling SOP",
      content: [
        "Listen without interrupting, acknowledge the issue",
        "Offer to remake the drink or adjust the bill, at staff discretion for minor issues",
        "For anything beyond a simple remake, escalate to Outlet Manager during the shift",
        "Log the interaction via Tell — this feeds the judgment-call capture mechanism if a discretionary call was made",
      ].join("\n"),
    },
  ];

  const sopIds: Record<string, string> = {};
  for (const s of sops) {
    sopIds[s.topic] = await findOrCreate(
      "sops",
      { outlet_id: outletId, topic: s.topic },
      {
        outlet_id: outletId,
        topic: s.topic,
        content: s.content,
        linked_machine_id: s.linkedMachineId ?? null,
        owner_id: userIds["Ritika Bisht"],
        version: 1,
        status: "draft", // doc: "All drafts — meant for testing the capture/approval flow"
      }
    );
  }
  console.log(`sops: ${Object.keys(sopIds).length} rows`);

  // --- Checklist items (derived from the Opening/Closing checklists above) ---
  const checklistItems: Array<{
    title: string;
    category: "opening" | "closing";
    proof_type: "photo" | "reading" | "voice" | "confirm";
    required: boolean;
    linkedSop?: string;
  }> = [
    { title: "Machine warm-up", category: "opening", proof_type: "photo", required: true, linkedSop: "Machine Cleaning SOP" },
    { title: "Grinder calibration check", category: "opening", proof_type: "reading", required: true },
    { title: "Milk stock check", category: "opening", proof_type: "voice", required: true },
    { title: "Review handover notes from previous shift", category: "opening", proof_type: "confirm", required: true },
    { title: "Cash float count", category: "opening", proof_type: "reading", required: true },
    { title: "Wipe down counters, restock napkins/sugar/stirrers", category: "opening", proof_type: "confirm", required: false },
    { title: "Machine backflush and clean", category: "closing", proof_type: "photo", required: true, linkedSop: "Machine Cleaning SOP" },
    { title: "Till count and reconciliation", category: "closing", proof_type: "reading", required: true },
    { title: "Wastage log submitted", category: "closing", proof_type: "voice", required: true },
    { title: "Grinder hopper emptied and wiped", category: "closing", proof_type: "confirm", required: false },
    { title: "Fridge and dairy stock check", category: "closing", proof_type: "confirm", required: false },
    { title: "Floor swept, chairs stacked, trash taken out", category: "closing", proof_type: "confirm", required: false },
    { title: "All equipment powered down except fridge", category: "closing", proof_type: "confirm", required: false },
  ];

  for (const ci of checklistItems) {
    await findOrCreate(
      "checklist_items",
      { outlet_id: outletId, title: ci.title },
      {
        outlet_id: outletId,
        title: ci.title,
        category: ci.category,
        proof_type: ci.proof_type,
        required: ci.required,
        linked_sop_id: ci.linkedSop ? sopIds[ci.linkedSop] : null,
      }
    );
  }
  console.log(`checklist_items: ${checklistItems.length} rows`);

  // --- Training modules (docs/06_Training_Modules.md) — drafts ---
  const trainingModules: Array<{ title: string; content: string }> = [
    {
      title: "Module 1: Coffee Fundamentals",
      content: [
        "Coffee origins, processing basics (washed vs natural)",
        "Roast levels and how they affect taste",
        "Reading the house menu and ingredient list",
      ].join("\n"),
    },
    {
      title: "Module 2: Espresso Extraction Basics",
      content: [
        "Dose, yield, time — the three levers of a shot",
        "Recognising under-extraction (sour, thin) vs over-extraction (bitter, harsh)",
        "Basic grinder adjustment for dial-in",
      ].join("\n"),
    },
    {
      title: "Module 3: Milk Steaming & Latte Art Basics",
      content: [
        "Microfoam technique",
        "Temperature control",
        "Basic pour patterns (heart, rosette) — optional add-on skill",
      ].join("\n"),
    },
    {
      title: "Module 4: Customer Service & Complaint Handling",
      content: [
        "Greeting and order-taking standards",
        "De-escalation basics for an unhappy customer",
        "When to use discretion vs when to escalate",
      ].join("\n"),
    },
    {
      title: "Module 5: Cash Handling & POS Basics",
      content: [
        "Till float and reconciliation procedure",
        "Basic POS order entry and billing",
        "Handling refunds/voids (requires manager sign-off)",
      ].join("\n"),
    },
    {
      title: "Module 6: Food Safety & Hygiene Basics",
      content: [
        "Handwashing and glove use standards",
        "Dairy storage temperature checks",
        "Allergen awareness (nuts, gluten) — cross-reference customer notes",
      ].join("\n"),
    },
    {
      title: "Module 7: Opening & Closing Procedures",
      content: [
        "Full walkthrough of the opening and closing checklists",
        "Proof requirements (photo, reading, voice) and why they matter",
      ].join("\n"),
    },
    {
      title: "Module 8: Machine Troubleshooting Basics",
      content: [
        "Common Benki Bombat 2GR issues and first-line fixes",
        "When to escalate to a service call vs when it's a quick fix",
        "Logging every incident, even resolved ones",
      ].join("\n"),
    },
  ];

  const trainingModuleIds: string[] = [];
  for (const m of trainingModules) {
    const id = await findOrCreate(
      "training_modules",
      { outlet_id: outletId, title: m.title },
      {
        outlet_id: outletId,
        title: m.title,
        content: m.content,
        owner_id: userIds["Ritika Bisht"],
        version: 1,
        status: "draft", // doc: "modules below are drafts for testing training_progress tracking"
      }
    );
    trainingModuleIds.push(id);
  }
  console.log(`training_modules: ${trainingModuleIds.length} rows`);

  // --- Training progress (dummy state from docs/06_Training_Modules.md) ---
  const trainingProgress: Record<string, string[]> = {
    "Aman Rawat": ["done", "done", "done", "done", "done", "done", "done", "done"],
    "Sneha Thapa": [
      "done",
      "done",
      "in_progress",
      "done",
      "not_started",
      "done",
      "done",
      "not_started",
    ],
  };

  for (const [personName, statuses] of Object.entries(trainingProgress)) {
    for (let i = 0; i < statuses.length; i++) {
      const status = statuses[i];
      const { error } = await supabase.from("training_progress").upsert(
        {
          outlet_id: outletId,
          user_id: userIds[personName],
          training_module_id: trainingModuleIds[i],
          status,
          completed_at: status === "done" ? new Date().toISOString() : null,
        },
        { onConflict: "user_id,training_module_id" }
      );
      if (error) throw new Error(`training_progress upsert failed: ${error.message}`);
    }
  }
  console.log("training_progress: done");

  // --- Compliance reminders (docs/07_Compliance_DB.md dummy status table) ---
  const now = Date.now();
  const days = (n: number) => new Date(now + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const placeholderProof = (slug: string) =>
    `https://placeholder.outletbrain.dev/proof/${slug}.pdf`;

  const complianceReminders: Array<{
    topic: string;
    due_date: string;
    process_duration_days: number;
    status: "upcoming" | "overdue" | "cleared";
    proof_document_url?: string;
  }> = [
    {
      topic: "FSSAI License",
      due_date: days(15),
      process_duration_days: 30,
      status: "upcoming",
    },
    {
      topic: "Fire Safety NOC",
      due_date: days(-21), // "cleared 3 weeks ago"
      process_duration_days: 20,
      status: "cleared",
      proof_document_url: placeholderProof("fire-safety-noc"),
    },
    {
      topic: "Shops & Establishment Registration",
      due_date: days(40),
      process_duration_days: 15,
      status: "upcoming",
    },
    {
      topic: "Trade License",
      due_date: days(-60), // "cleared 2 months ago"
      process_duration_days: 25,
      status: "cleared",
      proof_document_url: placeholderProof("trade-license"),
    },
  ];

  for (const c of complianceReminders) {
    await findOrCreate(
      "compliance_reminders",
      { outlet_id: outletId, topic: c.topic },
      {
        outlet_id: outletId,
        topic: c.topic,
        due_date: c.due_date,
        process_duration_days: c.process_duration_days,
        status: c.status,
        proof_document_url: c.proof_document_url ?? null,
        cleared_by: c.status === "cleared" ? userIds["Ritika Bisht"] : null,
      }
    );
  }
  console.log(`compliance_reminders: ${complianceReminders.length} rows`);

  console.log("\nDone seeding Musafir Cafe.");
}

main().catch((err) => {
  console.error("\nSeed failed:", err);
  process.exit(1);
});
