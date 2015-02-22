var types = require('../../types');

var externalFuncs = require('./externalFuncs');

var getAlignment = require('./util').getAlignment;
var getFunctionSignature = require('./util').getFunctionSignature;
var getLLVMType = require('./util').getLLVMType;
var makeName = require('./util').makeName;


function TranslationContext(env, ctx) {
    this.env = env;
    this.ctx = ctx;

    this.outputStack = [''];
    this.countStack = [0];
    this.indentation = '';
    this.loopStack = [];

    this.uniqCounter = 0;

    this.push = function() {
        this.outputStack.unshift('');
        this.countStack.unshift(this.countStack[0]);
        this.indentation += '    ';
    };

    this.pushLoop = function(startLabel, exitLabel) {
        this.loopStack.unshift({
            start: startLabel,
            exit: exitLabel,
        });
    };

    this.pop = function() {
        var popped = this.outputStack.shift();
        this.outputStack[0] += popped;
        this.countStack.shift();
        this.indentation = this.indentation.substr(4);
    };

    this.popLoop = function(startLabel, exitLabel) {
        this.loopStack.shift();
    };

    this.write = function(data, noIndent) {
        this.outputStack[0] += (noIndent ? '' : this.indentation) + data + '\n';
    };

    this.prepend = function(data, noIndent) {
        this.outputStack[0] = (noIndent ? '' : this.indentation) + data + '\n' + this.outputStack[0];
    };

    this.toString = function() {
        if (this.outputStack.length > 1) {
            throw new Error('Leaking output in LLVM IR generator');
        }
        return this.outputStack[0];
    };

    this.getRegister = function() {
        return '%' + this.countStack[0]++;
    };

    this.getUniqueLabel = function(prefix) {
        return (prefix || 'lbl') + (this.uniqCounter++);
    };
}


function _binop(env, ctx, tctx) {
    var out;
    var left = _node(this.left, env, ctx, tctx);
    var right = _node(this.right, env, ctx, tctx);
    var outReg = tctx.getRegister();

    var outType = this.getType(ctx);

    var leftType = this.left.getType(ctx);
    var rightType = this.right.getType(ctx);
    var leftTypeString = leftType.toString();
    var rightTypeString = rightType.toString();

    if (ctx.env.registeredOperators[leftTypeString] &&
        ctx.env.registeredOperators[leftTypeString][rightTypeString] &&
        ctx.env.registeredOperators[leftTypeString][rightTypeString][this.operator]) {

        var operatorStmtFunc = ctx.env.registeredOperators[leftTypeString][rightTypeString][this.operator];

        tctx.write(outReg + ' = call fastcc ' + getLLVMType(outType) + ' @' + makeName(operatorStmtFunc) + '(' +
            getLLVMType(leftType) + ' ' + left + ', ' +
            getLLVMType(rightType) + ' ' + right +
            ')');
        return outReg;
    }

    switch (this.operator) {
        case 'and':
            out = 'and';
            break;
        case 'or':
            out = 'or';
            break;
        case '+':
            if (outType.typeName === 'float' || outType.typeName === 'sfloat') {
                out = 'fadd';
                break;
            }

            out = 'add ';
            if (outType.typeName === 'uint') out += 'nuw';
            else if (outType.typeName === 'byte') out += 'nuw';
            else if (outType.typeName === 'int') out += 'nsw';
            break;

        case '-':
            if (outType.typeName === 'float' || outType.typeName === 'sfloat') {
                out = 'fsub';
                break;
            }

            out = 'sub ';
            if (outType.typeName === 'uint') out += 'nuw';
            else if (outType.typeName === 'byte') out += 'nuw';
            else if (outType.typeName === 'int') out += 'nsw';
            break;

        case '*':
            if (outType.typeName === 'float' || outType.typeName === 'sfloat') {
                out = 'fmul';
                break;
            }

            out = 'mul ';
            if (outType.typeName === 'uint') out += 'nuw';
            else if (outType.typeName === 'byte') out += 'nuw';
            else if (outType.typeName === 'int') out += 'nsw';
            break;

        case '/':
            if (outType.typeName === 'float' || outType.typeName === 'sfloat') {
                out = 'fdiv';
                break;
            } else if (outType.typeName === 'uint') {
                out = 'udiv';
                break;
            }

            out = 'sdiv ';
            break;

        case '%':
            if (outType.typeName === 'float' || outType.typeName === 'sfloat') {
                out = 'frem';
                break;
            } else if (outType.typeName === 'uint') {
                out = 'urem';
                break;
            }

            out = 'srem ';
            break;

        case '<<':
            out = 'shl ';
            if (outType.typeName === 'uint') out += 'nuw';
            else if (outType.typeName === 'byte') out += 'nuw';
            else if (outType.typeName === 'int') out += 'nsw';
            break;

        case '>>':
            if (outType.typeName === 'uint') out = 'lshr';
            else if (outType.typeName === 'int') out = 'ashr';
            break;

        case '&':
            out = 'and';
            break;
        case '|':
            out = 'or';
            break;
        case '^':
            out = 'xor';
            break;

        case '==':
            if (leftType.typeName === 'float' || leftType.typeName === 'sfloat') out = 'fcmp oeq';
            else out = 'icmp eq';
            break;

        case '!=':
            if (leftType.typeName === 'float' || leftType.typeName === 'sfloat') out = 'fcmp one';
            else out = 'icmp neq';
            break;

        case '>':
            if (leftType.typeName === 'uint') out = 'icmp ugt';
            else if (leftType.typeName === 'byte') out = 'icmp ugt';
            else if (leftType.typeName === 'int') out = 'icmp sgt';
            else if (leftType.typeName === 'float' || leftType.typeName === 'sfloat') out = 'fcmp ogt';
            break;


        case '>=':
            if (leftType.typeName === 'uint') out = 'icmp uge';
            else if (leftType.typeName === 'byte') out = 'icmp uge';
            else if (leftType.typeName === 'int') out = 'icmp sge';
            else if (leftType.typeName === 'float' || leftType.typeName === 'sfloat') out = 'fcmp oge';
            break;

        case '<':
            if (leftType.typeName === 'uint') out = 'icmp ult';
            else if (leftType.typeName === 'byte') out = 'icmp ult';
            else if (leftType.typeName === 'int') out = 'icmp slt';
            else if (leftType.typeName === 'float' || leftType.typeName === 'sfloat') out = 'fcmp olt';
            break;

        case '<=':
            if (leftType.typeName === 'uint') out = 'icmp ule';
            else if (leftType.typeName === 'byte') out = 'icmp ule';
            else if (leftType.typeName === 'int') out = 'icmp sle';
            else if (leftType.typeName === 'float' || leftType.typeName === 'sfloat') out = 'fcmp ole';
            break;

        default:
            throw new Error('Unknown binary operator: ' + this.operator);
    }

    tctx.write(outReg + ' = ' + out + ' ' + getLLVMType(outType) + ' ' + left + ', ' + right);
    return outReg;
}

function _node(node, env, ctx, tctx, extra) {
    if (!(node.type in NODES)) {
        throw new Error(node.type + ' is not a supported node');
    }
    return NODES[node.type].call(node, env, ctx, tctx, extra);
}

var NODES = {
    Root: function(env, ctx, tctx) {
        env.__globalPrefix = '';
        env.__foreignRequested = {};
        env.__arrayTypes = {};
        env.__funcrefTypes = {};
        this.body.forEach(function(stmt) {
            _node(stmt, env, ctx, tctx);
        });
        tctx.prepend(env.__globalPrefix);
        delete env.__globalPrefix;
    },
    Unary: function(env, ctx, tctx) {
        var out = _node(this.base, env, ctx, tctx);
        var outType = this.getType(ctx);

        var reg = tctx.getRegister();
        switch (this.operator) {
            case '~':
                tctx.write(reg + ' = xor ' + getLLVMType(outType) + ' ' + out + ', 1');
                break;
            case '!':
                tctx.write(reg + ' = xor i1 ' + out + ', 1');
                break;
            default:
                throw new Error('Undefined unary operator: "' + this.operator + '"');
        }

        return reg;
    },
    LogicalBinop: _binop,
    EqualityBinop: _binop,
    RelativeBinop: _binop,
    Binop: _binop,
    CallStatement: function(env, ctx, tctx) {
        // TODO: Is there a GC issue here?
        tctx.write(_node(this.base, env, ctx, tctx, 'stmt'));
    },
    CallRaw: function(env, ctx, tctx, extra) {
        var outReg = tctx.getRegister();
        var output = outReg + ' = call ';

        // `fastcc` is a calling convention that attempts to make the call as
        // fast as possible.
        output += 'fastcc ';

        // Add the expected return type
        if (extra === 'stmt') {
            // Tell LLVM that we don't care about the return type because this
            // is a call statement.
            // TODO: Is this correct?
            output += 'void ';
        } else {
            output += getLLVMType(this.getType(ctx)) + ' ';
        }

        output += _node(this.callee, env, ctx, tctx, 'callee');

        output += '(';

        output += this.params.map(function(param) {
            var paramType = param.getType(ctx);
            return getLLVMType(paramType) + ' ' + _node(param, env, ctx, tctx);
        }).join(', ');

        output += ')';

        tctx.write(output);
        return outReg;

    },
    CallDecl: function(env, ctx, tctx, extra) {
        return NODES.CallRaw.apply(this, arguments);
    },
    CallRef: function(env, ctx, tctx, extra) {
        var type = this.callee.getType(ctx);
        var typeName = getLLVMType(type);

        var typeRefName = getFunctionSignature(type);

        var callee = _node(this.callee, env, ctx, tctx);

        var outputReg = tctx.getRegister();
        var funcPtrReg = tctx.getRegister();
        var funcReg = tctx.getRegister();
        tctx.write(funcPtrReg + ' = getelementptr inbound ' + typeName + ' ' + callee + ', i32 0');
        tctx.write(funcReg + ' = load ' + typeRefName + ' ' + funcPtrReg);
        var ctxPtrReg = tctx.getRegister();
        var ctxReg = tctx.getRegister();
        tctx.write(ctxPtrReg + ' = getelementptr inbound ' + typeName + ' ' + callee + ', i32 1');
        tctx.write(ctxReg + ' = load i8* ' + ctxPtrReg);

        var params = this.params.map(function(p) {
            var type = p.getType(ctx);
            var typeName = getLLVMType(type);
            return typeName + ' ' + _node(p, env, ctx, tctx);
        }).join(', ');

        var isNullCmpReg = this.getRegister();
        tctx.write(isNullCmpReg + ' = icmp eq i8* ' + ctxReg + ', null');

        var returnType = getLLVMType(this.getType(ctx));
        var callRetPtr = this.getRegister();
        tctx.write(callRetPtr + ' = alloca ' + returnType);
        var callRet = this.getRegister();


        var nullLabel = this.getUniqueLabel('isnull');
        var unnullLabel = this.getUniqueLabel('unnull');
        var afternullLabel = this.getUniqueLabel('afternull');
        tctx.write('br i1 ' + isNullCmpReg + ', label %' + nullLabel + ', label %' + unnullLabel);

        tctx.write(nullLabel + ':', true);
        var nullRetPtr = this.getRegister();
        tctx.write(nullRetPtr + ' = call ' + returnType + ' ' + funcReg + '(' + params + ')');
        tctx.write('store ' + returnType + ' ' + nullRetPtr + ', ' + returnType + '* ' + callRetPtr);
        tctx.write('br label %' + afternullLabel);

        tctx.write(unnullLabel + ':', true);
        var unnullRetPtr = this.getRegister();
        tctx.write(
            unnullRetPtr + ' = call ' + returnType + ' ' + funcReg +
            '(' +
            getLLVMType(type.args[0]) + ' ' + ctxReg +
            (this.params.length ? ', ' : '') +
            params +
            ')'
        );
        tctx.write('store ' + returnType + ' ' + unnullRetPtr + ', ' + returnType + '* ' + callRetPtr);

        tctx.write(afternullLabel + ':', true);
        tctx.write(callRet + ' = load ' + returnType + ' ' + callRetPtr);
        return callRet;

    },
    FunctionReference: function(env, ctx, tctx) {
        var type = this.getType(ctx);
        var typeName = getLLVMType(type);

        var funcType = getFunctionSignature(type);

        if (!(typeName in env.__funcrefTypes)) {
            env.__globalPrefix += '\n' + typeName + ' = type { ' + funcType + ', i8* }'
            env.__funcrefTypes[typeName] = true;
        }

        var reg = tctx.getRegister();
        tctx.write(reg + ' = call i8* @malloc(i32 16)'); // 16 is just to be safe for 64 bit
        var regPtr = tctx.getRegister();
        tctx.write(regPtr + ' = bitcast i8* ' + reg + ' to ' + typeName + '*');

        var funcLocPtr = tctx.getRegister();
        tctx.write(funcLocPtr + ' = getelementptr ' + typeName + ' ' + regPtr + ', i32 0');
        tctx.write('store ' + funcType + ' ' + _node(this.base, env, ctx, tctx) + ', ' + funcType + '* ' + funcLocPtr);

        var ctxLocPtr = tctx.getRegister();
        tctx.write(ctxLocPtr + ' = getelementptr ' + typeName + ' ' + regPtr + ', i32 1');
        if (this.ctx) {
            var ctxType = this.ctx.getType(ctx);
            var ctxTypeName = getLLVMType(ctxType);
            var ctxCastLocPtr = tctx.getRegister();
            tctx.write(ctxCastLocPtr + ' = bitcast ' + ctxTypeName + ' ' + _node(this.ctx, env, ctx, tctx) + ' to i8*');
            tctx.write('store i8* ' + ctxCastLocPtr + ', i8** ' + ctxLocPtr);
        } else {
            tctx.write('store i8* null, i8** ' + ctxLocPtr);
        }

        return regPtr;
    },
    Member: function(env, ctx, tctx, parent) {
        var baseType = this.base.getType(ctx);
        if (baseType._type === 'module') {
            return baseType.memberMapping[this.child];
        }

        if (baseType._type === '_stdlib') {
            throw new Error('Not Implemented: stdlib');
            var stdlibName = baseType.name + '.' + this.child;
            if (stdlibName in env.__stdlibRequested) {
                return env.__stdlibRequested[stdlibName];
            }
            var stdlibAssignedName = env.namer();
            env.__globalPrefix += 'var ' + stdlibAssignedName + ' = stdlib.' + stdlibName + ';\n';
            env.__stdlibRequested[stdlibName] = stdlibAssignedName;
            return stdlibAssignedName;
        }

        if (baseType._type === '_foreign') {
            env.foreigns.push(this.child);
            if (!(this.child in env.__foreignRequested)) {
                var funcVal = externalFuncs[this.child]();
                env.__globalPrefix += funcVal + '\n';
                env.__foreignRequested[this.child] = true;
            }

            return '@foreign_' + makeName(this.child);
        }

        if (baseType._type === '_foreign_curry') {
            return _node(this.base, env, ctx, tctx);
        }

        if (baseType.hasMethod && baseType.hasMethod(this.child)) {
            throw new Error('Not Implemented: method');
            var objectMethodFunc = ctx.lookupFunctionByName(baseType.getMethod(this.child));
            var objectMethodFuncIndex = env.registerFunc(objectMethodFunc);
            return '((getboundmethod(' + objectMethodFuncIndex + ', ' + _node(this.base, env, ctx, tctx) + ')|0) | 0)';
        }

        var layoutIndex = baseType.getLayoutIndex(this.child);
        var outReg = tctx.getRegister();

        tctx.write(outReg + ' = extractvalue ' +
            getLLVMType(this.getType(ctx)) + ' ' +
            _node(this.base, env, ctx, tctx),
            ', ' +
            layoutIndex);
        return outReg;
    },
    Assignment: function(env, ctx, tctx) {
        var type = this.value.getType(ctx);
        var typeName = getLLVMType(type);

        var value = _node(this.value, env, ctx, tctx);
        var base = _node(this.base, env, ctx, tctx);

        tctx.write('store ' + typeName + ' ' + value + ', ' + typeName + '* ' + base + ', align ' + getAlignment(type));
    },
    Declaration: function(env, ctx, tctx) {
        var declType = this.getType(ctx);
        if (declType === null) {
            console.log(this);
        }
        var typeName = getLLVMType(declType);
        var ptrName = '%' + makeName(this.__assignedName);
        if (this.value) {
            tctx.write('store ' + _node(this.value, env, ctx, tctx) + ', ' + typeName + '* ' + ptrName + ', align ' + getAlignment(declType));
        } else {
            tctx.write('store ' + typeName + ' null, ' + typeName + '* ' + ptrName);
        }
    },
    ConstDeclaration: function() {
        NODES.Declaration.apply(this, arguments);
    },
    Return: function(env, ctx, tctx) {
        if (!this.value) {
            tctx.write('ret void');
            return;
        }
        tctx.write('ret ' + getLLVMType(this.value.getType(ctx)) + ' ' + _node(this.value, env, ctx, tctx));
    },
    Export: function() {},
    Import: function() {},
    For: function(env, ctx, tctx) {
        var innerLbl = tctx.getUniqueLabel('inner');
        var afterLbl = tctx.getUniqueLabel('after');

        _node(this.assignment, env, ctx, tctx);

        var loopLbl = tctx.getUniqueLabel('loop');
        tctx.write(loopLbl + ':', true);

        tctx.pushLoop(loopLbl, afterLbl);

        var condResult = _node(this.condition, env, ctx, tctx);
        tctx.write('br i1 ' + condResult + ', label %' + innerLbl + ', label %' + afterLbl);
        tctx.write(innerLbl + ':', true);

        this.body.forEach(function(stmt) {
            _node(stmt, env, ctx, tctx);
        });

        tctx.write('br label %' + loopLbl);
        tctx.write(afterLbl + ':', true);
        tctx.popLoop();
    },
    DoWhile: function(env, ctx, tctx) {
        var loopLbl = tctx.getUniqueLabel('loop');
        var afterLbl = tctx.getUniqueLabel('after');

        tctx.write(loopLbl + ':', true);
        tctx.pushLoop(loopLbl, afterLbl);

        this.body.forEach(function(stmt) {
            _node(stmt, env, ctx, tctx);
        });

        var condition = _node(this.condition, env, ctx, tctx);
        tctx.write('br i1 ' + condition + ', label %' + loopLbl + ', label %' + afterLbl);
        tctx.write(afterLbl + ':', true);
        tctx.popLoop();
    },
    While: function(env, ctx, tctx) {
        var beforeLbl = tctx.getUniqueLabel('before');
        tctx.write(beforeLbl + ':', true);

        var condition = _node(this.condition, env, ctx, tctx);

        var loopLbl = tctx.getUniqueLabel('loop');
        var afterLbl = tctx.getUniqueLabel('after');
        tctx.pushLoop(loopLbl, afterLbl);

        tctx.write('br i1 ' + condition + ', label %' + loopLbl + ', label %' + afterLbl);
        tctx.write(loopLbl + ':', true);

        this.body.forEach(function(stmt) {
            _node(stmt, env, ctx, tctx);
        });

        tctx.write('br label %' + afterLbl);
        tctx.write(afterLbl + ':', true);
        tctx.popLoop();
    },
    Switch: function(env, ctx, tctx) {
        throw new Error('Not Implemented: switch');
    },
    Case: function() {},
    If: function(env, ctx, tctx) {
        var condition = _node(this.condition, env, ctx, tctx);

        var consequentLbl = tctx.getUniqueLabel('conseq');
        var afterLbl = tctx.getUniqueLabel('after');
        var alternateLbl = this.alternate ? tctx.getUniqueLabel('alternate') : afterLbl;

        tctx.write('br i1 ' + condition + ', label %' + consequentLbl + ', label %' + alternateLbl);
        tctx.write(consequentLbl + ':', true);

        this.consequent.forEach(function(stmt) {
            _node(stmt, env, ctx, tctx);
        });

        tctx.write('br label %' + afterLbl);

        if (this.alternate) {
            tctx.write(alternateLbl + ':', true);
            this.alternate.forEach(function(stmt) {
                _node(stmt, env, ctx, tctx);
            });
        }

        tctx.write(afterLbl + ':', true);

    },
    Function: function(env, ctx, tctx) {
        var context = this.__context;
        var funcType = this.getType(ctx);
        var returnType = funcType.getReturnType();

        tctx.write('define ' +
            (returnType ? getLLVMType(returnType) : 'void') +
            ' @' + makeName(this.__assignedName) +
            '(' +
            this.params.map(function(param) {
                return getLLVMType(param.getType(ctx)) + ' %param_' + makeName(param.__assignedName);
            }).join(', ') + ') nounwind {');

        tctx.push();

        Object.keys(context.typeMap).forEach(function(v) {
            var type = context.typeMap[v];
            tctx.write('%' + makeName(v) + ' = alloca ' + getLLVMType(type) + ', align ' + getAlignment(type));

        });

        this.params.forEach(function(p) {
            var type = p.getType(context);
            var typeName = getLLVMType(type);
            tctx.write('store ' + typeName + ' %param_' + makeName(p.__assignedName) + ', ' + typeName + '* %' + makeName(p.__assignedName))
        });

        this.body.forEach(function(stmt) {
            _node(stmt, env, context, tctx);
        });

        tctx.pop();

        tctx.write('}');
    },
    OperatorStatement: function(env, ctx, tctx) {
        tctx.write('define @' + makeName(this.__assignedName) +
            getLLVMType(this.returnType.getType(ctx)) +
            ' (' +
            getLLVMType(this.left.getType(ctx)) + ' %' +  _node(this.left, env, ctx, tctx) + ', ' +
            getLLVMType(this.right.getType(ctx)) + ' %' +  _node(this.right, env, ctx, tctx) +
            ') nounwind {');

        tctx.push();

        this.body.forEach(function(stmt) {
            _node(stmt, env, ctx, tctx);
        });

        tctx.pop();

        tctx.write('}');
    },
    TypedIdentifier: function(env, ctx, tctx) {
        return makeName(this.__assignedName);
    },
    Literal: function(env, ctx, tctx) {
        if (this.value === true) return 'true';
        if (this.value === false) return 'false';
        if (this.value === null) return 'null';
        return getLLVMType(this.getType(ctx)) + ' ' + this.value.toString();
    },
    Symbol: function(env, ctx, tctx) {
        if (this.__isFunc) {
            return '@' + makeName(this.__refName);
        }

        var reg = tctx.getRegister();
        var type = this.getType(ctx);
        tctx.write(reg + ' = load ' + getLLVMType(type) + '* %' + makeName(this.__refName));
        return reg;
    },
    New: function(env, ctx, tctx) {
        var type = this.getType(ctx);
        var targetType = getLLVMType(type);

        if (type._type === 'array') {

            var flatTypeName = type.flatTypeName();
            if (!(flatTypeName in env.__arrayTypes)) {
                env.__arrayTypes[flatTypeName] = type;
            }

            var length = _node(this.params[0], env, ctx, tctx);
            var arr = tctx.getRegister();
            tctx.write(arr + ' = call ' + targetType + ' @btmake_' + targetType.substr(1) + '(i32 ' + length + ')');
            return arr;
        }

        var size = type.getSize();
        var reg = tctx.getRegister();
        tctx.write(reg + ' = call i8* @malloc(i32 ' + size + ')');
        var ptrReg = tctx.getRegister();

        tctx.write(ptrReg + ' = bitcast i8* ' + reg + ' to ' + targetType);

        if (type instanceof types.Struct && type.objConstructor) {
            var params = [
                targetType + ' ' + ptrReg,
                this.params.map(function(p) {
                    return getLLVMType(p.getType(ctx)) + ' ' + _node(p, env, ctx, tctx);
                }).join(', '),
            ].join(', ');

            var constructedReg = tctx.getRegister();
            tctx.write(constructedReg + ' = call ' + targetType + ' @' + makeName(type.objConstructor) + '(' + params + ')');
            return constructedReg;
        } else {
            return ptrReg;
        }
    },

    Break: function() {
        tctx.write('br label %' + this.loopStack[0].exitLabel);
    },
    Continue: function() {
        tctx.write('br label %' + this.loopStack[0].startLabel);
    },

    ObjectDeclaration: function(env, ctx, tctx) {
        if (this.objConstructor) {
            _node(this.objConstructor, env, ctx, tctx) + '\n';
        }

        this.methods.forEach(function(method) {
            _node(method, env, ctx, tctx);
        });
    },
    ObjectMember: function() {},
    ObjectMethod: function(env, ctx, tctx) {
        _node(this.base, env, ctx, tctx);
    },
    ObjectConstructor: function(env, ctx, tctx) {
        // Constructors are merged with the constructor in `typeTranslate`
        // in the generate module.
    },

    TypeCast: function(env, ctx, tctx) {
        var baseType = this.left.getType(ctx);
        var baseTypeName = getLLVMType(baseType);
        var targetType = this.rightType.getType(ctx);

        var base = _node(this.left, env, ctx, tctx);
        if (baseType.equals(targetType)) return base;

        var resPtr = tctx.getRegister();

        switch (baseType.typeName) {
            case 'int':
                switch (targetType.typeName) {
                    case 'float':
                    case 'sfloat':
                        tctx.write(resPtr + ' = sitofp ' + baseTypeName + ' ' + base + ' to ' + targetType);
                        return resPtr;
                    case 'byte':
                        tctx.write(resPtr + ' = trunc ' + baseTypeName + ' ' + base + ' to ' + targetType);
                        return resPtr;
                    case 'bool':
                        tctx.write(resPtr + ' = icmp ne ' + baseTypeName + ' ' + base + ', 0');
                        return resPtr;
                }
            case 'uint':
                switch (targetType.typeName) {
                    case 'float':
                    case 'sfloat':
                        tctx.write(resPtr + ' = uitofp ' + baseTypeName + ' ' + base + ' to ' + targetType);
                        return resPtr;
                    case 'byte':
                        tctx.write(resPtr + ' = trunc ' + baseTypeName + ' ' + base + ' to ' + targetType);
                        return resPtr;
                    case 'bool':
                        tctx.write(resPtr + ' = icmp ne ' + baseTypeName + ' ' + base + ', 0')
                        return resPtr;
                }
            case 'sfloat':
                switch (targetType.typeName) {
                    case 'int':
                        tctx.write(resPtr + ' = fptosi ' + baseTypeName + ' ' + base + ' to ' + targetType);
                        return resPtr;
                    case 'float':
                        tctx.write(resPtr + ' = fext ' + baseTypeName + ' ' + base + ' to ' + targetType);
                        return resPtr;
                    case 'byte':
                    case 'uint':
                        tctx.write(resPtr + ' = fptoui ' + baseTypeName + ' ' + base + ' to ' + targetType);
                        return resPtr;
                    case 'bool':
                        tctx.write(resPtr + ' = fcmp ne ' + baseTypeName + ' ' + base + ', 0')
                        return resPtr;
                }
            case 'float':
                switch (targetType.typeName) {
                    case 'int':
                        tctx.write(resPtr + ' = fptosi ' + baseTypeName + ' ' + base + ' to ' + targetType);
                        return resPtr;
                    case 'uint':
                    case 'byte':
                        tctx.write(resPtr + ' = fptoui ' + baseTypeName + ' ' + base + ' to ' + targetType);
                        return resPtr;
                    case 'bool':
                        tctx.write(resPtr + ' = fcmp ne ' + baseTypeName + ' ' + base + ', 0')
                        return resPtr;
                    case 'sfloat':
                        tctx.write(resPtr + ' = fptrunc ' + baseTypeName + ' ' + base + ' to ' + targetType);
                        return resPtr;
                }
            case 'byte':
                switch (targetType.typeName) {
                    case 'int':
                        tctx.write(resPtr + ' = sext ' + baseTypeName + ' ' + base + ' to ' + targetType);
                        return resPtr;
                    case 'uint':
                        tctx.write(resPtr + ' = zext ' + baseTypeName + ' ' + base + ' to ' + targetType);
                        return resPtr;
                    case 'float':
                    case 'sfloat':
                        tctx.write(resPtr + ' = uitofp ' + baseTypeName + ' ' + base + ' to ' + targetType);
                        return resPtr;
                    case 'bool':
                        tctx.write(resPtr + ' = icmp ne ' + baseTypeName + ' ' + base + ', 0')
                        return resPtr;
                }
            case 'bool':
                switch (targetType.typeName) {
                    case 'int':
                    case 'uint':
                    case 'byte':
                        tctx.write(resPtr + ' = zext ' + baseTypeName + ' ' + base + ' to ' + targetType);
                        return resPtr;
                    case 'float':
                    case 'sfloat':
                        tctx.write(resPtr + ' = uitofp ' + baseTypeName + ' ' + base + ' to ' + targetType);
                        return resPtr;
                }
        }

        return base;
    },

    TupleLiteral: function(env, ctx, tctx) {
        var type = this.getType(ctx);
        var typeName = getLLVMType(type);

        var size = type.getSize() + 8;
        var reg = tctx.getRegister();
        tctx.write(reg + ' = call i8* @malloc(i64 ' + size + ')');
        var ptrReg = tctx.getRegister();
        tctx.write(ptrReg + ' = bitcast i8* ' + reg + ' to ' + typeName);

        // Assign all the tuple values
        this.content.forEach(function(exp, i) {
            var value = _node(exp, env, ctx, tctx);
            var valueType = getLLVMType(exp.getType(ctx));

            var pReg = tctx.getRegister();
            tctx.write(pReg + ' = getelementptr inbounds ' + typeName + ' ' + ptrReg + ', i32 ' + i);
            tctx.write('store ' + valueType + ' ' + value + ', ' + valueType + '* ' + pReg);
        });

        return ptrReg;
    }
};

module.exports = function translate(ctx) {
    var tctx = new TranslationContext(ctx.env, ctx);
    _node(ctx.scope, ctx.env, ctx, tctx);
    return tctx.toString();
};
