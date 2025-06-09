import * as fs from 'fs';
import * as path from 'path';
import moment from 'moment';
import { Client as SSHClient } from 'ssh2';
import { Client as FTPClient } from 'basic-ftp';
import { BackupConfig } from '../models/BackupConfig';

export class BackupDownloader {
    constructor(private config: BackupConfig) {}

    async downloadViaSSH(tempDir: string, folderPath: string): Promise<void> {
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
                        console.error('SFTP session failed:', err);
                        ssh.end();
                        return reject(err);
                    }

                    const remotePath = folderPath.replace(/\\/g, '/');
                    console.log(`Reading remote directory ${remotePath}...`);
                    sftp.readdir(remotePath, async (err, list) => {
                        if (err) {
                            console.error('Failed to read directory:', err);
                            ssh.end();
                            return reject(err);
                        }

                        console.log(`Found ${list.length} files to download`);
                        
                        for (const item of list) {
                            const remoteFile = `${remotePath}/${item.filename}`.replace(/\\/g, '/');
                            const localFile = path.join(tempDir, item.filename);
                            
                            try {
                                await new Promise<void>((res, rej) => {
                                    sftp.stat(remoteFile, (err, stats) => {
                                        if (err) {
                                            console.log(`File ${item.filename} is no longer available, skipping...`);
                                            rej(err);
                                        } else {
                                            res();
                                        }
                                    });
                                });

                                await new Promise<void>((res, rej) => {
                                    console.log(`Downloading ${item.filename}...`);
                                    sftp.fastGet(remoteFile, localFile, (err) => {
                                        if (err) {
                                            console.error(`Failed to download ${item.filename}:`, err);
                                            rej(err);
                                        } else {
                                            successfulDownloads++;
                                            res();
                                        }
                                    });
                                });
                            } catch (error) {
                                console.error(`Error processing ${item.filename}:`, error);
                                failedDownloads++;
                                continue;
                            }
                        }

                        console.log(`Download summary: ${successfulDownloads} successful, ${failedDownloads} failed`);
                        
                        if (successfulDownloads > 0) {
                            ssh.end();
                            resolve();
                        } else {
                            ssh.end();
                            reject(new Error('No files were downloaded successfully'));
                        }
                    });
                });
            });

            ssh.on('error', (err) => {
                console.error('SSH connection error:', err);
                reject(err);
            });

            ssh.on('timeout', () => {
                console.error('SSH connection timeout');
                reject(new Error('SSH connection timeout'));
            });

            console.log('Connecting to SSH server...');
            ssh.connect({
                host: this.config.serverHost,
                port: this.config.serverPort,
                username: this.config.serverUser,
                password: this.config.serverPassword,
                readyTimeout: 60000,
                keepaliveInterval: 10000
            });
        });
    }

    async downloadViaFTP(tempDir: string): Promise<void> {
        const client = new FTPClient(60000);
        
        try {
            console.log('Connecting to FTP server...');
            client.ftp.verbose = true;
            
            try {
                await client.access({
                    host: this.config.serverHost,
                    port: this.config.serverPort,
                    user: this.config.serverUser,
                    password: this.config.serverPassword,
                    secure: true
                });
            } catch (err) {
                console.log('Secure connection failed, trying insecure...');
                await client.access({
                    host: this.config.serverHost,
                    port: this.config.serverPort,
                    user: this.config.serverUser,
                    password: this.config.serverPassword,
                    secure: false
                });
            }
            
            await client.send('PASV');
            console.log('Connected. Changing directory...');
            await client.cd(this.config.remoteDir);
            
            console.log('Listing files...');
            const list = await client.list();
            
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            console.log(`Found ${list.length} files to download`);
            for (const item of list) {
                console.log(`Downloading ${item.name}...`);
                await client.downloadTo(path.join(tempDir, item.name), item.name);
            }
        } catch (error) {
            console.error('FTP Error:', error);
            throw error;
        } finally {
            client.close();
        }
    }
}
