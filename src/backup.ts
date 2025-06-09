import * as dotenv from 'dotenv';
import moment from 'moment';
import * as path from 'path';
import * as fs from 'fs';
import archiver from 'archiver';
import { Client as FTPClient } from 'basic-ftp';
import { Client as SSHClient } from 'ssh2';

// Load environment variables
dotenv.config();

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
    START
} = process.env;

// Create backups directory if it doesn't exist
const backupsDir = path.resolve(BACKUP_DIR || path.join(__dirname, '..', 'backups'));
if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
}

function isBackupExists(folderName: string): boolean {
    const files = fs.readdirSync(backupsDir);
    // Ищем архив, который содержит дату из имени папки
    return files.some(file => {
        const folderDate = moment(folderName, 'DD_MM_YYYY');
        const fileDate = moment(file.replace('backup_', '').replace('.zip', ''), 'YYYY-MM-DD_HH-mm-ss');
        return folderDate.isSame(fileDate, 'day');
    });
}

async function downloadViaSSH(tempDir: string, folderPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const ssh = new SSHClient();
        let successfulDownloads = 0;
        let failedDownloads = 0;

        // Создаем временную директорию, если её нет
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
                    
                    // Загружаем файлы последовательно
                    for (const item of list) {
                        const remoteFile = `${remotePath}/${item.filename}`.replace(/\\/g, '/');
                        const localFile = path.join(tempDir, item.filename);
                        
                        try {
                            // Проверяем существование файла
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

                            // Скачиваем файл
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
            host: SERVER_HOST,
            port: parseInt(SERVER_PORT!),
            username: SERVER_USER,
            password: SERVER_PASSWORD,
            readyTimeout: 60000,
            keepaliveInterval: 10000
        });
    });
}

async function downloadViaFTP(tempDir: string): Promise<void> {
    const client = new FTPClient(60000); // Таймаут 60 секунд
    
    try {
        console.log('Connecting to FTP server...');        // Включаем verbose режим для отладки
        client.ftp.verbose = true;
        
        // Пробуем сначала безопасное соединение
        try {
            await client.access({
                host: SERVER_HOST!,
                port: parseInt(SERVER_PORT!),
                user: SERVER_USER!,
                password: SERVER_PASSWORD!,
                secure: true
            });
        } catch (err) {
            console.log('Secure connection failed, trying insecure...');
            // Если не получилось, пробуем обычное соединение
            await client.access({
                host: SERVER_HOST!,
                port: parseInt(SERVER_PORT!),
                user: SERVER_USER!,
                password: SERVER_PASSWORD!,
                secure: false
            });
        }
        
        // Переключаемся в пассивный режим
        await client.send('PASV');

        console.log('Connected. Changing directory...');
        await client.cd(REMOTE_DIR!);
        
        console.log('Listing files...');
        const list = await client.list();
        
        // Создаем временную директорию, если её нет
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

async function createBackupArchive(tempDir: string): Promise<string> {
    const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
    const archivePath = path.join(backupsDir, `backup_${timestamp}.zip`);
    
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

function cleanOldBackups(): void {
    const retentionMs = parseInt(RETENTION_DAYS!) * 24 * 60 * 60 * 1000;
    const now = Date.now();

    fs.readdirSync(backupsDir)
        .filter(file => file.endsWith('.zip'))
        .map(file => path.join(backupsDir, file))
        .forEach(file => {
            const stats = fs.statSync(file);
            if (now - stats.mtime.getTime() > retentionMs) {
                fs.unlinkSync(file);
                console.log(`Deleted old backup: ${file}`);
            }
        });
}

function getNextRunTime(startTime: string, intervalHours: number): Date {
    const [hours, minutes] = startTime.split(':').map(Number);
    const now = new Date();
    let nextRun = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
    
    if (nextRun <= now) {
        nextRun.setTime(nextRun.getTime() + intervalHours * 60 * 60 * 1000);
    }
    
    return nextRun;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runScheduled() {
    const interval = parseInt(INTERVAL || '24');
    const startTime = START || '23:59';

    console.log(`Backup scheduler started. Interval: ${interval} hours, Start time: ${startTime}`);

    while (true) {
        const nextRun = getNextRunTime(startTime, interval);
        const now = new Date();
        const waitTime = nextRun.getTime() - now.getTime();

        console.log(`Next backup scheduled for: ${nextRun.toLocaleString()}`);
        
        await sleep(waitTime);
        
        console.log('Starting scheduled backup...');
        await main();
        
        // Sleep for 1 minute to avoid potential duplicate runs
        await sleep(60000);
    }
}

async function main() {
    try {
        // Create backups directory if it doesn't exist
        if (!fs.existsSync(backupsDir)) {
            fs.mkdirSync(backupsDir, { recursive: true });
        }

        if (SERVER_TYPE?.toLowerCase() === 'ssh') {
            const ssh = new SSHClient();
            
            // Подключаемся к серверу для получения списка папок
            await new Promise<void>((resolve, reject) => {
                ssh.on('ready', () => {
                    console.log('SSH connection established. Starting SFTP session...');
                    ssh.sftp((err, sftp) => {
                        if (err) {
                            console.error('SFTP session failed:', err);
                            ssh.end();
                            return reject(err);
                        }

                        const remotePath = REMOTE_DIR!.replace(/\\/g, '/');  // Заменяем все обратные слеши на прямые
                        console.log(`Reading remote directory ${remotePath}...`);
                        
                        sftp.readdir(remotePath, async (err, folders) => {
                            if (err) {
                                console.error('Failed to read directory:', err);
                                ssh.end();
                                return reject(err);
                            }

                            console.log(`Found ${folders.length} items in remote directory`);
                            
                            // Фильтруем и обрабатываем каждую папку
                            const datePattern = /^\d{2}_\d{2}_\d{4}$/;
                            const validFolders = folders.filter(folder => datePattern.test(folder.filename));
                            console.log(`Found ${validFolders.length} valid date folders`);

                            // Создаем отдельное подключение для каждой папки
                            for (const folder of validFolders) {
                                console.log(`Checking folder ${folder.filename}...`);
                                if (!isBackupExists(folder.filename)) {
                                    console.log(`Processing folder ${folder.filename}...`);
                                    
                                    // Create temporary directory for this folder
                                    const tempDir = path.join(backupsDir, 'temp', folder.filename);
                                    if (fs.existsSync(tempDir)) {
                                        fs.rmSync(tempDir, { recursive: true });
                                    }
                                    fs.mkdirSync(tempDir, { recursive: true });

                                    try {
                                        // Download files from this folder
                                        const folderPath = `${remotePath}/${folder.filename}`.replace(/\\/g, '/');
                                        console.log(`Downloading files from ${folderPath}...`);
                                        await downloadViaSSH(tempDir, folderPath);

                                        // Create archive with folder date
                                        const folderDate = moment(folder.filename, 'DD_MM_YYYY');
                                        const archiveName = `backup_${folderDate.format('YYYY-MM-DD')}_00-00-00.zip`;
                                        const archivePath = path.join(backupsDir, archiveName);

                                        await new Promise<void>((res, rej) => {
                                            const output = fs.createWriteStream(archivePath);
                                            const archive = archiver('zip', {
                                                zlib: { level: 9 },
                                                forceZip64: true
                                            });

                                            output.on('close', () => {
                                                console.log(`Created backup archive: ${archiveName}`);
                                                res();
                                            });
                                            archive.on('error', rej);

                                            archive.pipe(output);
                                            archive.directory(tempDir, false);
                                            archive.finalize();
                                        });
                                    } catch (error) {
                                        console.error(`Error processing folder ${folder.filename}:`, error);
                                    } finally {
                                        // Clean up temp directory
                                        if (fs.existsSync(tempDir)) {
                                            fs.rmSync(tempDir, { recursive: true });
                                        }
                                    }
                                } else {
                                    console.log(`Backup for ${folder.filename} already exists, skipping...`);
                                }
                            }

                            ssh.end();
                            resolve();
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
                    host: SERVER_HOST,
                    port: parseInt(SERVER_PORT!),
                    username: SERVER_USER,
                    password: SERVER_PASSWORD,
                    readyTimeout: 60000,
                    keepaliveInterval: 10000
                });
            });
        } else {
            console.error('Only SSH connection type is supported for now');
            process.exit(1);
        }

        // Clean old backups
        console.log('Cleaning old backups...');
        cleanOldBackups();

        console.log('Backup process completed successfully');
    } catch (error) {
        console.error('Backup failed:', error);
        process.exit(1);
    }
}

// Replace the main() call with runScheduled()
runScheduled();