import axios from "axios";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { DateTime } from "luxon";
import type { VercelRequest, VercelResponse } from "@vercel/node";

import stops from "../stops.json";

import { haversine, xorDecrypt } from "./utils";

const GTFS_RT_URL =
	"https://gtfsrt.api.translink.com.au/api/realtime/SEQ/TripUpdates";
const BUS_TOKEN = "f2d10fe4-45df-4463-8bf9-86aa475b1402";

interface NearestStop {
	stopId: string;
	stopName: string;
	stopLat: number;
	stopLon: number;
	distance: number;
	routeIds: string[];
}

interface NextBus {
	tripId?: string;
	startDate?: string;
	arrivalTime: number;
	delay: number | null;
}

interface StatusResponse {
	status: string;
	scheduledTime: number | null;
	estimatedTime: number;
	delay: number | null;
	keyword?: string | null;
	nearest: NearestStop | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export default async function handler(
	req: VercelRequest,
	res: VercelResponse,
): Promise<void> {
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type");

	if (req.method === "OPTIONS") {
		res.status(204).end();
		return;
	}

	if (req.method !== "POST") {
		res.setHeader("Allow", "POST, OPTIONS");
		res.status(405).json({ error: "Method not allowed" });
		return;
	}

	let userLat: number;
	let userLon: number;
	try {
		const loc = isRecord(req.body) ? req.body.loc : undefined;
		if (typeof loc !== "string") {
			throw new Error("Missing location");
		}
		const parsed: unknown = JSON.parse(xorDecrypt(loc, BUS_TOKEN));
		if (!isRecord(parsed)) {
			throw new Error("Invalid location payload");
		}
		userLat = Number.parseFloat(String(parsed.lat));
		userLon = Number.parseFloat(String(parsed.lon));
		if (
			!Number.isFinite(userLat) ||
			!Number.isFinite(userLon) ||
			userLat < -90 ||
			userLat > 90 ||
			userLon < -180 ||
			userLon > 180
		) {
			throw new Error("Coordinates out of range");
		}
	} catch (error) {
		console.error("Failed to parse location:", error);
		res.status(400).json({ error: "Invalid coordinates" });
		return;
	}

	const minDistance = Number(process.env["MIN_DISTANCE"]) || 100;
	const nowInBrisbane = DateTime.utc().setZone("Australia/Brisbane");
	const direction = nowInBrisbane.hour < 12 ? 1 : 0;
	const filteredStops = stops.filter((stop) => stop.direction_id === direction);

	let nearest: NearestStop | null = null;
	let minDist = Infinity;
	for (const stop of filteredStops) {
		const stopLat = Number(stop.stop_lat);
		const stopLon = Number(stop.stop_lon);
		const distance = haversine(userLat, userLon, stopLat, stopLon);
		if (distance < minDist) {
			minDist = distance;
			nearest = {
				stopId: stop.stop_id,
				stopName: stop.stop_name,
				stopLat,
				stopLon,
				distance: Math.round(distance),
				routeIds: stop.route_ids,
			};
		}
	}

	if (!nearest) {
		res.status(404).json({ error: "No bus stop found" });
		return;
	}

	const userIsNearEnough = minDist <= minDistance;
	let foundService = false;
	let nextBus: NextBus | null = null;
	try {
		const response = await axios.get<ArrayBuffer>(GTFS_RT_URL, {
			responseType: "arraybuffer",
			headers: { "User-Agent": "Mozilla/5.0" },
		});
		const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
			new Uint8Array(response.data),
		);
		const now = Math.floor(Date.now() / 1000);
		const secretKeyword = process.env["SECRET_KEYWORD"] || null;
		const acceptableDelay = Number(process.env["ACCEPTABLE_DELAY"]) || 60;

		for (const routeId of nearest.routeIds) {
			for (const entity of feed.entity) {
				const update = entity.tripUpdate;
				if (!update || update.trip.routeId !== routeId) continue;

				for (const stopTimeUpdate of update.stopTimeUpdate || []) {
					if (stopTimeUpdate.stopId !== nearest.stopId) continue;
					const arrivalTime = stopTimeUpdate.arrival?.time;
					const timestamp =
						typeof arrivalTime === "object" &&
						arrivalTime !== null &&
						"toNumber" in arrivalTime &&
						typeof arrivalTime.toNumber === "function"
							? arrivalTime.toNumber()
							: arrivalTime;
					if (typeof timestamp !== "number" || timestamp < now - 60) {
						continue;
					}

					if (!nextBus || timestamp < nextBus.arrivalTime) {
						nextBus = {
							tripId: update.trip.tripId ?? undefined,
							startDate: update.trip.startDate ?? undefined,
							arrivalTime: timestamp,
							delay: stopTimeUpdate.arrival?.delay ?? null,
						};
						foundService = true;
					}
				}
			}
			if (foundService) break;
		}

		if (nextBus?.tripId) {
			const scheduledTime = nextBus.arrivalTime - (nextBus.delay ?? 0);
			const now = Math.floor(Date.now() / 1000);
			let status = "on_time";

			if (
				typeof nextBus.delay === "number" &&
				nextBus.delay > acceptableDelay
			) {
				status = "late";
			} else if (
				typeof nextBus.delay === "number" &&
				nextBus.delay < -acceptableDelay
			) {
				status = "early";
			}

			const result: StatusResponse = {
				status,
				scheduledTime,
				estimatedTime: nextBus.arrivalTime,
				delay: nextBus.delay,
				nearest,
			};
			if (userIsNearEnough && Math.abs(now - nextBus.arrivalTime) <= 60) {
				result.keyword = secretKeyword;
			}

			res.status(200).json(result);
			return;
		}

		console.log("No service found for stop", nearest.stopId);
		res.status(200).json({ status: "no_service" });
	} catch (error: unknown) {
		if (axios.isAxiosError(error)) {
			console.error("GTFS-RT status:", error.response?.status);
			console.error("GTFS-RT headers:", error.response?.headers);
			console.error(
				"GTFS-RT body:",
				Buffer.from(error.response?.data || [])
					.toString("utf8")
					.slice(-1500),
			);
		} else {
			console.error("Unexpected error:", error);
		}
		res.status(500).json({ error: "Failed to fetch GTFS-RT feed" });
	}
}
