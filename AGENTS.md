# WallDeck repository instructions

WallDeck is a monorepo with three product areas:

- `hardware/wall-mount` — wall mount, power routing, CAD, BOM and assembly notes;
- `apps/tablet-android` — thin Android hardware layer and trusted WebView bridge;
- `apps/web-panel` — homelab-hosted user interface and its future backend.

Keep these responsibilities separate. Native Android code should contain only device-dependent capabilities or lifecycle behavior that the web application cannot provide reliably. Product UI and home logic belong in the web panel.

Maintain documentation with every material change:

- update the closest component README for setup or behavior changes;
- update `docs/architecture.md` for boundaries, flows or protocol changes;
- update `docs/security.md` for trust, authentication, permissions or secret handling changes;
- update `docs/roadmap.md` when work is completed, added or reprioritized;
- update `apps/tablet-android/TEST_REPORT.md` only with tests actually run on a physical device, including the device and Android version.

Never commit Device Keys, signing keys, cookies, `.env` files, local SDK paths, build outputs or screenshots containing account/location data. Keep Android Bridge changes versioned and document both native and web sides in the same commit.

Before committing Android changes, run `assembleDebug`, `testDebugUnitTest` and `lintDebug`. For web bridge changes, run the device smoke test when a debug tablet is available and record the exact result.
