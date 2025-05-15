const Parser = require('tree-sitter');
const CPP = require('tree-sitter-cpp');

class PerformanceAnalyzer {
    constructor(code) {
        this.code = code;
        this.parser = new Parser();
        this.parser.setLanguage(CPP);
        this.tree = this.parser.parse(code);
        this.metrics = {
            totalLines: 0,
            functionCount: 0,
            loopCount: 0,
            nestedLoopCount: 0,
            recursionCount: 0,
            conditionalCount: 0,
            complexity: 'O(1)',
            score: 100
        };
        this.insights = [];
    }

    analyze() {
        this.countBasicMetrics();
        this.detectComplexPatterns();
        this.generateInsights();
        this.calculateScore();
        return {
            summary: this.metrics,
            insights: this.insights,
            score: this.metrics.score,
            complexity: this.metrics.complexity
        };
    }

    countBasicMetrics() {
        // Count total non-empty lines
        this.metrics.totalLines = this.code.split('\n')
            .filter(line => line.trim().length > 0).length;

        // Use tree-sitter to traverse the AST
        const cursor = this.tree.walk();

        const visit = () => {
            const node = cursor.currentNode();
            
            // Count functions
            if (node.type === 'function_definition') {
                this.metrics.functionCount++;
            }
            
            // Count loops
            else if (['for_statement', 'while_statement', 'do_statement'].includes(node.type)) {
                this.metrics.loopCount++;
            }
            
            // Count conditionals
            else if (['if_statement', 'switch_statement'].includes(node.type)) {
                this.metrics.conditionalCount++;
            }

            // Continue traversing
            if (cursor.gotoFirstChild()) {
                do {
                    visit();
                } while (cursor.gotoNextSibling());
                cursor.gotoParent();
            }
        };

        visit();
    }

    detectComplexPatterns() {
        const cursor = this.tree.walk();
        let loopDepth = 0;
        let maxLoopDepth = 0;
        const functionNames = new Set();
        const recursiveFunctions = new Set();

        const visit = () => {
            const node = cursor.currentNode();

            // Track nested loops
            if (['for_statement', 'while_statement', 'do_statement'].includes(node.type)) {
                loopDepth++;
                maxLoopDepth = Math.max(maxLoopDepth, loopDepth);
            }

            // Track function definitions and calls
            if (node.type === 'function_definition') {
                const nameNode = node.childForFieldName('declarator')
                    ?.childForFieldName('declarator');
                if (nameNode) {
                    functionNames.add(nameNode.text);
                }
            }
            else if (node.type === 'call_expression') {
                const funcName = node.childForFieldName('function')?.text;
                if (funcName && functionNames.has(funcName)) {
                    recursiveFunctions.add(funcName);
                }
            }

            if (cursor.gotoFirstChild()) {
                do {
                    visit();
                } while (cursor.gotoNextSibling());
                cursor.gotoParent();
            }

            // Reset loop depth when exiting a loop
            if (['for_statement', 'while_statement', 'do_statement'].includes(node.type)) {
                loopDepth--;
            }
        };

        visit();

        this.metrics.nestedLoopCount = Math.max(0, maxLoopDepth - 1);
        this.metrics.recursionCount = recursiveFunctions.size;

        // Determine complexity
        if (this.metrics.nestedLoopCount >= 2) {
            this.metrics.complexity = `O(n^${this.metrics.nestedLoopCount + 1})`;
        } else if (this.metrics.nestedLoopCount === 1) {
            this.metrics.complexity = 'O(n²)';
        } else if (this.metrics.loopCount > 0) {
            this.metrics.complexity = 'O(n)';
        } else if (this.metrics.recursionCount > 0) {
            this.metrics.complexity = 'O(2^n)';
        }
    }

    generateInsights() {
        // Check for nested loops
        if (this.metrics.nestedLoopCount > 1) {
            this.insights.push({
                type: 'warning',
                message: `Found ${this.metrics.nestedLoopCount} levels of nested loops. Consider optimizing to reduce time complexity.`
            });
            this.metrics.score -= 15 * (this.metrics.nestedLoopCount - 1);
        }

        // Check for recursion
        if (this.metrics.recursionCount > 0) {
            this.insights.push({
                type: 'info',
                message: `Detected ${this.metrics.recursionCount} recursive function(s). Ensure proper base cases and stack usage.`
            });
            this.metrics.score -= 5;
        }

        // Check for excessive functions
        if (this.metrics.functionCount > 10) {
            this.insights.push({
                type: 'suggestion',
                message: 'High number of functions. Consider consolidating related functionality.'
            });
            this.metrics.score -= 5;
        }

        // Check code size
        if (this.metrics.totalLines > 200) {
            this.insights.push({
                type: 'suggestion',
                message: 'Large code size. Consider breaking down into smaller modules.'
            });
            this.metrics.score -= 10;
        }

        // Check loop complexity
        if (this.metrics.loopCount > 5) {
            this.insights.push({
                type: 'warning',
                message: 'High number of loops. Review for potential optimizations.'
            });
            this.metrics.score -= 5;
        }

        // Ensure score stays within bounds
        this.metrics.score = Math.max(0, Math.min(100, this.metrics.score));
    }

    calculateScore() {
        // Additional score adjustments based on complexity
        if (this.metrics.nestedLoopCount > 2) {
            this.metrics.score -= 20;
        }
        
        // Penalize for very large functions
        const avgLinesPerFunction = this.metrics.totalLines / Math.max(1, this.metrics.functionCount);
        if (avgLinesPerFunction > 50) {
            this.metrics.score -= 10;
            this.insights.push({
                type: 'warning',
                message: 'Functions are too large on average. Consider breaking them down.'
            });
        }

        this.metrics.score = Math.max(0, Math.min(100, this.metrics.score));
    }
}

exports.analyzePerformance = async (req, res) => {
    try {
        const { code } = req.body;
        
        if (!code) {
            return res.status(400).json({
                success: false,
                message: 'No code provided'
            });
        }

        const analyzer = new PerformanceAnalyzer(code);
        const results = analyzer.analyze();

        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        console.error('Performance analysis error:', error);
        res.status(500).json({
            success: false,
            message: 'Error analyzing code performance',
            details: error.message
        });
    }
}; 