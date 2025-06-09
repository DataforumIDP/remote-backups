import * as fs from 'fs';
import * as path from 'path';
import moment from 'moment';
import archiver from 'archiver';

export class BackupArchiver {
    constructor(private backupsDir: string) {}

    async createBackupArchive(tempDir: string, folderDate?: moment.Moment): Promise<string> {
        const timestamp = folderDate ? 
            folderDate.format('YYYY-MM-DD_00-00-00') : 
            moment().format('YYYY-MM-DD_HH-mm-ss');
            
        const archivePath = path.join(this.backupsDir, `backup_${timestamp}.zip`);
        
        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(archivePath);
            const archive = archiver('zip', {
                zlib: { level: 9 },
                forceZip64: true
            });

            output.on('close', () => resolve(archivePath));
            archive.on('error', reject);

            archive.pipe(output);
            archive.directory(tempDir, false);
            archive.finalize();
        });
    }

    cleanOldBackups(retentionDays: number): void {
        const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
        const now = Date.now();

        fs.readdirSync(this.backupsDir)
            .filter(file => file.endsWith('.zip'))
            .map(file => path.join(this.backupsDir, file))
            .forEach(file => {
                const stats = fs.statSync(file);
                if (now - stats.mtime.getTime() > retentionMs) {
                    fs.unlinkSync(file);
                    console.log(`Deleted old backup: ${file}`);
                }
            });
    }
}
