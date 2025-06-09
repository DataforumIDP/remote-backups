import * as fs from 'fs';
import * as path from 'path';
import moment from 'moment';
import { config } from '../config/env';

export function isBackupExists(folderName: string): boolean {
    const files = fs.readdirSync(config.backupsDir);
    return files.some(file => {
        const folderDate = moment(folderName, 'DD_MM_YYYY');
        const fileDate = moment(file.replace('backup_', '').replace('.zip', ''), 'YYYY-MM-DD_HH-mm-ss');
        return folderDate.isSame(fileDate, 'day');
    });
}

export function cleanOldBackups(): void {
    const retentionMs = config.retentionDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    fs.readdirSync(config.backupsDir)
        .filter(file => file.endsWith('.zip'))
        .map(file => path.join(config.backupsDir, file))
        .forEach(file => {
            const stats = fs.statSync(file);
            const age = now - stats.mtimeMs;
            
            if (age > retentionMs) {
                console.log(`Removing old backup: ${file}`);
                fs.unlinkSync(file);
            }
        });
}

export async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function getNextRunTime(startTime: string, intervalHours: number): Date {
    const [hours, minutes] = startTime.split(':').map(Number);
    const now = new Date();
    let nextRun = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
    
    // If the time has already passed today, calculate next run based on interval
    if (nextRun <= now) {
        const msSinceLastRun = now.getTime() - nextRun.getTime();
        const intervals = Math.ceil(msSinceLastRun / (intervalHours * 60 * 60 * 1000));
        nextRun = new Date(nextRun.getTime() + intervals * intervalHours * 60 * 60 * 1000);
    }
    
    return nextRun;
}
