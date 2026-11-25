import csv from "csv-parser";
import { mkdtemp, rm } from "fs/promises";
import { createWriteStream } from "fs";
import { tmpdir } from "os";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import * as unzipper from "unzipper";

import type { Stop } from "./stops-blob";

const GTFS_URL = "https://gtfsrt.api.translink.com.au/GTFS/SEQ_GTFS.zip";
const TARGET_ROUTE_SHORT_NAME = "61";

type CsvRow = Record<string, unknown>;

interface Trip {
	routeId: string;
	directionId: number;
}

function isRecord(value: unknown): value is CsvRow {
	return typeof value === "object" && value !== null;
}

function getString(row: CsvRow, field: string): string | undefined {
	const value = row[field];
	return typeof value === "string" ? value : undefined;
}

function getCsvEntry(
	archive: unzipper.CentralDirectory,
	name: string,
): unzipper.File {
	const entry = archive.files.find(
		(file) => file.type === "File" && path.posix.basename(file.path) === name,
	);
	if (!entry) {
		throw new Error(`GTFS archive is missing ${name}`);
	}
	return entry;
}

async function* readCsv(entry: unzipper.File): AsyncGenerator<CsvRow> {
	const parser = entry.stream().pipe(csv());
	for await (const value of parser) {
		if (!isRecord(value)) {
			throw new Error(`Invalid CSV row in ${entry.path}`);
		}
		yield value;
	}
}

function getDirectionId(value: string | undefined): number {
	return Number.parseInt(value || "0", 10);
}

export async function generateGtfsStops(): Promise<Stop[]> {
	const directory = await mkdtemp(path.join(tmpdir(), "gtfs-stops-"));
	const archivePath = path.join(directory, "feed.zip");

	try {
		const response = await fetch(GTFS_URL);
		if (!response.ok) {
			throw new Error(
				`Failed to download GTFS feed: ${response.status} ${response.statusText}`,
			);
		}
		if (!response.body) {
			throw new Error("GTFS feed download returned an empty body");
		}

		await pipeline(
			Readable.from(response.body),
			createWriteStream(archivePath),
		);
		const archive = await unzipper.Open.file(archivePath);

		const routeIds = new Set<string>();
		for await (const row of readCsv(getCsvEntry(archive, "routes.txt"))) {
			if (getString(row, "route_short_name") === TARGET_ROUTE_SHORT_NAME) {
				const routeId = getString(row, "route_id");
				if (routeId) routeIds.add(routeId);
			}
		}
		if (routeIds.size === 0) {
			throw new Error(
				`No route found with route_short_name = ${TARGET_ROUTE_SHORT_NAME}`,
			);
		}

		const trips = new Map<string, Trip>();
		for await (const row of readCsv(getCsvEntry(archive, "trips.txt"))) {
			const routeId = getString(row, "route_id");
			const tripId = getString(row, "trip_id");
			if (routeId && tripId && routeIds.has(routeId)) {
				trips.set(tripId, {
					routeId,
					directionId: getDirectionId(getString(row, "direction_id")),
				});
			}
		}

		const stopDirections = new Map<string, Map<number, Set<string>>>();
		for await (const row of readCsv(getCsvEntry(archive, "stop_times.txt"))) {
			const trip = trips.get(getString(row, "trip_id") || "");
			const stopId = getString(row, "stop_id");
			if (!trip || !stopId) continue;

			let directions = stopDirections.get(stopId);
			if (!directions) {
				directions = new Map();
				stopDirections.set(stopId, directions);
			}
			let directionsRoutes = directions.get(trip.directionId);
			if (!directionsRoutes) {
				directionsRoutes = new Set();
				directions.set(trip.directionId, directionsRoutes);
			}
			directionsRoutes.add(trip.routeId);
		}

		const stops: Stop[] = [];
		for await (const row of readCsv(getCsvEntry(archive, "stops.txt"))) {
			const stopId = getString(row, "stop_id");
			const directions = stopId ? stopDirections.get(stopId) : undefined;
			if (!stopId || !directions) continue;

			for (const [directionId, routeIdsForDirection] of directions) {
				stops.push({
					stop_id: stopId,
					stop_code: getString(row, "stop_code") || "",
					stop_name: getString(row, "stop_name") || "",
					stop_desc: getString(row, "stop_desc") || "",
					stop_lat: Number.parseFloat(getString(row, "stop_lat") || "0"),
					stop_lon: Number.parseFloat(getString(row, "stop_lon") || "0"),
					direction_id: directionId,
					route_ids: [...routeIdsForDirection],
				});
			}
		}

		if (stops.length === 0) {
			throw new Error("GTFS feed produced an empty stop dataset");
		}
		return stops;
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}
