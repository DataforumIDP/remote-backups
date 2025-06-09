import * as fs from 'fs'
import * as path from 'path'
import archiver from 'archiver'
import moment from 'moment'

export function ensureDirectoryExists(dir: string): void {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
}

export function cleanDirectory(dir: string): void {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true })
    }
    fs.mkdirSync(dir, { recursive: true })
}

export function isBackupExists(backupsDir: string, folderName: string): boolean {
    const files = fs.readdirSync(backupsDir)
    return files.some(file => {
        const folderDate = moment(folderName, 'DD_MM_YYYY')
        const fileDate = moment(
            file.replace('backup_', '').replace('.zip', ''),
            'YYYY-MM-DD_HH-mm-ss'
        )
        return folderDate.isSame(fileDate, 'day')
    })
}

export async function createArchive(
    sourcePath: string,
    targetPath: string,
    timestamp?: string
): Promise<string> {
    const archiveName = timestamp
        ? `backup_${timestamp}.zip`
        : `backup_${moment().format('YYYY-MM-DD_HH-mm-ss')}.zip`
    const archivePath = path.join(targetPath, archiveName)

    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(archivePath)
        const archive = archiver('zip', {
            zlib: { level: 9 },
            forceZip64: true,
        })

        output.on('close', () => resolve(archivePath))
        archive.on('error', reject)

        archive.pipe(output)
        archive.directory(sourcePath, false)
        archive.finalize()
    })
}

export function cleanOldBackups(backupsDir: string, retentionDays: number): void {
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000
    const now = Date.now()

    fs.readdirSync(backupsDir)
        .filter(file => file.endsWith('.zip'))
        .map(file => path.join(backupsDir, file))
        .forEach(file => {
            const stats = fs.statSync(file)
            if (now - stats.mtime.getTime() > retentionMs) {
                fs.unlinkSync(file)
                console.log(`Удалена старая резервная копия: ${file}`)
            }
        })
}
