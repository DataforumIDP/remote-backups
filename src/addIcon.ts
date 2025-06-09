const rcedit = require('rcedit');  

rcedit('build/exe/remote-save.exe', {  
    'icon': 'app.ico'  
}, function (error) {  
    if (error) {  
        console.error('Failed to edit executable:', error);  
    } else {  
        console.log('Executable edited successfully');  
    }  
});  
