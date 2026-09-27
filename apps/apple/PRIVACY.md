# Privacy policy

Otherlight for Apple platforms does its Education calculations locally on macOS,
iPhone, and iPad. There is no account system, analytics, advertising, telemetry,
cloud synchronization, or tracking, and no runtime network client.

The app keeps current workspace context in local app preferences. Simulation
values stay in memory unless you explicitly import or export a workspace, CSV, or
Markdown file through the platform file picker. Bundled system data is an offline
snapshot that ships with the app; it is never fetched from a service.

On macOS the app runs in the App Sandbox with user-selected read/write file
access and requests no outbound-network entitlement. The bundled privacy manifest
declares no collected-data types, no accessed API categories, no tracking, and no
tracking domains.

The app does not update itself. Any iOS or iPadOS TestFlight review and any macOS
signed and notarized distribution are manual release steps; nothing is uploaded
automatically.

If you report a defect, please leave out private workspace files, personal
information, and credentials.
