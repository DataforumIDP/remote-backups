import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables
dotenv.config()

export interface Config {
    serverHost: string
    serverPort: number
    serverUser: string
    serverPassword: string
    serverType: 'ssh' | 'ftp'
    remoteDir: string
    backupsDir: string
    retentionDays: number
    interval: number
    startTime: string
}

export const config: Config = {
    serverHost: process.env.SERVER_HOST!,
    serverPort: parseInt(process.env.SERVER_PORT || '22'),
    serverUser: process.env.SERVER_USER!,
    serverPassword: process.env.SERVER_PASSWORD!,
    serverType: (process.env.SERVER_TYPE as 'ssh' | 'ftp') || 'ssh',
    remoteDir: process.env.REMOTE_DIR!,
    backupsDir: path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'backups')),
    retentionDays: parseInt(process.env.RETENTION_DAYS || '90'),
    interval: parseInt(process.env.INTERVAL || '24'),
    startTime: process.env.START || '23:59',
}
