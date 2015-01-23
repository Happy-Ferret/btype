var fs = require('fs');
var path = require('path');

var externalFuncs = require('../js/externalFuncs');
var jsTranslate = require('./translate');
var postOptimizer = require('../js/postOptimizer');
var traverser = require('../../traverser');


function getHeapSize(n) {
    // This calculates the next power of two
    var x = Math.log(n) / Math.LN2;
    x = Math.floor(x);
    x += 1;
    x = Math.pow(2, x);
    return x;
}

function makeModule(env, ENV_VARS, body) {
    return [
        '(function(module) {',
        // Create the heap
        'var heap = new ArrayBuffer(' + getHeapSize(ENV_VARS.HEAP_SIZE + ENV_VARS.BUDDY_SPACE) + ');',
        // Shim imul if it doesn't exist (*COUGH* NODE *COUGH*)
        'this.Math.imul = this.Math.imul || function imul(a, b) {return (a | 0) * (b | 0) | 0;};',
        'this.Math.fround = this.Math.fround || function fround(x) {var f32 = new Float32Array(1);return f32[0] = x, f32[0];};',
        // Get an instance of the asm module, passing in all of the externally requested items
        'var ret = module(this, {' + env.foreigns.map(function(foreign) {
            var base = JSON.stringify(foreign) + ':';
            if (foreign in externalFuncs) {
                base += externalFuncs[foreign]();
            } else {
                base += 'function() {}';
            }
            return base;
        }).join(',') + '}, heap);',
        // If there's an init method, call it and remove it.
        'if (ret.$init) {ret.$init(); delete ret.$init;}',
        // Return the processed asm module
        'return ret;',
        // Declare the asm module
        '})(function' + (env.name ? ' ' + env.name : ' module_') + '(stdlib, foreign, heap) {',
        // asm.js pragma
        '    "use asm";',
        // Always add imul since it's used for integer multiplication
        '    var imul = stdlib.Math.imul;',
        // Same for fround to support sfloat
        '    var fround = stdlib.Math.fround;',
        body,
        '})'
    ].join('\n');
}

function registerAllUsedMethods(env) {

    // We need to ensure that all methods that are accessed (called, stored,
    // etc.) are registered. If not, the first method with a unique signature
    // will be optimized with the "only method in the function table"
    // optimziation, causing it to be called directly. This is invalid, though,
    // because the order in which the methods are accessed does not guarantee
    // the order in which they will be used.

    var knownMethods = {};
    env.types.forEach(function(type) {
        if (!type.methods) return;

        for (var i in type.methods) {
            knownMethods[type.methods[i]] = true;
        }
    });

    env.included.forEach(function(ctx) {
        traverser.traverse(ctx.scope, function(node) {
            if (node.type !== 'Member') return;

            var baseType = node.base.getType(ctx);
            if (!baseType.hasMethod(node.child)) return;

            var funcNode = env.findFunctionByAssignedName(baseType.getMethod(node.child));

            if (!(funcNode.__assignedName in knownMethods)) return;

            env.registerFunc(funcNode);
        });
    });
}


module.exports = function generate(env, ENV_VARS) {

    registerAllUsedMethods(env);

    var body = '';

    // Include static modules
    body += fs.readFileSync(path.resolve(__dirname, '../../static/asmjs/casting.js')).toString();
    body += fs.readFileSync(path.resolve(__dirname, '../../static/asmjs/funcref.js')).toString();
    body += fs.readFileSync(path.resolve(__dirname, '../../static/asmjs/gc.js')).toString();
    body += fs.readFileSync(path.resolve(__dirname, '../../static/asmjs/memory.js')).toString();

    // Translate and output each included context
    body += env.included.map(jsTranslate).join('\n\n');

    if (env.inits.length) {
        body += '\nfunction $init() {\n' +
            '    ' + env.inits.map(function(init) {
                return init.__assignedName + '();';
            }).join('\n    ') + '\n' +
            '}\n';
        env.requested.exports['$init'] = '$init';
    }

    // Compile function list callers
    body += '\n' + Object.keys(env.funcList).map(function(flist) {
        if (env.funcList[flist].length === 1) return '';
        var funcList = env.funcList[flist];
        var funcType = env.funcListReverseTypeMap[flist];
        var paramList = funcType.args.map(function(param, i) {
            return '$param' + i;
        });
        return 'function ' + flist + '$$call($$ctx' +
            (paramList.length ? ',' : '') +
            paramList.join(',') +
            ') {\n' +
            '    $$ctx = $$ctx | 0;\n' +
            funcType.args.map(function(arg, i) {
                var base = '$param' + i;
                return '    ' + base + ' = ' + jsTranslate.typeAnnotation(base, arg) + ';';
            }).join('\n') + '\n' +
            '    return ' + jsTranslate.typeAnnotation(
                    flist + '[ptrheap[$$ctx >> 2]&' + (funcList.length - 1) + '](' +
                        'ptrheap[$$ctx + 4 >> 2]|0' +
                        (paramList.length ? ',' : '') +
                        paramList.join(',') +
                        ')',
                    funcType.returnType
                ) +
                ';\n' +
            '}';
    }).join('\n');

    // Compile function lists
    body += '\n' + Object.keys(env.funcList).map(function(flist) {
        if (env.funcList[flist].length === 1) return '';
        return '    var ' + flist + ' = [' + env.funcList[flist].join(',') + '];';
    }).filter(function(x) {return !!x;}).join('\n');

    // Compile exports for the code.
    body += '\n    return {\n        ' +
        // 'malloc: malloc,\n        free: free,\n        ' +
        Object.keys(env.requested.exports).map(function(e) {
        return e + ': ' + env.requested.exports[e];
    }).join(',\n        ') + '\n    };';

    body = postOptimizer.optimize(body);

    Object.keys(ENV_VARS).forEach(function(var_) {
        body = body.replace(new RegExp(var_, 'g'), ENV_VARS[var_].toString());
    });

    return makeModule(env, ENV_VARS, body);
};
