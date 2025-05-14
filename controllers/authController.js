const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { error } = require('console');
const { promisify } = require('util');
const execAsync = promisify(exec);



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
        // Create a temporary directory for analysis
        const tempDir = path.join(__dirname, '..', 'temp');
        await fs.mkdir(tempDir, { recursive: true });
        
        // Write code to a temporary file (clang-tidy needs a file)
        const tempFile = path.join(tempDir, 'temp.cpp');
        await fs.writeFile(tempFile, code);

        // Run clang-tidy with a comprehensive set of checks
        const checks = [
            'bugprone-*',          // Detect bug-prone patterns
            'clang-analyzer-*',    // Static analyzer checks
            'cppcoreguidelines-*', // C++ core guidelines
            'performance-*',       // Performance-related checks
            'readability-*',       // Readability issues
            'modernize-*'          // Modernization suggestions
        ].join(',');

        const { stdout, stderr } = await execAsync(
            `clang-tidy ${tempFile} -checks=${checks} --`,
            { maxBuffer: 1024 * 1024 } // Increase buffer size for large outputs
        );

        // Clean up temporary files
        await fs.unlink(tempFile);
        await fs.rmdir(tempDir);

        // Parse the analysis results
        const analysisResults = parseClangTidyOutput(stdout + stderr);

        res.json({
            error: false,
            results: analysisResults,
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

function parseClangTidyOutput(output) {
    const results = {
        errors: [],
        warnings: [],
        style: [],
        performance: []
    };

    const lines = output.split('\n');
    
    for (const line of lines) {
        if (!line.includes('warning:') && !line.includes('error:')) continue;

        const result = {
            message: line.trim(),
            type: 'other'
        };

        // Categorize the issue
        if (line.includes('error:')) {
            result.type = 'error';
            results.errors.push(result);
        } else if (line.includes('performance-')) {
            result.type = 'performance';
            results.performance.push(result);
        } else if (line.includes('readability-') || line.includes('modernize-')) {
            result.type = 'style';
            results.style.push(result);
        } else {
            result.type = 'warning';
            results.warnings.push(result);
        }
    }

    return results;
} 