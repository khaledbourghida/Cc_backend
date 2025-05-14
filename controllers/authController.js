const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const astyle = require('astyle');
const cppLint = require('cpp-lint');



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
        await fs.mkdir(tempDir, { recursive: true });
        const tempFile = path.join(tempDir, 'temp.cpp');
        await fs.writeFile(tempFile, code);

        // Analyze code using cpp-lint
        const analysisResults = await new Promise((resolve, reject) => {
            cppLint.lint(tempFile, {
                filters: [
                    '+whitespace',
                    '+readability',
                    '+performance',
                    '+portability',
                    '+information'
                ]
            }, (err, results) => {
                // Clean up temp file
                fs.unlink(tempFile).catch(console.error);
                fs.rmdir(tempDir).catch(console.error);

                if (err) reject(err);
                else resolve(results);
            });
        });

        // Process and categorize results
        const categorizedResults = {
            errors: [],
            warnings: [],
            style: [],
            performance: []
        };

        analysisResults.forEach(result => {
            const issue = {
                message: result.message,
                line: result.line,
                type: result.severity
            };

            switch (result.category) {
                case 'error':
                    categorizedResults.errors.push(issue);
                    break;
                case 'warning':
                    categorizedResults.warnings.push(issue);
                    break;
                case 'style':
                case 'readability':
                    categorizedResults.style.push(issue);
                    break;
                case 'performance':
                    categorizedResults.performance.push(issue);
                    break;
                default:
                    categorizedResults.warnings.push(issue);
            }
        });

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