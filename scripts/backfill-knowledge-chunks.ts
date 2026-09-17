/**
 * Populates knowledge_chunks (the unified vector-search index behind the
 * merged Ask/Tell flow) from the outlet's current data — the current
 * source of that data is the SQL seed script, since there's no admin UI
 * yet to create/edit recipes, SOPs, etc. Run this once after seeding, and
 * again by hand any time that underlying data changes, until a real admin
 * UI + on-write embedding pipeline exists.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY and VOYAGE_API_KEY in .env.local.
 *
 * Usage:
 *   npm run backfill-knowledge
 *
 * Safe to re-run: upserts on (source_table, source_id), never duplicates.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_MODEL = process.env.VOYAGE_MODEL || "voyage-3-lite";
const OUTLET_NAME = "Musafir Cafe — Mussoorie";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(1);
}
if (!VOYAGE_API_KEY) {
  console.error("Missing VOYAGE_API_KEY in .env.local — get one at dash.voyageai.com → API Keys.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function embedDocuments(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${VOYAGE_API_KEY}` },
    body: JSON.stringify({ input: texts, model: VOYAGE_MODEL, input_type: "document" }),
  });
  if (!response.ok) {
    throw new Error(`Voyage embeddings request failed (${response.status}): ${await response.text()}`);
  }
  const json = (await response.json()) as { data: { embedding: number[]; index: number }[] };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

type ChunkInput = { sourceTable: string; sourceId: string; title: string; content: string };

async function main() {
  const { data: outlet, error: outletErr } = await supabase
    .from("outlets")
    .select("id")
    .eq("name", OUTLET_NAME)
    .single();
  if (outletErr || !outlet) {
    console.error(`Could not find outlet "${OUTLET_NAME}" — did seed.sql run against this project?`);
    process.exit(1);
  }
  const outletId = outlet.id as string;

  const chunks: ChunkInput[] = [];

  const [menuItems, recipes, sops, trainingModules, complianceReminders, customers, vendors, machines, inventoryItems, facilityAreas, users] =
    await Promise.all([
      supabase.from("menu_items").select("id, name, category, price").eq("outlet_id", outletId),
      (supabase as any).from("recipes").select("id, steps, menu_items(name)").eq("outlet_id", outletId),
      supabase.from("sops").select("id, topic, content").eq("outlet_id", outletId),
      supabase.from("training_modules").select("id, title, content").eq("outlet_id", outletId),
      supabase.from("compliance_reminders").select("id, topic, status, due_date").eq("outlet_id", outletId),
      supabase.from("customers").select("id, name, phone, preferences").eq("outlet_id", outletId),
      supabase.from("vendors").select("id, name, category, supplies").eq("outlet_id", outletId),
      supabase.from("machines").select("id, name, type").eq("outlet_id", outletId),
      supabase.from("inventory_items").select("id, name").eq("outlet_id", outletId),
      supabase.from("facility_areas").select("id, name").eq("outlet_id", outletId),
      supabase.from("users").select("id, name, role").eq("outlet_id", outletId),
    ]);

  for (const m of menuItems.data ?? []) {
    chunks.push({ sourceTable: "menu_items", sourceId: m.id, title: m.name, content: `${m.name} (${m.category}) — ₹${m.price}` });
  }
  for (const r of recipes.data ?? []) {
    const itemName = r.menu_items?.name ?? "Unknown item";
    chunks.push({ sourceTable: "recipes", sourceId: r.id, title: itemName, content: `${itemName} recipe:\n${r.steps}` });
  }
  for (const s of sops.data ?? []) {
    chunks.push({ sourceTable: "sops", sourceId: s.id, title: s.topic, content: s.content ?? "" });
  }
  for (const t of trainingModules.data ?? []) {
    chunks.push({ sourceTable: "training_modules", sourceId: t.id, title: t.title, content: t.content ?? "" });
  }
  for (const c of complianceReminders.data ?? []) {
    chunks.push({
      sourceTable: "compliance_reminders",
      sourceId: c.id,
      title: c.topic,
      content: `${c.topic}: ${c.status}, due ${c.due_date}`,
    });
  }
  for (const c of customers.data ?? []) {
    chunks.push({
      sourceTable: "customers",
      sourceId: c.id,
      title: c.name,
      content: `Customer ${c.name} (${c.phone ?? "no phone"}): ${c.preferences ?? "no notes"}`,
    });
  }
  for (const v of vendors.data ?? []) {
    chunks.push({
      sourceTable: "vendors",
      sourceId: v.id,
      title: v.name,
      content: `Vendor ${v.name} (${v.category ?? "uncategorized"}): ${v.supplies ?? ""}`,
    });
  }
  for (const m of machines.data ?? []) {
    chunks.push({ sourceTable: "machines", sourceId: m.id, title: m.name, content: `${m.name} (${m.type ?? "equipment"})` });
  }
  for (const i of inventoryItems.data ?? []) {
    chunks.push({ sourceTable: "inventory_items", sourceId: i.id, title: i.name, content: `Inventory item: ${i.name}` });
  }
  for (const f of facilityAreas.data ?? []) {
    chunks.push({ sourceTable: "facility_areas", sourceId: f.id, title: f.name, content: `Facility area: ${f.name}` });
  }
  for (const u of users.data ?? []) {
    chunks.push({ sourceTable: "users", sourceId: u.id, title: u.name, content: `Staff member ${u.name} — ${u.role}` });
  }

  console.log(`Embedding ${chunks.length} chunks via Voyage (${VOYAGE_MODEL})...`);

  // Batch to keep each Voyage request a reasonable size.
  const BATCH_SIZE = 100;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const embeddings = await embedDocuments(batch.map((c) => c.content));
    const rows = batch.map((c, j) => ({
      outlet_id: outletId,
      source_table: c.sourceTable,
      source_id: c.sourceId,
      title: c.title,
      content: c.content,
      embedding: embeddings[j],
    }));
    const { error } = await supabase.from("knowledge_chunks").upsert(rows, { onConflict: "source_table,source_id" });
    if (error) throw new Error(`Failed to upsert knowledge_chunks batch: ${error.message}`);
    console.log(`  ${Math.min(i + BATCH_SIZE, chunks.length)} / ${chunks.length}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
