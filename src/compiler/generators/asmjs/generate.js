var fs = require('fs');
var path = require('path');

var externalFuncs = require('../js/externalFuncs');
var jsTranslate = require('./translate');
var postOptimizer = require('../js/postOptimizer');


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
        'var heap = new ArrayBuffer(' + getHeapSize(ENV_VARS.HEAP_SIZE + ENV_VARS.BUDDY_SPACE) + ');',
        'this.Math.imul = this.Math.imul || function(a, b) {return (a | 0) * (b | 0) | 0;};',
        'var ret = module(this, {' + env.foreigns.map(function(foreign) {
            var base = JSON.stringify(foreign) + ':';
            if (foreign in externalFuncs) {
                base += externalFuncs[foreign]();
            } else {
                base += 'function() {}';
            }
            return base;
        }).join(',') + '}, heap);',
        'if (ret.__init) ret.__init();',
        'return ret;',
        '})(function' + (env.name ? ' ' + env.name : ' module') + '(stdlib, foreign, heap) {',
        '    "use asm";',
        '    var imul = stdlib.Math.imul;',
        body,
        '})'
    ].join('\n');
}


module.exports = function generate(env, ENV_VARS) {

    var body = '';
    body += fs.readFileSync(path.resolve(__dirname, '../../static/asmjs/funcref.js')).toString();
    body += fs.readFileSync(path.resolve(__dirname, '../../static/asmjs/gc.js')).toString();
    body += fs.readFileSync(path.resolve(__dirname, '../../static/asmjs/memory.js')).toString();

    body += env.included.map(jsTranslate).join('\n\n');

    // Compile function list callers
    body += '\n' + Object.keys(env.funcList).map(function(flist) {
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
                        paramList.join(',') +
                        (paramList.length ? ',' : '') +
                        'ptrheap[$$ctx + 4 >> 2]|0)',
                    funcType.returnType
                ) +
                ';\n' +
            '}';
    }).join('\n');

    // Compile function lists
    body += '\n' + Object.keys(env.funcList).map(function(flist) {
        return '    var ' + flist + ' = [' + env.funcList[flist].join(',') + '];';
    }).join('\n');

    // Compile exports for the code.
    body += '\n    return {\n' +
        // 'malloc: malloc,\nfree: free,\n' +
        Object.keys(env.requested.exports).map(function(e) {
        return '        ' + e + ': ' + env.requested.exports[e];
    }).join(',\n    ') + '\n    };';

    body = postOptimizer.optimize(body);

    Object.keys(ENV_VARS).forEach(function(var_) {
        body = body.replace(new RegExp(var_, 'g'), ENV_VARS[var_].toString());
    });

    return makeModule(env, ENV_VARS, body);
};
