import * as path from 'path'
import moment from 'moment'
import { AppConfig } from '../../types'
import { SSHService } from './ssh.service'
import { FTPService } from './ftp.service'
import { isBackupExists, cleanDirectory, createArchive, cleanOldBackups } from '../../utils/file'

export class BackupService {
    private sshService?: SSHService
    private ftpService?: FTPService

    constructor(private config: AppConfig) {
        if (config.type === 'ssh') {
            this.sshService = new SSHService(config)
        } else {
            this.ftpService = new FTPService(config)
        }
    }

    async performBackup(): Promise<void> {
        try {
            if (this.config.type === 'ssh') {
                await this.performSSHBackup()
            } else if (this.config.type === 'ftp') {
                await this.performFTPBackup()
            } else {
                throw new Error(`Неподдерживаемый тип сервера: ${this.config.type}`)
            }
            console.log('Очистка старых резервных копий...')
            cleanOldBackups(this.config.backupDir, this.config.retentionDays)

            console.log('Процесс резервного копирования успешно завершен')
        } catch (error) {
            console.error('Ошибка резервного копирования:', error)
            throw error
        }
    }

    private async performSSHBackup(): Promise<void> {
        const folders = await this.sshService!.listFolders()
        console.log(`Найдено ${folders.length} папок с датами`)

        for (const folder of folders) {
            console.log(`Проверка папки ${folder}...`)
            if (!isBackupExists(this.config.backupDir, folder)) {
                console.log(`Обработка папки ${folder}...`)

                const tempDir = path.join(this.config.backupDir, 'temp', folder)
                cleanDirectory(tempDir)

                try {
                    const folderPath = path.join(this.config.remoteDir, folder)
                    console.log(`Загрузка файлов из ${folderPath}...`)
                    await this.sshService!.downloadFolder(tempDir, folderPath)

                    const folderDate = moment(folder, 'DD_MM_YYYY')
                    await createArchive(
                        tempDir,
                        this.config.backupDir,
                        `${folderDate.format('YYYY-MM-DD')}_00-00-00`
                    )

                    // Добавляем удаление папки после успешного создания архива
                    console.log(`Удаление папки ${folder} с сервера...`)
                    await this.sshService!.deleteFolder(folderPath)
                } catch (error) {
                    console.error(`Ошибка при обработке папки ${folder}:`, error)
                } finally {
                    cleanDirectory(tempDir)
                }
            } else {
                console.log(`Резервная копия для ${folder} уже существует, пропуск...`)
            }
        }
    }

    private async performFTPBackup(): Promise<void> {
        // TODO: Implement FTP backup logic if needed
        throw new Error('Резервное копирование через FTP еще не реализовано')
    }
}
