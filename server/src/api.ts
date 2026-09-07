import type { Request, Response } from "express";
import { getDb, getCollection, getFirestoreConfig, collection, doc, getDoc, getDocs } from "./firestore.js";

const METADATA_ID = "metadata";

export async function handleListRecipes(_req: Request, res: Response): Promise<void> {
  try {
    const col = await getCollection();
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
    const col = await getCollection();
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

export async function handleListCollections(_req: Request, res: Response): Promise<void> {
  try {
    // Use REST listCollectionIds for client SDK (no hardcoding)
    const config = getFirestoreConfig();
    const projectId = config.projectId;
    const apiKey = config.apiKey;
    if (projectId && apiKey) {
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:listCollectionIds?key=${apiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageSize: 20 }),
      });
      if (resp.ok) {
        const json = (await resp.json()) as { collectionIds?: string[] };
        res.json({ collections: json.collectionIds || [] });
        return;
      }
    }
    res.json({ collections: [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: `Failed to list collections: ${msg}` });
  }
}

export async function handleGetMetadata(_req: Request, res: Response): Promise<void> {
  try {
    const col = await getCollection();
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
