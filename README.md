# busstopv2

## Vercel API

The backend runs as a Vercel Node.js function. Send a `POST` request with a
JSON body containing the XOR/base64-encoded `loc` field to either `/status` or
`/api/status`:

```json
{ "loc": "<encoded location>" }
```

The function uses `MIN_DISTANCE` (default `100` metres),
`ACCEPTABLE_DELAY` (default `60` seconds), and optional `SECRET_KEYWORD`
environment variables. Deploy this repository as a Vercel project; the stop
dataset is bundled from `stops.json`.
