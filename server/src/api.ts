import type { Request, Response } from "express";
import { getDb, collection, doc, getDoc, getDocs } from "./firestore.js";

const METADATA_ID = "metadata";

function getCollectionNameFromRequest(req: Request): string | null {
  const auth = (req.headers.authorization || (req.headers.Authorization as string | undefined)) as string | undefined;
  let token: string | undefined;
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m) token = m[1].trim();
    else if (!auth.includes(" ") && auth.trim()) token = auth.trim();
  }
  if (!token) {
    const q = (req.query.token || req.query.key || req.query.auth) as string | undefined;
    if (q && q.trim()) token = q.trim();
  }
  if (!token) {
    const h = (req.headers["x-api-key"] || req.headers["x-collection-key"]) as string | undefined;
    if (h && typeof h === "string" && h.trim()) token = h.trim();
  }
  if (!token) return null;
  const cleaned = token.trim().replace(/^\/+/, "");
  return cleaned && !cleaned.includes("/") ? cleaned : null;
}

async function isCollectionEstablished(collectionName: string): Promise<boolean> {
  try {
    const col = collection(getDb(), collectionName);
    const snap = await getDoc(doc(col, METADATA_ID));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function handleListRecipes(req: Request, res: Response): Promise<void> {
  try {
    const collectionName = getCollectionNameFromRequest(req);
    if (!collectionName) {
      res.status(401).json({ error: "Unauthorized: missing cookbook code" });
      return;
    }
    if (!(await isCollectionEstablished(collectionName))) {
      res.status(401).json({ error: "Invalid cookbook code" });
      return;
    }
    const col = collection(getDb(), collectionName);
    const snap = await getDocs(col);
    const recipes: unknown[] = [];
    snap.forEach((d) => {
      if (d.id === METADATA_ID) return;
      const data = d.data();
      const recipe = (data as Record<string, unknown>).id ? data : { ...data, id: d.id };
      recipes.push(recipe);
    });
    res.json(recipes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: `Failed to list recipes: ${msg}` });
  }
}

export async function handleGetRecipe(req: Request, res: Response): Promise<void> {
  try {
    const id = (req.params.id as string) || "";
    if (!id) {
      res.status(400).json({ error: "Missing recipe id" });
      return;
    }
    const collectionName = getCollectionNameFromRequest(req);
    if (!collectionName) {
      res.status(401).json({ error: "Unauthorized: missing cookbook code" });
      return;
    }
    if (!(await isCollectionEstablished(collectionName))) {
      res.status(401).json({ error: "Invalid cookbook code" });
      return;
    }
    const col = collection(getDb(), collectionName);
    const snap = await getDoc(doc(col, id));
    if (!snap.exists()) {
      res.status(404).json({ error: `Recipe ${id} not found` });
      return;
    }
    const data = snap.data() as Record<string, unknown>;
    const recipe = data.id ? data : { ...data, id: snap.id };
    res.json(recipe);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: `Failed to get recipe: ${msg}` });
  }
}

export async function handleGetMetadata(req: Request, res: Response): Promise<void> {
  try {
    const collectionName = getCollectionNameFromRequest(req);
    if (!collectionName) {
      res.status(401).json({ error: "Unauthorized: missing cookbook code" });
      return;
    }
    if (!(await isCollectionEstablished(collectionName))) {
      res.status(401).json({ error: "Invalid cookbook code" });
      return;
    }
    const col = collection(getDb(), collectionName);
    const snap = await getDoc(doc(col, METADATA_ID));
    if (!snap.exists()) {
      res.json(null);
      return;
    }
    res.json(snap.data());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: `Failed to get metadata: ${msg}` });
  }
}
