# Project memory

## Product intent & audience

- Tool for telecom field engineers/operators to generate PDF reports from Ericsson BBU (Baseband Unit) diagnostics.
- User enters BBU OAM IP, selects SSH or Telnet, provides node credentials + site name; tool runs predefined commands and produces a downloadable PDF.
- Each run is persisted so users can re-download or delete past reports.

## Brand personality & voice

- Professional, telecom/operations-oriented; output must be production-grade and presentable to stakeholders.
- UI should feel robust and trustworthy for field use.

## Visual design & UX direction

- React + Vite + Tailwind CSS; Lucide React icons; `@/` path alias (see `.bolt/prompt`).
- Main UI layout: connection form → live collection progress → report preview → report history list.
- Connection form fields: OAM IP, protocol (SSH/Telnet) with auto-filled port, node username, node password, site name.
- PDF report structure: header with site details, alarm summary (critical/major/minor/warning counts parsed from `alt`), one section per command with full output.
- Prefer clear status/progress feedback during connection and command execution.
- History list supports re-download and delete actions per report.

## Decisions, constraints & rationale

- Backend: Supabase edge function ("collector") handles SSH/Telnet connection and command execution in the cloud.
- Predefined Ericsson commands (12): `alt`, `pst`, `rru`, `ret`, `cmlist`, `gpsToa`, `sctpall`, `ethlink`, `cv`, `mutual`, `cdfm`, `mr`.
- Protocol choice auto-fills default port (SSH/Telnet).
- Cloud collector can only reach BBUs network-reachable from the Supabase edge runtime; private/VPN-only OAM networks will time out — may need jump-server/VPN adaptation.
- Login-prompt handling may need per-node-version tweaks; not yet validated against a real BBU.
- Telnet read logic required careful consumption handling (fixed during development).

## Open questions & assumptions

- How does the user normally reach the BBU (jump server, VPN, office network)? Needed if cloud collector can't reach private OAM networks.
- Specific Ericsson node software version — login prompt parsing may need adjustment after first real connection attempt.
- No live BBU testing done yet; error output from first real run will guide fixes.
- Supabase env vars injected at runtime by platform (build passes without them in local shell).