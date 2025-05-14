const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const util = require('util');
const execFilePromise = util.promisify(execFile);
const fsp = require('fs/promises');


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

    if (!code) {
        return res.status(400).json({
            error: true,
            message: 'No code provided'
        });
    }

    try {
        const { stdout, stderr } = await execAsync('echo ' + JSON.stringify(code) + ' | clang-format');
        
        if (stderr) {
            throw new Error(stderr);
        }

        res.json({
            error: false,
            formattedCode: stdout,
            message: 'Code formatted successfully'
        });
    } catch (error) {
        console.error('Formatting error:', error);
        res.status(500).json({
            error: true,
            message: 'Formatting failed',
            details: error.message
        });
    }
}; 

exports.analyzeCode = async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({
            error: true,
            message: 'No code provided'
        });
    }

    try {
        // Create a temporary file for analysis
        const tempDir = path.join(__dirname, '..', 'temp');
        await fsp.mkdir(tempDir, { recursive: true });
        const tempFile = path.join(tempDir, 'temp.cpp');
        await fsp.writeFile(tempFile, code);

        // Use clang-format to check for style issues
        const styleResults = await execFilePromise('clang-format', [
            '--style=google',
            '--output-replacements-xml',
            tempFile
        ]);

        const styleIssues = styleResults.stdout.split('\n')
            .filter(line => line.includes('<replacement '))
            .map(line => {
                const offset = line.match(/offset='(\d+)'/)?.[1];
                return {
                    message: 'Style issue: Incorrect formatting',
                    line: getLineNumber(code, parseInt(offset)),
                    type: 'style'
                };
            });

        const analysisResults = await execFilePromise('clang-format', [
            '--style=google',
            '--dry-run',
            '--Werror',
            tempFile
        ]).catch(err => ({
            stderr: err.message || 'Analysis found issues'
        }));

        // Clean up
        await fsp.unlink(tempFile);
        await fsp.rmdir(tempDir);

        const categorizedResults = {
            errors: [],
            warnings: [],
            style: styleIssues,
            performance: []
        };

        if (analysisResults.stderr) {
            const issues = analysisResults.stderr.split('\n')
                .filter(line => line.trim())
                .map(line => ({
                    message: line,
                    type: line.toLowerCase().includes('error') ? 'error' : 'warning'
                }));

            for (const issue of issues) {
                categorizedResults[issue.type === 'error' ? 'errors' : 'warnings'].push(issue);
            }
        }

        res.json({
            error: false,
            results: categorizedResults,
            message: 'Code analysis completed'
        });

    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({
            error: true,
            message: 'Analysis failed',
            details: error.message
        });
    }
};

// Helper to get line number from offset
function getLineNumber(code, offset) {
    const lines = code.split('\n');
    let currentOffset = 0;
    for (let i = 0; i < lines.length; i++) {
        currentOffset += lines[i].length + 1;
        if (currentOffset >= offset) {
            return i + 1;
        }
    }
    return 1;
}