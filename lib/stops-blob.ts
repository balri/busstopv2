import { get, put } from "@vercel/blob";

export const STOPS_BLOB_PATH = "stops.json";

export interface Stop {
	stop_id: string;
	stop_code: string;
	stop_name: string;
	stop_desc: string;
	stop_lat: number;
	stop_lon: number;
	direction_id: number;
	route_ids: string[];
}

function isStop(value: unknown): value is Stop {
	if (typeof value !== "object" || value === null) return false;

	const stop = value as Record<string, unknown>;
	return (
		typeof stop["stop_id"] === "string" &&
		typeof stop["stop_code"] === "string" &&
		typeof stop["stop_name"] === "string" &&
		typeof stop["stop_desc"] === "string" &&
		typeof stop["stop_lat"] === "number" &&
		typeof stop["stop_lon"] === "number" &&
		typeof stop["direction_id"] === "number" &&
		Array.isArray(stop["route_ids"]) &&
		stop["route_ids"].every((routeId) => typeof routeId === "string")
	);
}

export async function getStopsFromBlob(): Promise<Stop[]> {
	const result = await get(STOPS_BLOB_PATH, {
		access: "public",
		useCache: false,
	});
	if (!result) {
		throw new Error(`Blob "${STOPS_BLOB_PATH}" does not exist`);
	}
	if (result.statusCode !== 200) {
		throw new Error(`Blob "${STOPS_BLOB_PATH}" returned no content`);
	}

	const data: unknown = await new Response(result.stream).json();
	if (!Array.isArray(data) || !data.every(isStop)) {
		throw new Error(`Blob "${STOPS_BLOB_PATH}" has an invalid stop dataset`);
	}
	return data;
}

export async function putStopsInBlob(stops: Stop[]): Promise<void> {
	await put(STOPS_BLOB_PATH, JSON.stringify(stops), {
		access: "public",
		addRandomSuffix: false,
		allowOverwrite: true,
		contentType: "application/json",
	});
}
