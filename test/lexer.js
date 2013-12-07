var assert = require('assert');

var lexer = require('../src/lexer');


function justTokens(tokenStream) {
    var token;
    var output = [];
    while ((token = tokenStream()) !== 'EOF') {
        output.push(token.text);
    }
    return output;
}

function tokensOfType(token, type) {
    var token = lexer(token)();
    assert.equal(token.type, type);
}

function matches(input) {
    var tokens = justTokens(lexer(input));
    assert.equal(input, tokens.join(' '));
}

describe('Lexer', function() {
    it('should tokenize most symbols', function() {
        matches('{ ( [ ] ) }');
        matches('+ - / * % == != <= >= = < >');
    });
    it('should tokenize keywords', function() {
        tokensOfType('var', 'var');
        tokensOfType('return', 'return');
        tokensOfType('switch', 'switch');
        tokensOfType('case', 'case');
        tokensOfType('while', 'while');
        tokensOfType('if', 'if');
        tokensOfType('else', 'else');
        tokensOfType('true', 'true');
        tokensOfType('false', 'false');
        tokensOfType('for', 'for');
        tokensOfType('null', 'null');
        tokensOfType('continue', 'continue');
        tokensOfType('break', 'break');
        tokensOfType('or', 'or');
        tokensOfType('and', 'and');
        tokensOfType('func', 'func');
    });
    it('should tokenize identifiers', function() {
        tokensOfType('hello', 'identifier');
        tokensOfType('Hello', 'identifier');
        tokensOfType('hell0', 'identifier');
    });
    it('should tokenize identifiers containing keywords', function() {
        matches('varfoo casebar');
    });
    it('should tokenize integers', function() {
        matches('123345 1000');
        tokensOfType('123456', 'integer');
        tokensOfType('1000', 'integer');
    });
    it('should tokenize floats', function() {
        matches('123.456 0.98765400');
        tokensOfType('123.456', 'float');
        tokensOfType('100.0', 'float');
        tokensOfType('0.98765400', 'float');
    });
});

