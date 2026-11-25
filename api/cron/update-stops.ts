import type { VercelRequest, VercelResponse } from "@vercel/node";

import { putStopsInBlob } from "../../lib/stops-blob";
import { generateGtfsStops } from "../../lib/update-gtfs-stops";

export default async function handler(
	req: VercelRequest,
	res: VercelResponse,
): Promise<void> {
	if (req.method !== "GET") {
		res.setHeader("Allow", "GET");
		res.status(405).json({ error: "Method not allowed" });
		return;
	}

	const cronSecret = process.env["CRON_SECRET"];
	if (!cronSecret) {
		res.status(500).json({ error: "CRON_SECRET is not configured" });
		return;
	}
	if (req.headers.authorization !== `Bearer ${cronSecret}`) {
		res.status(401).json({ error: "Unauthorized" });
		return;
	}

	try {
		const stops = await generateGtfsStops();
		await putStopsInBlob(stops);
		res.status(200).json({ updated: true, stopCount: stops.length });
	} catch (error) {
		console.error("Failed to update GTFS stops:", error);
		res.status(500).json({ error: "Failed to update GTFS stops" });
	}
}
