# busstopv2

## Vercel API

The backend runs as a Vercel Node.js function. Send a `POST` request with a
JSON body containing the XOR/base64-encoded `loc` field to `/api/status`:

```json
{ "loc": "<encoded location>" }
```

Cross-origin `POST` requests are supported; `OPTIONS` preflight requests are
accepted for `Content-Type`.

The function uses `MIN_DISTANCE` (default `100` metres),
`ACCEPTABLE_DELAY` (default `60` seconds), and optional `SECRET_KEYWORD`
environment variables. Stop data is read from the `stops.json` file in the
project's Vercel Blob store.

## Updating stop data

Vercel runs `/api/cron/update-stops` daily at 03:00 Brisbane time. The job
downloads Translink's GTFS feed, rebuilds the route 61 stop dataset, and
overwrites the `stops.json` blob. Attach the Blob store to the Vercel project
and configure `CRON_SECRET`; Vercel sends it as a bearer token when invoking
the scheduled function. The cron function allows up to 60 seconds to complete.
