const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { error } = require('console');



exports.getFunc = async (req , res) => {
    const type = req.params.type;
    const folderPath = path.join(__dirname , '..', 'function' , type);

    if (!fs.existsSync(folderPath)) {
        return res.status(404).json({error : 'Folder not found'});
    }

    fs.readdir(folderPath , (err, files) => {
        if (err) return res.status(500).json({ error : 'cannot read directory' });
        const functions = files.filter(f => f.endsWith('.cpp')).map(f => f.replace('.cpp' , ''));
        res.json(functions);
    })
}

exports.getCode = async (req , res) => {
    const {type, funcName} = req.params;
    const filePath = path.join(__dirname , '..', 'function' , type , `${funcName}.cpp`);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error : "Function not found"});
    }

    fs.readFile(filePath, 'utf8' , (err, data)=>{
        if (err) return res.status(500).json({ error: 'Connot read file'});
        res.json({ code: data });
    });
}

exports.runCode = async (req, res) => {
    const { code } = req.body;
    
    // Create a temporary file
    const tempFile = path.join(__dirname, '..', 'temp', 'temp.cpp');
    const outputFile = path.join(__dirname, '..', 'temp', 'temp.exe');
    
    // Ensure temp directory exists
    if (!fs.existsSync(path.join(__dirname, '..', 'temp'))) {
        fs.mkdirSync(path.join(__dirname, '..', 'temp'));
    }
    
    // Write the code to the temp file
    fs.writeFileSync(tempFile, code);
    
    // Compile the code
    exec(`g++ "${tempFile}" -o "${outputFile}"`, (compileError, compileStdout, compileStderr) => {
        if (compileError) {
            return res.status(400).json({ error: true, output: compileStderr });
        }
        
        // Run the compiled code
        exec(`"${outputFile}"`, (runError, runStdout, runStderr) => {
            // Clean up temp files
            try {
                fs.unlinkSync(tempFile);
                fs.unlinkSync(outputFile);
            } catch (e) {
                console.error('Error cleaning up temp files:', e);
            }
            
            if (runError) {
                return res.status(400).json({ error: true, output: runStderr });
            }
            
            res.json({ error: false, output: runStdout });
        });
    });
};

exports.runFormat = async (req, res) => {
    const { code } = req.body;

    // Define paths
    const tempDir = path.join(__dirname, '..', 'temp');
    const tempFile = path.join(tempDir, 'format_temp.cpp');
    
    try {
        // Ensure temp directory exists
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Write the code to a temp file
        fs.writeFileSync(tempFile, code);

        // Run clang-format
        exec(`clang-format "${tempFile}"`, (error, stdout, stderr) => {
            // Clean up temp file
            try {
                fs.unlinkSync(tempFile);
            } catch (e) {
                console.error('Error cleaning up temp file:', e);
            }

            if (error) {
                console.error(stderr);
                return res.status(500).json({
                    error: true,
                    message: 'Formatting failed',
                    details: stderr
                });
            }

            res.json({
                error: false,
                formattedCode: stdout
            });
        });
    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({
            error: true,
            message: 'Internal server error',
            details: error.message
        });
    }
}; 