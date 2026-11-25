export function haversine(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
): number {
	const radius = 6371000;
	const toRad = (degrees: number) => (degrees * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRad(lat1)) *
			Math.cos(toRad(lat2)) *
			Math.sin(dLon / 2) *
			Math.sin(dLon / 2);
	return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function xorDecrypt(encoded: string, key: string): string {
	const text = Buffer.from(encoded, "base64").toString("binary");
	let result = "";
	for (let index = 0; index < text.length; index++) {
		result += String.fromCharCode(
			text.charCodeAt(index) ^ key.charCodeAt(index % key.length),
		);
	}
	return result;
}
