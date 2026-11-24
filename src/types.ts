export interface CommandResult {
  id: string;
  title: string;
  command: string;
  output: string;
}

export interface AlarmSummary {
  critical: number;
  major: number;
  minor: number;
  warning: number;
}

export interface BbuReport {
  id: string;
  site_name: string;
  host: string;
  protocol: string;
  username: string;
  engineer: string | null;
  status: "success" | "partial" | "failed";
  error: string | null;
  results: CommandResult[] | null;
  alarm_summary: AlarmSummary | null;
  created_at: string;
}

export const PREDEFINED_COMMANDS: { id: string; title: string; command: string }[] = [
  { id: "alt", title: "Active Alarms", command: "alt" },
  { id: "pst", title: "Plugin Unit State", command: "pst" },
  { id: "mutual", title: "Mutual Configuration (MPA/RU)", command: "mutual" },
  { id: "rru", title: "Radio Unit Status", command: "rru" },
  { id: "ret", title: "RET Antenna Status", command: "ret" },
  { id: "cmlist", title: "Cell Management List", command: "cmlist" },
  { id: "gpsToa", title: "GPS ToA", command: "gpsToa" },
  { id: "sctpAll", title: "SCTP Associations", command: "sctpall" },
  { id: "ethlink", title: "Ethernet Links", command: "ethlink" },
  { id: "cv", title: "Software Version", command: "cv" },
  { id: "cdfm", title: "Centralized MIMO Feature", command: "cdfm" },
  { id: "mr", title: "Measurement Results / Load", command: "mr" },
];
