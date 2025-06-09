import { Client as SSHClient } from 'ssh2'
import * as path from 'path'
import { ServerConfig } from '../../types'
import { ensureDirectoryExists } from '../../utils/file'

export class SSHService {
    constructor(private config: ServerConfig) {}

    async downloadFolder(tempDir: string, folderPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const ssh = new SSHClient()
            let successfulDownloads = 0
            let failedDownloads = 0

            ensureDirectoryExists(tempDir)

            ssh.on('ready', () => {
                console.log('SSH подключение установлено. Запуск SFTP сессии...')
                ssh.sftp((err, sftp) => {
                    if (err) {
                        console.error('Ошибка SFTP сессии:', err)
                        ssh.end()
                        return reject(err)
                    }

                    const remotePath = folderPath.replace(/\\/g, '/')
                    console.log(`Чтение удаленной директории ${remotePath}...`)
                    sftp.readdir(remotePath, async (err, list) => {
                        if (err) {
                            console.error('Ошибка при чтении директории:', err)
                            ssh.end()
                            return reject(err)
                        }

                        console.log(`Найдено ${list.length} файлов для загрузки`)

                        for (const item of list) {
                            const remoteFile = `${remotePath}/${item.filename}`.replace(/\\/g, '/')
                            const localFile = path.join(tempDir, item.filename)

                            try {
                                await new Promise<void>((res, rej) => {
                                    sftp.stat(remoteFile, (err, stats) => {
                                        if (err) {
                                            console.log(
                                                `File ${item.filename} is no longer available, skipping...`
                                            )
                                            rej(err)
                                        } else {
                                            res()
                                        }
                                    })
                                })

                                await new Promise<void>((res, rej) => {
                                    console.log(`Загрузка ${item.filename}...`)
                                    sftp.fastGet(remoteFile, localFile, err => {
                                        if (err) {
                                            console.error(
                                                `Не удалось загрузить ${item.filename}:`,
                                                err
                                            )
                                            rej(err)
                                        } else {
                                            successfulDownloads++
                                            res()
                                        }
                                    })
                                })
                            } catch (error) {
                                console.error(`Ошибка при обработке ${item.filename}:`, error)
                                failedDownloads++
                                continue
                            }
                        }

                        console.log(
                            `Итог загрузки: ${successfulDownloads} успешно, ${failedDownloads} с ошибками`
                        )

                        if (successfulDownloads > 0) {
                            ssh.end()
                            resolve()
                        } else {
                            ssh.end()
                            reject(new Error('Не удалось успешно загрузить ни одного файла'))
                        }
                    })
                })
            })
            ssh.on('error', err => {
                console.error('Ошибка SSH подключения:', err)
                reject(err)
            })

            ssh.on('timeout', () => {
                console.error('Таймаут SSH подключения')
                reject(new Error('Таймаут SSH подключения'))
            })

            console.log('Подключение к SSH серверу...')
            ssh.connect({
                host: this.config.host,
                port: this.config.port,
                username: this.config.username,
                password: this.config.password,
                readyTimeout: 60000,
                keepaliveInterval: 10000,
            })
        })
    }

    async listFolders(): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const ssh = new SSHClient()

            ssh.on('ready', () => {
                ssh.sftp((err, sftp) => {
                    if (err) {
                        ssh.end()
                        return reject(err)
                    }

                    const remotePath = this.config.remoteDir.replace(/\\/g, '/')
                    sftp.readdir(remotePath, (err, list) => {
                        if (err) {
                            ssh.end()
                            return reject(err)
                        }

                        const datePattern = /^\d{2}_\d{2}_\d{4}$/
                        const validFolders = list
                            .filter(item => datePattern.test(item.filename))
                            .map(item => item.filename)

                        ssh.end()
                        resolve(validFolders)
                    })
                })
            })

            ssh.on('error', reject)
            ssh.on('timeout', () => reject(new Error('Таймаут SSH подключения')))

            ssh.connect({
                host: this.config.host,
                port: this.config.port,
                username: this.config.username,
                password: this.config.password,
                readyTimeout: 60000,
                keepaliveInterval: 10000,
            })
        })
    }

    async deleteFolder(folderPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const ssh = new SSHClient()

            ssh.on('ready', () => {
                // Используем rm -rf для рекурсивного удаления
                ssh.exec(`rm -rf "${folderPath}"`, (err, stream) => {
                    if (err) {
                        console.error(`Ошибка при удалении папки ${folderPath}:`, err)
                        ssh.end()
                        reject(err)
                        return
                    }

                    stream.on('close', () => {
                        console.log(`Папка ${folderPath} успешно удалена с сервера`)
                        ssh.end()
                        resolve()
                    })

                    stream.on('data', (data: Buffer) => {
                        console.log('Вывод:', data.toString())
                    })

                    stream.stderr.on('data', (data: Buffer) => {
                        console.error('Ошибка:', data.toString())
                    })
                })
            })

            ssh.on('error', err => {
                console.error('Ошибка SSH подключения:', err)
                reject(err)
            })

            ssh.connect({
                host: this.config.host,
                port: this.config.port,
                username: this.config.username,
                password: this.config.password,
                readyTimeout: 60000,
                keepaliveInterval: 10000,
            })
        })
    }
}
