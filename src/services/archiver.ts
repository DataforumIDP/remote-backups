import * as fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import moment from 'moment';
import { config } from '../config/env';

export async function createBackupArchive(tempDir: string): Promise<string> {
    const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
    const archivePath = path.join(config.backupsDir, `backup_${timestamp}.zip`);
    
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(archivePath);
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        output.on('close', () => {
            console.log(`Archive created: ${archivePath} (${archive.pointer()} bytes)`);
            resolve(archivePath);
        });

        archive.on('error', (err) => {
            reject(new Error(`Archive error: ${err.message}`));
        });

        archive.pipe(output);
        archive.directory(tempDir, false);
        archive.finalize();
    });
}
