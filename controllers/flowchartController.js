const fs = require('fs/promises');
const path = require('path');
const Parser = require('tree-sitter');
const CPP = require('tree-sitter-cpp');

// Initialize the parser
const parser = new Parser();
parser.setLanguage(CPP);

function traverseAST(node, flowchart = { nodes: [], edges: [], currentId: 0 }) {
    const { nodes, edges, currentId } = flowchart;
    let nodeId = currentId;

    function createNode(type, content) {
        const node = { id: nodeId++, type, content };
        nodes.push(node);
        return node.id;
    }

    function createEdge(from, to, label = 'next') {
        edges.push({ from, to, label });
    }

    // Process current node
    let currentNodeId;
    switch (node.type) {
        case 'function_definition':
            const funcName = node.children.find(c => c.type === 'function_declarator')
                ?.children.find(c => c.type === 'identifier')?.text;
            currentNodeId = createNode('function', `Function: ${funcName}`);
            break;

        case 'if_statement':
            const condition = node.children.find(c => c.type === 'condition_clause')
                ?.children.find(c => c.type === 'parenthesized_expression')?.text;
            currentNodeId = createNode('if', condition);
            break;

        case 'for_statement':
            const forInit = node.children.find(c => c.type === 'for_range_clause')?.text ||
                          node.children.find(c => c.type === 'for_statement')?.text;
            currentNodeId = createNode('for', forInit);
            break;

        case 'while_statement':
            const whileCondition = node.children.find(c => c.type === 'condition_clause')?.text;
            currentNodeId = createNode('while', whileCondition);
            break;

        case 'return_statement':
            currentNodeId = createNode('return', node.text);
            break;

        case 'declaration':
            currentNodeId = createNode('declaration', node.text);
            break;

        case 'call_expression':
            currentNodeId = createNode('functionCall', node.text);
            break;

        case 'assignment_expression':
            currentNodeId = createNode('operation', node.text);
            break;
    }

    // Process child nodes
    if (node.children && node.children.length > 0) {
        let lastChildId = currentNodeId;
        
        for (const child of node.children) {
            const childResult = traverseAST(child, { nodes, edges, currentId: nodeId });
            nodeId = childResult.currentId;

            if (childResult.currentNodeId !== undefined) {
                if (lastChildId !== undefined) {
                    createEdge(lastChildId, childResult.currentNodeId);
                }
                lastChildId = childResult.currentNodeId;

                // Handle special cases
                if (node.type === 'if_statement') {
                    if (child.type === 'compound_statement') {
                        createEdge(currentNodeId, childResult.currentNodeId, 'true');
                    } else if (child.type === 'else_clause') {
                        createEdge(currentNodeId, childResult.currentNodeId, 'false');
                    }
                } else if (node.type === 'for_statement' || node.type === 'while_statement') {
                    if (child.type === 'compound_statement') {
                        createEdge(currentNodeId, childResult.currentNodeId, 'body');
                        createEdge(childResult.currentNodeId, currentNodeId, 'loop');
                    }
                }
            }
        }
    }

    return { nodes, edges, currentId: nodeId, currentNodeId };
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
        // Parse the code using tree-sitter
        const tree = parser.parse(code);
        
        // Generate flowchart from AST
        const flowchartData = traverseAST(tree.rootNode);

        res.json({
            error: false,
            flowchart: {
                nodes: flowchartData.nodes,
                edges: flowchartData.edges
            },
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