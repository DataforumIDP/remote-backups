export interface BackupConfig {
    backupsDir: string;
    serverType: string;
    serverHost: string;
    serverPort: number;
    serverUser: string;
    serverPassword: string;
    remoteDir: string;
    retentionDays: number;
    startTime: string;
    interval: number;
}
