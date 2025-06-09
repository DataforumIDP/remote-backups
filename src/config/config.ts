import * as dotenv from 'dotenv'
import { AppConfig } from '../types'
import * as path from 'path'

dotenv.config()

const {
    SERVER_HOST,
    SERVER_PORT,
    SERVER_USER,
    SERVER_PASSWORD,
    SERVER_TYPE,
    REMOTE_DIR,
    BACKUP_DIR,
    RETENTION_DAYS,
    INTERVAL,
    START,
} = process.env

export const config: AppConfig = {
    host: SERVER_HOST!,
    port: parseInt(SERVER_PORT!) || 22,
    username: SERVER_USER!,
    password: SERVER_PASSWORD!,
    type: (SERVER_TYPE?.toLowerCase() as 'ssh' | 'ftp') || 'ssh',
    remoteDir: REMOTE_DIR!,
    backupDir: path.resolve(BACKUP_DIR || path.join(__dirname, '..', '..', 'backups')),
    retentionDays: parseInt(RETENTION_DAYS!) || 30,
    interval: parseInt(INTERVAL!) || 24,
    startTime: START || '23:59',
}
