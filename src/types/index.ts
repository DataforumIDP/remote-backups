export interface ServerConfig {
    host: string
    port: number
    username: string
    password: string
    type: 'ssh' | 'ftp'
    remoteDir: string
}

export interface BackupConfig {
    backupDir: string
    retentionDays: number
}

export interface SchedulerConfig {
    interval: number
    startTime: string
}

export interface AppConfig extends ServerConfig, BackupConfig, SchedulerConfig {}
