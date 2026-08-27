/**
 * Bundled legal text — accessible offline.
 * These are displayed in-app and linked from App Store listings.
 */

export /**
 *
 */
const PRIVACY_POLICY = `
BugRout Privacy Policy
Last Updated: August 2026

1. INFORMATION WE COLLECT

BugRout is designed with privacy as a core principle. We collect the minimum data necessary to provide evacuation routing services.

Read section 1(c) even if you read nothing else. Some data leaves your device without an opt-in, because the features that need it cannot work otherwise.

a) Data Processed On-Device Only
- Your GPS location (used for navigation; never sent to our servers unless you opt in to Crowd Signal, and never sent to anyone else)
- Downloaded map tiles (stored locally on your device)
- Saved scenarios, emergency contacts, and preferences (stored locally in SQLite)
- Route calculations (performed entirely on your device via the Valhalla engine)

b) Data Transmitted to Us (Only When Online and Opted In)
- Crowd Signal Telemetry: If you enable Crowd Signal in Settings, we collect anonymous speed and heading data to help other users avoid congestion. This data:
  - Contains NO personally identifiable information
  - Uses a rotating device token (a new random identifier every 24 hours)
  - Has coordinates rounded to ~11 meter precision before transmission
  - Is retained on our servers for a maximum of 48 hours
  - Is not linked by us to any identity, device, or account. We hold no identifier that could make that link, and we do not attempt it.
- Crash Reports: If you enable Crash Reports in Settings, crash traces are sent to our error-reporting provider. This is off unless you turn it on.

c) Data Transmitted to Third Parties Without an Opt-In

Some features work by asking someone else's server a question. When they do, that server sees the question and your device's IP address. This happens without a separate opt-in, and it is not something BugRout can do on your behalf privately.

- Destination search. When you type in the destination search box, what you typed is sent to Nominatim, the OpenStreetMap Foundation's geocoding service, to be turned into coordinates. Nominatim receives your search text and your IP address. Searches are sent only after you have accepted the disclaimer on first launch, only while you are online, and only after you pause typing. Saved scenarios and recent destinations do not trigger a search — they are already on your device. If you would rather not use this, you can reach any destination by saving a scenario or picking a point on the map.
- Weather alerts. To find which state you are in, BugRout sends the centre point of your downloaded map region to the National Weather Service. This is the centre of a region you chose to download, not your live GPS position, but it is still an approximate indication of where you are.
- Water sources. BugRout sends the bounding box of your downloaded map region to the OpenStreetMap Overpass API.
- Fire perimeters, fuel stations, water gauges and shelters. BugRout asks the services in section 4 for data covering your downloaded region — by state or nationwide — and filters it on your device.

In every case above, what is transmitted describes an area you chose to download, not your live position, and none of it is sent to BugRout's own servers.

d) Data We Never Collect
- Your name, email, phone number, or any account information (no account required)
- Your precise location (only rounded coordinates, and only if Crowd Signal is enabled)
- Your contacts or address book
- Your route history

We never store your destinations on our servers, and no route you plan is ever sent to us. Your destination does leave your device when you use the destination search box, as described in section 1(c) — it goes to Nominatim, not to BugRout.

- Any advertising identifiers

2. HOW WE USE DATA

- Crowd Signal data is aggregated to provide congestion information to other BugRout users during evacuation events
- Crash reports, if you have enabled them in Settings, help us fix bugs and improve reliability
- We do not sell, share, or monetize your data in any way

3. DATA STORAGE AND SECURITY

- All personal data (scenarios, contacts, routes) is stored locally on your device
- Crowd Signal data is transmitted over HTTPS and stored in encrypted servers
- We use Cloudflare Workers for edge processing with no persistent logging

4. THIRD-PARTY SERVICES

BugRout contacts the following external services. Each one sees your IP address when contacted, plus whatever is listed against it.

- OpenStreetMap (map data, open source) — map tiles are downloaded ahead of time, in whole regions you choose
- Nominatim, operated by the OpenStreetMap Foundation (address search) — receives the text you type into the destination search box
- OpenStreetMap Overpass API (drinking water locations) — receives the bounding box of your downloaded region
- National Weather Service, US government (weather alerts) — receives the centre point of your downloaded region
- FEMA and USFS, US government (flood zones, fire perimeters) — receive no location from you; data is filtered on your device
- NIFC fire perimeters, served via Esri ArcGIS Online (a commercial hosting provider) — receives no location from you
- NREL, US government (fuel station data) — receives a US state code
- USGS, US government (water gauge data) — receives a US state code
- American Red Cross and Open211 (shelter locations) — receive no location from you; data is filtered on your device
- Sentry (crash reporting) — contacted only if you enable Crash Reports in Settings

None of these services receives your name, email, phone number, contacts, or any account identifier, because BugRout does not have them. Several of them do receive an approximate indication of the area you are operating in, as set out above and in section 1(c).

5. YOUR RIGHTS

- You can delete all local data by uninstalling the app
- You can disable Crowd Signal at any time in Settings
- You can disable Crash Reports at any time in Settings
- You can force-rotate your anonymous device token in Settings
- You can avoid the destination search entirely by using saved scenarios, recent destinations, or a point on the map
- No account exists to delete — we don't have your information

6. CHILDREN'S PRIVACY

BugRout does not knowingly collect data from children under 13. The app does not require an account or collect personal information.

7. CHANGES TO THIS POLICY

We will update this policy as needed. Changes will be reflected in the "Last Updated" date above. Significant changes will be noted in app update release notes.

8. CONTACT

For privacy questions: privacy@bugrout.app
`;

export /**
 *
 */
const TERMS_OF_SERVICE = `
BugRout Terms of Service
Last Updated: April 2026

1. ACCEPTANCE OF TERMS

By downloading, installing, or using BugRout, you agree to these Terms of Service.

2. IMPORTANT SAFETY DISCLAIMER

BugRout provides ADVISORY ROUTING ONLY. Route suggestions are based on statistical models and cached data that may not reflect real-time conditions.

YOU MUST NOT rely solely on this app for life-safety decisions. Always:
- Follow official evacuation orders from local authorities
- Use your own judgment about road conditions
- Monitor official emergency channels (radio, TV, IPAWS alerts)
- Have backup navigation methods (paper maps, compass)

BugRout's predictive congestion model is statistical. It CANNOT account for:
- Roads that have just been closed or damaged
- Real-time traffic conditions (when offline)
- Bridges, tunnels, or roads destroyed by the event
- Local conditions only visible to on-the-ground observers

3. DESCRIPTION OF SERVICE

BugRout is a mobile navigation application that provides:
- Offline routing using pre-downloaded map data
- Threat zone overlays (fire, flood, weather) from government data sources
- Resource location markers (fuel, water, shelter)
- Predictive congestion routing using statistical models

4. OFFLINE FUNCTIONALITY

BugRout is designed to work without internet connectivity. However:
- Map tiles must be downloaded before going offline
- Threat data is cached and may become stale
- Resource locations are cached and may be outdated
- Crowd Signal features require connectivity

5. DATA ACCURACY

BugRout uses data from US government agencies (NWS, FEMA, USFS, NREL, USGS) and OpenStreetMap. We do not guarantee the accuracy, completeness, or timeliness of this data. Data update frequencies vary by source.

6. LIMITATION OF LIABILITY

TO THE MAXIMUM EXTENT PERMITTED BY LAW, BUGROUT AND ITS DEVELOPERS SHALL NOT BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE APP, INCLUDING BUT NOT LIMITED TO PERSONAL INJURY, PROPERTY DAMAGE, OR LOSS OF LIFE.

You use BugRout at your own risk. This app is a navigation aid, not a life-safety system.

7. INTELLECTUAL PROPERTY

BugRout is proprietary software. You are granted a limited, non-exclusive, non-transferable license to use the app for personal, non-commercial purposes.

Map data is sourced from OpenStreetMap and is available under the Open Database License (ODbL).

8. GOVERNING LAW

These terms are governed by the laws of the United States. Any disputes shall be resolved in the courts of the state where BugRout is incorporated.

9. CONTACT

For questions about these terms: legal@bugrout.app
`;

export /**
 *
 */
const DISCLAIMER_SHORT =
  "BugRout provides advisory routing only. Do not rely solely on this app for life-safety decisions. Always follow official evacuation orders.";
