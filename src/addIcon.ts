const rcedit = require('rcedit')

rcedit(
    'build/exe/remote-save.exe',
    {
        icon: 'app.ico',
    },
    function (error) {
        if (error) {
            console.error('Не удалось отредактировать исполняемый файл:', error)
        } else {
            console.log('Исполняемый файл успешно отредактирован')
        }
    }
)
