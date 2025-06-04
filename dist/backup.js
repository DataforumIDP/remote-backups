"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const moment_1 = __importDefault(require("moment"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const archiver_1 = __importDefault(require("archiver"));
const basic_ftp_1 = require("basic-ftp");
const ssh2_1 = require("ssh2");
// Load environment variables
dotenv.config();
const { SERVER_HOST, SERVER_PORT, SERVER_USER, SERVER_PASSWORD, SERVER_TYPE, REMOTE_DIR, RETENTION_DAYS } = process.env;
// Create backups directory if it doesn't exist
const backupsDir = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
}
function isBackupExists(folderName) {
    const files = fs.readdirSync(backupsDir);
    // Ищем архив, который содержит дату из имени папки
    return files.some(file => {
        const folderDate = (0, moment_1.default)(folderName, 'DD_MM_YYYY');
        const fileDate = (0, moment_1.default)(file.replace('backup_', '').replace('.zip', ''), 'YYYY-MM-DD_HH-mm-ss');
        return folderDate.isSame(fileDate, 'day');
    });
}
function downloadViaSSH(tempDir, folderPath) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            const ssh = new ssh2_1.Client();
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
                    sftp.readdir(remotePath, (err, list) => __awaiter(this, void 0, void 0, function* () {
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
                                yield new Promise((res, rej) => {
                                    sftp.stat(remoteFile, (err, stats) => {
                                        if (err) {
                                            console.log(`File ${item.filename} is no longer available, skipping...`);
                                            rej(err);
                                        }
                                        else {
                                            res();
                                        }
                                    });
                                });
                                // Скачиваем файл
                                yield new Promise((res, rej) => {
                                    console.log(`Downloading ${item.filename}...`);
                                    sftp.fastGet(remoteFile, localFile, (err) => {
                                        if (err) {
                                            console.error(`Failed to download ${item.filename}:`, err);
                                            rej(err);
                                        }
                                        else {
                                            successfulDownloads++;
                                            res();
                                        }
                                    });
                                });
                            }
                            catch (error) {
                                console.error(`Error processing ${item.filename}:`, error);
                                failedDownloads++;
                                continue;
                            }
                        }
                        console.log(`Download summary: ${successfulDownloads} successful, ${failedDownloads} failed`);
                        if (successfulDownloads > 0) {
                            ssh.end();
                            resolve();
                        }
                        else {
                            ssh.end();
                            reject(new Error('No files were downloaded successfully'));
                        }
                    }));
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
                port: parseInt(SERVER_PORT),
                username: SERVER_USER,
                password: SERVER_PASSWORD,
                readyTimeout: 60000,
                keepaliveInterval: 10000
            });
        });
    });
}
function downloadViaFTP(tempDir) {
    return __awaiter(this, void 0, void 0, function* () {
        const client = new basic_ftp_1.Client(60000); // Таймаут 60 секунд
        try {
            console.log('Connecting to FTP server...'); // Включаем verbose режим для отладки
            client.ftp.verbose = true;
            // Пробуем сначала безопасное соединение
            try {
                yield client.access({
                    host: SERVER_HOST,
                    port: parseInt(SERVER_PORT),
                    user: SERVER_USER,
                    password: SERVER_PASSWORD,
                    secure: true
                });
            }
            catch (err) {
                console.log('Secure connection failed, trying insecure...');
                // Если не получилось, пробуем обычное соединение
                yield client.access({
                    host: SERVER_HOST,
                    port: parseInt(SERVER_PORT),
                    user: SERVER_USER,
                    password: SERVER_PASSWORD,
                    secure: false
                });
            }
            // Переключаемся в пассивный режим
            yield client.send('PASV');
            console.log('Connected. Changing directory...');
            yield client.cd(REMOTE_DIR);
            console.log('Listing files...');
            const list = yield client.list();
            // Создаем временную директорию, если её нет
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            console.log(`Found ${list.length} files to download`);
            for (const item of list) {
                console.log(`Downloading ${item.name}...`);
                yield client.downloadTo(path.join(tempDir, item.name), item.name);
            }
        }
        catch (error) {
            console.error('FTP Error:', error);
            throw error;
        }
        finally {
            client.close();
        }
    });
}
function createBackupArchive(tempDir) {
    return __awaiter(this, void 0, void 0, function* () {
        const timestamp = (0, moment_1.default)().format('YYYY-MM-DD_HH-mm-ss');
        const archivePath = path.join(backupsDir, `backup_${timestamp}.zip`);
        return new Promise((resolve, reject) => {
            const output = fs.createWriteStream(archivePath);
            const archive = (0, archiver_1.default)('zip', {
                zlib: { level: 9 },
                forceZip64: true
            });
            output.on('close', () => resolve(archivePath));
            archive.on('error', reject);
            archive.pipe(output);
            archive.directory(tempDir, false);
            archive.finalize();
        });
    });
}
function cleanOldBackups() {
    const retentionMs = parseInt(RETENTION_DAYS) * 24 * 60 * 60 * 1000;
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
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Create backups directory if it doesn't exist
            if (!fs.existsSync(backupsDir)) {
                fs.mkdirSync(backupsDir, { recursive: true });
            }
            if ((SERVER_TYPE === null || SERVER_TYPE === void 0 ? void 0 : SERVER_TYPE.toLowerCase()) === 'ssh') {
                const ssh = new ssh2_1.Client();
                // Подключаемся к серверу для получения списка папок
                yield new Promise((resolve, reject) => {
                    ssh.on('ready', () => {
                        console.log('SSH connection established. Starting SFTP session...');
                        ssh.sftp((err, sftp) => {
                            if (err) {
                                console.error('SFTP session failed:', err);
                                ssh.end();
                                return reject(err);
                            }
                            const remotePath = REMOTE_DIR.replace(/\\/g, '/'); // Заменяем все обратные слеши на прямые
                            console.log(`Reading remote directory ${remotePath}...`);
                            sftp.readdir(remotePath, (err, folders) => __awaiter(this, void 0, void 0, function* () {
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
                                            yield downloadViaSSH(tempDir, folderPath);
                                            // Create archive with folder date
                                            const folderDate = (0, moment_1.default)(folder.filename, 'DD_MM_YYYY');
                                            const archiveName = `backup_${folderDate.format('YYYY-MM-DD')}_00-00-00.zip`;
                                            const archivePath = path.join(backupsDir, archiveName);
                                            yield new Promise((res, rej) => {
                                                const output = fs.createWriteStream(archivePath);
                                                const archive = (0, archiver_1.default)('zip', {
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
                                        }
                                        catch (error) {
                                            console.error(`Error processing folder ${folder.filename}:`, error);
                                        }
                                        finally {
                                            // Clean up temp directory
                                            if (fs.existsSync(tempDir)) {
                                                fs.rmSync(tempDir, { recursive: true });
                                            }
                                        }
                                    }
                                    else {
                                        console.log(`Backup for ${folder.filename} already exists, skipping...`);
                                    }
                                }
                                ssh.end();
                                resolve();
                            }));
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
                        port: parseInt(SERVER_PORT),
                        username: SERVER_USER,
                        password: SERVER_PASSWORD,
                        readyTimeout: 60000,
                        keepaliveInterval: 10000
                    });
                });
            }
            else {
                console.error('Only SSH connection type is supported for now');
                process.exit(1);
            }
            // Clean old backups
            console.log('Cleaning old backups...');
            cleanOldBackups();
            console.log('Backup process completed successfully');
        }
        catch (error) {
            console.error('Backup failed:', error);
            process.exit(1);
        }
    });
}
main();
