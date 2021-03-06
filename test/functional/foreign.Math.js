import assert from 'assert';
import child_process from 'child_process';
import fs from 'fs';
import path from 'path';

import compiler, {buildEnv} from '../../src/compiler/compiler';
import lexer from '../../src/lexer';
import parser from '../../src/parser';
import {processData} from '../../src/cli/main';


describe('foreign.Math module', function() {

    function run(parsed, format, expectation, outputType) {
        var compiled = compiler({
            filename: 'test',
            tree: parsed,
            format: format,
        });

        var mod;
        try {
            mod = (new Function('return ' + compiled))();
        } catch (e) {
            console.log(compiled);
            assert.fail('Error during initialization: ' + e.toString());
        }

        var result;
        try {
            result = mod.main();
        } catch (e) {
            console.error(compiled);
            throw e;
        }

        compareResult(result, expectation, outputType);
    }

    function compareResult(result, expectation, outputType) {
        if (outputType === 'float') {
            result = parseFloat(result);
            expectation = parseFloat(expectation);
            assert.ok(Math.abs(result - expectation) < 0.0001);
        } else {
            assert.equal(result, expectation);
        }

    }

    function suite(code, expectation) {
        var mainReturnType;

        var parsed;
        beforeEach(function() {
            parsed = parser(lexer(code));
            var env = buildEnv({filename: 'test', tree: parsed});
            var mainFunc = env.requested.exports.get('main');
            var mainFuncDef = env.requested.functionDeclarations.get(mainFunc);
            mainReturnType = mainFuncDef.resolveType(env.requested).getReturnType().typeName;
        });

        it('should work in JS', function() {
            run(parsed, 'js', expectation, mainReturnType);
        });

        it('should work in asm.js', function() {
            run(parsed, 'asmjs', expectation, mainReturnType);
        });

        it('should work in LLVM IR', function(done) {
            this.slow(500);

            function runAndPipe(command, stdin, cb) {
                var cp = child_process.exec(command, cb);
                cp.stdin.write(stdin);
                cp.stdin.end();
            }

            var raw = 'import debug;\n' + code + '\n';
            switch (mainReturnType) {
                case 'int':
                    raw += 'func testmain() {\n    debug.printint(main());\n}\nexport testmain;';
                    break;
                case 'float':
                    raw += 'func testmain() {\n    debug.printfloat(main());\n}\nexport testmain;';
                    break;
            }

            processData(
                raw,
                {
                    _: ['test.bt'],
                    target: 'llvmir',
                    runtime: true,
                    'runtime-entry': 'testmain',
                },
                result => {
                    if (!result) {
                        console.error('No output from CLI main');
                        done(new Error('no output'));
                    }

                    // console.log(result);
                    // return;

                    runAndPipe(
                        'opt -S -O1 | lli',
                        result,
                        function(err, stdout, stderr) {
                            if (err) {
                                console.error(err);
                                done(err);
                            } else if (stderr) {
                                console.error(stderr);
                                done(stderr);
                            } else {
                                compareResult(JSON.parse(stdout), JSON.parse(expectation), mainReturnType);
                                done();
                            }
                        }
                    );
                }
            );

        });
    }

    describe('abs()', function() {
        suite(
            'import foreign;\n' +
            'func int:main() {\n' +
            '    return foreign.Math.abs(-25);\n' +
            '}\n' +
            'export main;',
            '25'
        );
    });
    describe('sin()', function() {
        suite(
            'import foreign;\n' +
            'func float:main() {\n' +
            '    return foreign.Math.sin(3.14159265358979);\n' +
            '}\n' +
            'export main;',
            '0'
        );
    });
    describe('cos()', function() {
        suite(
            'import foreign;\n' +
            'func float:main() {\n' +
            '    return foreign.Math.cos(3.14159265358979);\n' +
            '}\n' +
            'export main;',
            '-1'
        );
    });
    describe('tan()', function() {
        suite(
            'import foreign;\n' +
            'func float:main() {\n' +
            '    return foreign.Math.tan(3.14159265358979);\n' +
            '}\n' +
            'export main;',
            '0'
        );
    });
    describe('sqrt()', function() {
        suite(
            'import foreign;\n' +
            'func float:main() {\n' +
            '    return foreign.Math.sqrt(16.0);\n' +
            '}\n' +
            'export main;',
            '4.0'
        );
    });
    describe('log()', function() {
        suite(
            'import foreign;\n' +
            'func float:main() {\n' +
            '    return foreign.Math.log(7.3890560989306495);\n' +
            '}\n' +
            'export main;',
            '2.0'
        );
    });
    describe('pow()', function() {
        suite(
            'import foreign;\n' +
            'func float:main() {\n' +
            '    return foreign.Math.pow(2.0, 4.0);\n' +
            '}\n' +
            'export main;',
            '16.0'
        );
    });
    describe('exp()', function() {
        suite(
            'import foreign;\n' +
            'func float:main() {\n' +
            '    return foreign.Math.exp(2.0);\n' +
            '}\n' +
            'export main;',
            '7.3890560989306495'
        );
    });
    describe('ceil()', function() {
        suite(
            'import foreign;\n' +
            'func int:main() {\n' +
            '    return foreign.Math.ceil(4.1);\n' +
            '}\n' +
            'export main;',
            '5'
        );
    });
    describe('floor()', function() {
        suite(
            'import foreign;\n' +
            'func int:main() {\n' +
            '    return foreign.Math.floor(4.9);\n' +
            '}\n' +
            'export main;',
            '4'
        );
    });

});
