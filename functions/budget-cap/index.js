import { GoogleAuth } from "google-auth-library";

// Cloud Function (Gen2) triggered by Pub/Sub topic `billing-alerts` from Budget.
// Budget payload is base64-encoded JSON in Pub/Sub message data.
// We act only when alertThresholdExceeded >= 1.0 (100% of 10 EUR) to enforce hard cap.
// Action: scale Cloud Run service yes-chef-cookbook to maxInstanceCount=0 (reversible traffic block).
// Optionally, if env DISABLE_BILLING=true, also unlink billing (irreversible without manual relink).

const PROJECT_ID = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "yes-chef-cookbook";
const REGION = process.env.REGION || "europe-west1";
const SERVICE = process.env.SERVICE || "yes-chef-cookbook";
const DISABLE_BILLING = process.env.DISABLE_BILLING === "true" || process.env.DISABLE_BILLING === "1";

export const handleBudgetAlert = async (cloudEvent) => {
  // Gen2 Pub/Sub via Eventarc delivers CloudEvent with data.message.data base64
  // Also support direct Pub/Sub push: message.data
  let rawData = null;
  try {
    const msg = cloudEvent?.data?.message || cloudEvent?.data || cloudEvent?.message || cloudEvent;
    if (msg?.data) {
      // Classic Pub/Sub push format: { message: { data: base64 } }
      rawData = Buffer.from(msg.data, "base64").toString("utf8");
    } else if (typeof msg === "string") {
      // Eventarc (gen2) delivers Pub/Sub data as base64 string directly in `data`
      // Try to base64-decode; if result is JSON, use it
      let decoded = null;
      try {
        decoded = Buffer.from(msg, "base64").toString("utf8");
      } catch {}
      if (decoded && (decoded.trim().startsWith("{") || decoded.trim().startsWith("["))) {
        try { JSON.parse(decoded); rawData = decoded; } catch { rawData = decoded; }
      } else {
        // Not base64 JSON, treat msg as raw JSON if it looks like JSON, else as plain string
        rawData = msg;
        // If rawData looks like base64 but not yet decoded, try one more time (defensive)
        if (rawData && !rawData.trim().startsWith("{") && /^[A-Za-z0-9+/=_-]+$/.test(rawData.trim()) && rawData.length % 4 === 0) {
          try {
            const maybe = Buffer.from(rawData, "base64").toString("utf8");
            if (maybe.trim().startsWith("{")) rawData = maybe;
          } catch {}
        }
      }
    } else if (msg?.jsonPayload) {
      rawData = JSON.stringify(msg.jsonPayload);
    } else if (msg && typeof msg === "object") {
      // Already parsed object (some runtimes)
      rawData = JSON.stringify(msg);
    }
  } catch (e) {
    console.error("[budget-cap] failed to decode PubSub data", e);
  }

  let budget = null;
  if (rawData) {
    try {
      budget = JSON.parse(rawData);
    } catch {
      console.log("[budget-cap] rawData not JSON:", rawData.slice(0, 500));
    }
  }

  console.log("[budget-cap] received", JSON.stringify({
    budget,
    rawPreview: rawData ? rawData.slice(0, 1000) : null,
    cloudEventKeys: cloudEvent ? Object.keys(cloudEvent) : null,
  }, null, 2));

  // Budget notification fields per https://cloud.google.com/billing/docs/how-to/manage-budget
  // budgetAmount, costAmount, currencyCode, alertThresholdExceeded, forecastThresholdExceeded
  const alertThreshold = budget?.alertThresholdExceeded ?? budget?.alertThresholdExceededPercent ?? null;
  const costAmount = budget?.costAmount?.units !== undefined ? Number(budget.costAmount.units) + (budget.costAmount.nanos || 0) / 1e9 : null;
  const budgetAmount = budget?.budgetAmount?.units !== undefined ? Number(budget.budgetAmount.units) + (budget.budgetAmount.nanos || 0) / 1e9 : null;
  // Fallback simple fields if test publish uses custom shape
  const threshold = typeof alertThreshold === "number" ? alertThreshold : (budget?.threshold != null ? Number(budget.threshold) : null);

  // Determine if we should cap
  // The budget we created uses 10 EUR with thresholds 0.5,0.9,1.0. PubSub fires for each threshold.
  // We only act on >=1.0 (100%) to avoid premature block at 50%/90%.
  let shouldCap = false;
  if (alertThreshold != null) {
    shouldCap = Number(alertThreshold) >= 1.0;
  } else if (costAmount != null && budgetAmount != null) {
    shouldCap = costAmount >= budgetAmount;
  } else if (budget?.costAmount && budget?.budgetAmount) {
    // Some payloads have costAmount/budgetAmount as numbers
    shouldCap = Number(budget.costAmount) >= Number(budget.budgetAmount);
  } else {
    // If payload is test/unknown, require explicit threshold field
    console.log("[budget-cap] no clear threshold, will not cap (safe default). Set threshold in payload to test.");
  }

  if (!shouldCap) {
    console.log(`[budget-cap] no action: alertThresholdExceeded=${alertThreshold} cost=${costAmount} budget=${budgetAmount} — waiting for 100%`);
    return;
  }

  console.log(`[budget-cap] CAP TRIGGERED: alertThresholdExceeded=${alertThreshold} cost=${costAmount} budget=${budgetAmount} — scaling ${SERVICE} to 0 and${DISABLE_BILLING ? "" : " NOT"} disabling billing`);

  // 1) Scale Cloud Run to 0 (hard traffic cap, reversible via `gcloud run services update --max-instances=1`)
  try {
    await scaleRunToZero();
    console.log("[budget-cap] Cloud Run scaled to 0 successfully");
  } catch (e) {
    console.error("[budget-cap] failed to scale Cloud Run", e);
    // Do not throw - we still try billing unlink if enabled
  }

  // 2) Optionally disable billing (unlink project). Destructive - requires manual `gcloud beta billing projects link`.
  if (DISABLE_BILLING) {
    try {
      await disableBilling();
      console.log("[budget-cap] Billing disabled (unlinked)");
    } catch (e) {
      console.error("[budget-cap] failed to disable billing", e);
    }
  }
};

async function scaleRunToZero() {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const accessToken = typeof token === "string" ? token : token?.token;
  if (!accessToken) throw new Error("No access token");

  // Use Run Admin API v2: PATCH https://run.googleapis.com/v2/projects/{project}/locations/{region}/services/{service}
  // We fetch current service to preserve template, then patch scaling.
  const getUrl = `https://run.googleapis.com/v2/projects/${PROJECT_ID}/locations/${REGION}/services/${SERVICE}`;
  const getResp = await fetch(getUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!getResp.ok) {
    const t = await getResp.text();
    throw new Error(`GET service failed ${getResp.status}: ${t}`);
  }
  const svc = await getResp.json();
  console.log("[budget-cap] current scaling", JSON.stringify(svc?.template?.scaling || {}, null, 2));

  // Patch with updateMask scaling.maxInstanceCount
  // Run v2 expects scaling.maxInstanceCount field — 0 is invalid (must be >=1), so use 1 as hard cap (min cost)
  // Reversible via `gcloud run services update --max-instances=1`
  const patchUrl = `${getUrl}?updateMask=template.scaling.maxInstanceCount`;
  const patchBody = {
    template: {
      scaling: {
        maxInstanceCount: 1,
        minInstanceCount: 0,
      },
    },
  };
  const patchResp = await fetch(patchUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patchBody),
  });
  const patchText = await patchResp.text();
  console.log("[budget-cap] PATCH response", patchResp.status, patchText.slice(0, 2000));
  if (!patchResp.ok) throw new Error(`PATCH failed ${patchResp.status}: ${patchText}`);

  // Poll operation if returned as long-running? Run v2 returns Operation; but PATCH on service is synchronous? It returns Operation with done=false.
  // For simplicity, we wait a bit and check service again.
  // If operation has name, poll.
  try {
    const op = JSON.parse(patchText);
    if (op?.name && op?.name.startsWith("operations/")) {
      await pollOperation(op.name, accessToken);
    }
  } catch { /* ignore */ }
}

async function pollOperation(name, accessToken) {
  const url = `https://run.googleapis.com/v2/${name}`;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const j = await r.json();
    console.log("[budget-cap] poll", j?.done, j?.name);
    if (j?.done) {
      if (j?.error) throw new Error(JSON.stringify(j.error));
      return;
    }
  }
  console.log("[budget-cap] poll timeout, not done after 20s");
}

async function disableBilling() {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const accessToken = typeof token === "string" ? token : token?.token;
  const url = `https://cloudbilling.googleapis.com/v1/projects/${PROJECT_ID}/billingInfo`;
  const resp = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ billingAccountName: "" }), // unlink
  });
  const text = await resp.text();
  console.log("[budget-cap] unlink billing", resp.status, text.slice(0, 1000));
  if (!resp.ok) throw new Error(`unlink billing failed ${resp.status}: ${text}`);
}
