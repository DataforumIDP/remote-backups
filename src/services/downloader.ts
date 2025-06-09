import { Client as SSHClient } from 'ssh2';
import { Client as FTPClient } from 'basic-ftp';
import * as fs from 'fs';
import path from 'path';
import { config } from '../config/env';

export async function downloadViaSSH(tempDir: string, folderPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const ssh = new SSHClient();
        let successfulDownloads = 0;
        let failedDownloads = 0;

        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        ssh.on('ready', () => {
            console.log('SSH connection established. Starting SFTP session...');
            ssh.sftp((err, sftp) => {
                if (err) {
                    ssh.end();
                    reject(new Error(`SFTP error: ${err.message}`));
                    return;
                }

                const remotePath = folderPath.replace(/\\/g, '/');
                console.log(`Reading remote directory ${remotePath}...`);

                sftp.readdir(remotePath, (err, list) => {
                    if (err) {
                        ssh.end();
                        reject(new Error(`Failed to read directory: ${err.message}`));
                        return;
                    }

                    const totalFiles = list.length;
                    if (totalFiles === 0) {
                        ssh.end();
                        resolve();
                        return;
                    }

                    list.forEach(item => {
                        const remoteFile = path.join(folderPath, item.filename).replace(/\\/g, '/');
                        const localFile = path.join(tempDir, item.filename);

                        sftp.fastGet(remoteFile, localFile, (err) => {
                            if (err) {
                                console.error(`Failed to download ${item.filename}: ${err.message}`);
                                failedDownloads++;
                            } else {
                                console.log(`Successfully downloaded ${item.filename}`);
                                successfulDownloads++;
                            }

                            if (successfulDownloads + failedDownloads === totalFiles) {
                                ssh.end();
                                if (failedDownloads > 0) {
                                    reject(new Error(`Failed to download ${failedDownloads} files`));
                                } else {
                                    resolve();
                                }
                            }
                        });
                    });
                });
            });
        }).connect({
            host: config.serverHost,
            port: config.serverPort,
            username: config.serverUser,
            password: config.serverPassword
        });
    });
}

export async function downloadViaFTP(tempDir: string): Promise<void> {
    const client = new FTPClient(60000);
    
    try {
        await client.access({
            host: config.serverHost,
            port: config.serverPort,
            user: config.serverUser,
            password: config.serverPassword
        });

        console.log('FTP connection established');
        
        await client.downloadToDir(tempDir, config.remoteDir);
    } catch (error) {
        throw new Error(`FTP error: ${(error as Error).message}`);
    } finally {
        client.close();
    }
}
