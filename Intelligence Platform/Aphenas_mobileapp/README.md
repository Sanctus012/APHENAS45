# Aphenas Backend

Local setup requires PostgreSQL connection variables plus `SESSION_TOKEN_SECRET`, `ONBOARDING_TOKEN_SECRET`, `RECOVERY_PHRASE_PEPPER`, and `CHAT_PIN_PEPPER`; the API defaults to `PORT=5050` when `PORT` is not set.

For Expo Go through ngrok, run the backend on `PORT=5050` and tunnel:

```text
https://duffel-treble-cube.ngrok-free.dev -> http://localhost:5050
```
