var assert = require('assert');

var lexer = require('../src/lexer');
var parser = require('../src/parser');

var node = parser.node;

function compareTree(script, tree) {
    var parsed = parser(lexer(script));
    console.log(parsed.body[0]);
    console.log(tree.body[0]);
    function compare(left, right, base, key) {
        if (left instanceof lexer.token) {
            assert.equal(left.text, right.text, 'Expected token "' + key + '" text to be equal in both trees at ' + base);
            assert.equal(left.type, right.type, 'Expected token "' + key + '" type to be equal in both trees at ' + base);
            return true;
        }
        if (!!left !== !!right) {
            assert.fail(left, right, 'Mismatched key "' + key + '" at ' + base + ': ' + left + ', ' + right);
        }
        if (left instanceof Array) {
            if (!arrEq(left, right, base + key)) {
                return false;
            }
        } else if (left instanceof Object) {
            if (!objEq(left, right, base + key)) {
                return false;
            }
        } else {
            assert.equal(left, right, 'Expected key "' + key + '" to be equal in both trees at ' + base + ': ' + left + ', ' + right);
        }
        return true;
    }
    function arrEq(left, right, base) {
        assert.equal(left.length, right.length, 'Arrays expected to be the same length at ' + base);
        for (var i = 0; i < left.length; i++) {
            if (!compare(left[i], right[i], base, '[' + i + ']')) return false;
        }
        return true;
    }
    function objEq(left, right, base) {
        base = base || '';
        if (left && left.type === 'Literal') {
            assert.equal(left.value, right.value, 'Expected literal value to be equal in both trees at ' + base);
            assert.equal(left.litType, right.litType, 'Expected literal type to be equal in both trees at ' + base);
            return true;
        }
        var keys = {};  // A set of string key names
        var key;
        for(key in left) {
            keys[key] = true;
            if (!(key in right)) {
                assert.fail('Key "' + key + '" was found in generated parse tree but not in expected parse tree at ' + base);
            }
            compare(left[key], right[key], base, '.' + key);
        }
        for(key in right) {
            if (!(key in keys)) {
                assert.fail('Key "' + key + '" was found in expected parse tree but not in generated parse tree at ' + base);
            }
        }
        return true;
    }
    assert(compare(parsed, tree, '', ''));
}

function _root(body) {
    return node('Root', null, null, {body: body});
}

function _i(text) {
    return new lexer.token(text, 'identifier', 0, 0);
}

function _int(val) {
    return node('Literal',0, 0, {value: val.toString(), litType: 'integer'});
}

describe('Parser', function() {
    it('should parse blank scripts', function() {
        compareTree('', _root([]));
    });
    describe('functions', function() {
        it('should parse empty named functions', function() {
            compareTree(
                'func retType:foo() {}',
                _root([
                    node(
                        'Function',
                        0,
                        21,
                        {
                            returnType: _i('retType'),
                            name: _i('foo'),
                            params: [],
                            body: []
                        }
                    )
                ])
            );
        });
        it('should parse empty unnamed functions', function() {
            compareTree(
                'func retType() {}',
                _root([
                    node(
                        'Function',
                        0,
                        17,
                        {
                            returnType: _i('retType'),
                            name: null,
                            params: [],
                            body: []
                        }
                    )
                ])
            );
        });

        it('should parse unnamed functions with params', function() {
            compareTree(
                'func retType(int:x, str:y) {}',
                _root([
                    node(
                        'Function',
                        0,
                        29,
                        {
                            returnType: _i('retType'),
                            name: null,
                            params: [
                                {type: _i('int'), name: _i('x')},
                                {type: _i('str'), name: _i('y')}
                            ],
                            body: []
                        }
                    )
                ])
            );
        });

        it('should parse nested functions', function() {
            compareTree(
                'func int:foo(int:x, str:y) {func str(bool:z){}}',
                _root([
                    node(
                        'Function',
                        0,
                        47,
                        {
                            returnType: _i('int'),
                            name: _i('foo'),
                            params: [
                                {type: _i('int'), name: _i('x')},
                                {type: _i('str'), name: _i('y')}
                            ],
                            body: [
                                node(
                                    'Function',
                                    28,
                                    46,
                                    {
                                        returnType: _i('str'),
                                        name: null,
                                        params: [
                                            {type: _i('bool'), name: _i('z')}
                                        ],
                                        body: []
                                    }
                                )
                            ]
                        }
                    )
                ])
            );
        });
        it('should parse return statements', function() {
            compareTree(
                'func int:foo() {return 3;}',
                _root([
                    node(
                        'Function',
                        0,
                        26,
                        {
                            returnType: _i('int'),
                            name: _i('foo'),
                            params: [],
                            body: [
                                node(
                                    'Return',
                                    16,
                                    25,
                                    {value: _int(3)}
                                )
                            ]
                        }
                    )
                ])
            );
        });
    });

    describe('assignments and declarations', function() {
        it('should parse basic assignments', function() {
            compareTree(
                'x = y;',
                _root([
                    node(
                        'Assignment',
                        0,
                        6,
                        {
                            base: _i('x'),
                            value: _i('y')
                        }
                    )
                ])
            );
        });
        it('should parse chained assignments', function() {
            compareTree(
                'x = y = z;',
                _root([
                    node(
                        'Assignment',
                        0,
                        10,
                        {
                            base: _i('x'),
                            value: node(
                                'Assignment',
                                3,
                                9,
                                {
                                    base: _i('y'),
                                    value: _i('z')
                                }
                            )
                        }
                    )
                ])
            );
        });
        it('should parse basic declarations', function() {
            compareTree(
                'var x = y;',
                _root([
                    node(
                        'Declaration',
                        0,
                        10,
                        {
                            type: null,
                            identifier: _i('x'),
                            value: _i('y')
                        }
                    )
                ])
            );
        });
        it('should parse typed declarations', function() {
            compareTree(
                'int:x = y;',
                _root([
                    node(
                        'Declaration',
                        0,
                        10,
                        {
                            type: _i('int'),
                            identifier: _i('x'),
                            value: _i('y')
                        }
                    )
                ])
            );
        });
    });

    describe('calls', function() {
        it('should parse call statements', function() {
            compareTree(
                'foo();',
                _root([
                    node(
                        'Call',
                        0,
                        6,
                        {
                            callee: _i('foo'),
                            params: []
                        }
                    )
                ])
            );
        });
        it('should parse call expressions', function() {
            compareTree(
                'x = foo();',
                _root([
                    node(
                        'Assignment',
                        0,
                        10,
                        {
                            base: _i('x'),
                            value: node(
                                'Call',
                                3,
                                9,
                                {
                                    callee: _i('foo'),
                                    params: []
                                }
                            )
                        }
                    )
                ])
            );
        });
        it('should parse calls with parameters', function() {
            compareTree(
                'foo(x, y, bar());',
                _root([
                    node(
                        'Call',
                        0,
                        17,
                        {
                            callee: _i('foo'),
                            params: [
                                _i('x'),
                                _i('y'),
                                node(
                                    'Call',
                                    9,
                                    15,
                                    {
                                        callee: _i('bar'),
                                        params: []
                                    }
                                )
                            ]
                        }
                    )
                ])
            );
        });
        it('should parse chained calls', function() {
            compareTree(
                'foo()();',
                _root([
                    node(
                        'Call',
                        0,
                        8,
                        {
                            callee: node(
                                'Call',
                                0,
                                5,
                                {
                                    callee: _i('foo'),
                                    params: []
                                }
                            ),
                            params: []
                        }
                    )
                ])
            );
        });
    });

    describe('binary operators', function() {
        it('should parse binops around literals', function() {
            compareTree(
                'x = 3 + 4;',
                _root([
                    node(
                        'Assignment',
                        0,
                        10,
                        {
                            base: _i('x'),
                            value: node(
                                'Binop',
                                3,
                                9,
                                {
                                    left: _int(3),
                                    right: _int(4),
                                    operator: '+'
                                }
                            )
                        }
                    )
                ])
            );
        });
        it('should parse nested binops', function() {
            compareTree(
                'x = 3 + 4 + 5;',
                _root([
                    node(
                        'Assignment',
                        0,
                        14,
                        {
                            base: _i('x'),
                            value: node(
                                'Binop',
                                3,
                                13,
                                {
                                    left: node(
                                        'Binop',
                                        3,
                                        9,
                                        {
                                            left: _int(3),
                                            right: _int(4),
                                            operator: '+'
                                        }
                                    ),
                                    right: _int(5),
                                    operator: '+'
                                }
                            )
                        }
                    )
                ])
            );
        });
        it('should parse nested binops with inverted precedence', function() {
            compareTree(
                'x = 3 * 4 + 5;',
                _root([
                    node(
                        'Assignment',
                        0,
                        14,
                        {
                            base: _i('x'),
                            value: node(
                                'Binop',
                                3,
                                13,
                                {
                                    left: node(
                                        'Binop',
                                        3,
                                        9,
                                        {
                                            left: _int(3),
                                            right: _int(4),
                                            operator: '*'
                                        }
                                    ),
                                    right: _int(5),
                                    operator: '+'
                                }
                            )
                        }
                    )
                ])
            );
        });
        it('should parse complex binary operations', function() {
            compareTree(
                'x = 3 * 4 <= 20 or 5 % 2 * 2 == 2 and true;',
                _root([
                    node(
                        'Assignment',
                        0,
                        43,
                        {
                            base: _i('x'),
                            value: node(
                                'LogicalBinop',
                                3,
                                42,
                                {
                                    left: node(
                                        'RelativeBinop',
                                        3,
                                        15,
                                        {
                                            left: node(
                                                'Binop',
                                                3,
                                                9,
                                                {
                                                    left: _int(3),
                                                    right: _int(4),
                                                    operator: '*'
                                                }
                                            ),
                                            right: _int(20),
                                            operator: '<='
                                        }
                                    ),
                                    right: node(
                                        'LogicalBinop',
                                        18,
                                        42,
                                        {
                                            left: node(
                                                'EqualityBinop',
                                                18,
                                                33,
                                                {
                                                    left: node(
                                                        'Binop',
                                                        18,
                                                        28,
                                                        {
                                                            left: node(
                                                                'Binop',
                                                                18,
                                                                24,
                                                                {
                                                                    left: _int(5),
                                                                    right: _int(2),
                                                                    operator: '%'
                                                                }
                                                            ),
                                                            right: _int(2),
                                                            operator: '*'
                                                        }
                                                    ),
                                                    right: _int(2),
                                                    operator: '=='
                                                }
                                            ),
                                            right: node(
                                                'Literal',
                                                38,
                                                42,
                                                {
                                                    value: true,
                                                    litType: 'bool'
                                                }
                                            ),
                                            operator: 'and'
                                        }
                                    ),
                                    operator: 'or'
                                }
                            )
                        }
                    )
                ])
            );
        });
    });

    describe('conditionals', function() {
        it('should parse simple blocks', function() {
            compareTree(
                'if(x) {foo();}',
                _root([
                    node(
                        'If',
                        0,
                        14,
                        {
                            condition: _i('x'),
                            consequent: [node(
                                'Call',
                                7,
                                13,
                                {
                                    callee: _i('foo'),
                                    params: []
                                }
                            )],
                            alternate: null
                        }
                    )
                ])
            );
        });
        it('should parse single statements without braces', function() {
            compareTree(
                'if(x) foo();',
                _root([
                    node(
                        'If',
                        0,
                        12,
                        {
                            condition: _i('x'),
                            consequent: [node(
                                'Call',
                                5,
                                12,
                                {
                                    callee: _i('foo'),
                                    params: []
                                }
                            )],
                            alternate: null
                        }
                    )
                ])
            );
        });
        it('should parse simple alternates', function() {
            compareTree(
                'if(x) {foo();} else {bar();}',
                _root([
                    node(
                        'If',
                        0,
                        28,
                        {
                            condition: _i('x'),
                            consequent: [node(
                                'Call',
                                7,
                                13,
                                {
                                    callee: _i('foo'),
                                    params: []
                                }
                            )],
                            alternate: [node(
                                'Call',
                                21,
                                27,
                                {
                                    callee: _i('bar'),
                                    params: []
                                }
                            )]
                        }
                    )
                ])
            );
        });
        it('should parse simple alternates without braces', function() {
            compareTree(
                'if(x) foo(); else bar();',
                _root([
                    node(
                        'If',
                        0,
                        24,
                        {
                            condition: _i('x'),
                            consequent: [node(
                                'Call',
                                5,
                                12,
                                {
                                    callee: _i('foo'),
                                    params: []
                                }
                            )],
                            alternate: [node(
                                'Call',
                                17,
                                24,
                                {
                                    callee: _i('bar'),
                                    params: []
                                }
                            )]
                        }
                    )
                ])
            );
        });
        it('should parse simple alternates without braces', function() {
            compareTree(
                'if(x) foo(); else if (y)bar();',
                _root([
                    node(
                        'If',
                        0,
                        30,
                        {
                            condition: _i('x'),
                            consequent: [node(
                                'Call',
                                5,
                                12,
                                {
                                    callee: _i('foo'),
                                    params: []
                                }
                            )],
                            alternate: [node(
                                'If',
                                17,
                                30,
                                {
                                    condition: _i('y'),
                                    consequent: [node(
                                        'Call',
                                        24,
                                        30,
                                        {
                                            callee: _i('bar'),
                                            params: []
                                        }
                                    )],
                                    alternate: null
                                }
                            )]
                        }
                    )
                ])
            );
        });
    });
});
