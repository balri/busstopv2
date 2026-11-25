# Copilot Instructions

## Project

This repository is a Vercel deployment of the BusStop status backend.

- `api/status.ts` is the main `POST` API handler.
- `api/utils.ts` contains distance and location-decryption helpers.
- `stops.json` is the bundled stop dataset.
- `vercel.json` rewrites `/status` to `/api/status`.

## Backend conventions

- Preserve the existing `POST /status` and `POST /api/status` response contract.
- Accept a JSON body with an XOR/base64-encoded `loc` value.
- Return `400` for invalid coordinates, `404` when no matching stop exists,
  and `500` when the GTFS realtime feed cannot be fetched.
- Read runtime settings from `MIN_DISTANCE`, `ACCEPTABLE_DELAY`, and
  `SECRET_KEYWORD`.
- Keep stop data self-contained. Do not add filesystem reads or Express
  dependencies to the Vercel function.
- Preserve Brisbane/Australia direction selection and GTFS realtime delay
  behavior.

## TypeScript

- Use strict TypeScript and types from `@vercel/node`.
- Keep JSON and realtime feed values guarded before use.
- Do not introduce `any` casts or unchecked external response assumptions.
- Avoid adding dependencies unless required.

## Validation

- Run `npm install` after dependency changes.
- Run `npm run typecheck` before completing changes.
- Run `git diff --check` to verify patch formatting.
- Exercise `/api/status` with a valid encoded location and with an invalid
  request before deployment.
