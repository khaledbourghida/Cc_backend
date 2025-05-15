const fs = require('fs/promises');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Helper function to parse AST output into structured format
function parseASTOutput(astOutput) {
    const lines = astOutput.split('\n');
    const stack = [{ type: 'root', children: [] }];
    let currentIndentation = 0;

    for (const line of lines) {
        // Skip empty lines
        if (!line.trim()) continue;

        // Calculate indentation level
        const indentation = line.search(/\S/);
        const node = parseASTLine(line.trim());
        
        if (!node) continue;

        // Adjust stack based on indentation
        if (indentation > currentIndentation) {
            stack.push(stack[stack.length - 1].children[stack[stack.length - 1].children.length - 1]);
        } else if (indentation < currentIndentation) {
            const levels = Math.floor((currentIndentation - indentation) / 2);
            for (let i = 0; i < levels; i++) {
                stack.pop();
            }
        }

        currentIndentation = indentation;
        stack[stack.length - 1].children.push(node);
    }

    return stack[0];
}

// Helper function to parse a single AST line
function parseASTLine(line) {
    // Extract node type and content
    const typeMatch = line.match(/^(-)?([A-Za-z]+)/);
    if (!typeMatch) return null;

    const nodeType = typeMatch[2];
    const content = line.substring(typeMatch[0].length).trim();

    switch (nodeType) {
        case 'IfStmt':
            return {
                type: 'if',
                condition: extractCondition(content),
                children: [],
                elseBranch: []
            };
        case 'ForStmt':
            return {
                type: 'for',
                initialization: extractForInit(content),
                condition: extractForCond(content),
                increment: extractForInc(content),
                children: []
            };
        case 'WhileStmt':
            return {
                type: 'while',
                condition: extractCondition(content),
                children: []
            };
        case 'ReturnStmt':
            return {
                type: 'return',
                value: content.replace(/^'|'$/g, '').trim()
            };
        case 'DeclStmt':
            return {
                type: 'declaration',
                content: content.replace(/^'|'$/g, '').trim()
            };
        case 'BinaryOperator':
            return {
                type: 'operation',
                content: content.replace(/^'|'$/g, '').trim()
            };
        case 'CallExpr':
            return {
                type: 'functionCall',
                content: content.replace(/^'|'$/g, '').trim()
            };
        default:
            return null;
    }
}

// Helper functions to extract specific parts of statements
function extractCondition(content) {
    const match = content.match(/'([^']+)'/);
    return match ? match[1] : content;
}

function extractForInit(content) {
    const match = content.match(/init: ([^;]+)/);
    return match ? match[1] : '';
}

function extractForCond(content) {
    const match = content.match(/cond: ([^;]+)/);
    return match ? match[1] : '';
}

function extractForInc(content) {
    const match = content.match(/inc: ([^;]+)/);
    return match ? match[1] : '';
}

// Convert AST to flowchart format
function convertASTToFlowchart(ast) {
    const flowchart = {
        nodes: [],
        edges: []
    };

    let nodeId = 0;
    
    function processNode(node, parentId = null) {
        const currentId = nodeId++;
        
        // Create node
        const flowNode = {
            id: currentId,
            type: node.type
        };

        switch (node.type) {
            case 'if':
                flowNode.condition = node.condition;
                flowchart.nodes.push(flowNode);
                
                if (parentId !== null) {
                    flowchart.edges.push({
                        from: parentId,
                        to: currentId,
                        label: 'next'
                    });
                }

                // Process true branch
                if (node.children && node.children.length > 0) {
                    node.children.forEach(child => {
                        const childId = processNode(child, currentId);
                        flowchart.edges.push({
                            from: currentId,
                            to: childId,
                            label: 'true'
                        });
                    });
                }

                // Process else branch
                if (node.elseBranch && node.elseBranch.length > 0) {
                    node.elseBranch.forEach(child => {
                        const childId = processNode(child, currentId);
                        flowchart.edges.push({
                            from: currentId,
                            to: childId,
                            label: 'false'
                        });
                    });
                }
                break;

            case 'for':
            case 'while':
                flowNode.condition = node.condition;
                if (node.type === 'for') {
                    flowNode.initialization = node.initialization;
                    flowNode.increment = node.increment;
                }
                flowchart.nodes.push(flowNode);

                if (parentId !== null) {
                    flowchart.edges.push({
                        from: parentId,
                        to: currentId,
                        label: 'next'
                    });
                }

                // Process loop body
                if (node.children && node.children.length > 0) {
                    node.children.forEach(child => {
                        const childId = processNode(child, currentId);
                        flowchart.edges.push({
                            from: currentId,
                            to: childId,
                            label: 'body'
                        });
                    });
                }
                break;

            default:
                flowNode.content = node.content || node.value;
                flowchart.nodes.push(flowNode);

                if (parentId !== null) {
                    flowchart.edges.push({
                        from: parentId,
                        to: currentId,
                        label: 'next'
                    });
                }
        }

        return currentId;
    }

    processNode(ast);
    return flowchart;
}

exports.generateFlowchart = async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({
            error: true,
            message: 'No code provided'
        });
    }

    try {
        // Create temp directory if it doesn't exist
        const tempDir = path.join(__dirname, '..', 'temp');
        await fs.mkdir(tempDir, { recursive: true });

        // Create temporary file
        const tempFile = path.join(tempDir, 'temp.cpp');
        await fs.writeFile(tempFile, code);

        // Generate AST using clang
        const { stdout, stderr } = await execAsync(`clang -Xclang -ast-dump -fsyntax-only "${tempFile}"`);

        if (stderr) {
            throw new Error(stderr);
        }

        // Parse AST output
        const ast = parseASTOutput(stdout);

        // Convert AST to flowchart format
        const flowchart = convertASTToFlowchart(ast);

        // Clean up
        await fs.unlink(tempFile);

        res.json({
            error: false,
            flowchart,
            message: 'Flowchart generated successfully'
        });

    } catch (error) {
        console.error('Flowchart generation error:', error);
        res.status(500).json({
            error: true,
            message: 'Failed to generate flowchart',
            details: error.message
        });
    }
}; 