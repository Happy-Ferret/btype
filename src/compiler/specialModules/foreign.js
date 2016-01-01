import Func from '../types/Func';
import lexer from '../../lexer';
import parser from '../../parser';
import RootNode from '../../astNodes/RootNode';
import * as symbols from '../../symbols';
import * as types from '../types';


var MathRaw = [
    'func int:abs(int:i) {}',
    'func float:acos(float:i) {}',
    'func float:asin(float:i) {}',
    'func float:atan(float:i) {}',
    'func float:cos(float:i) {}',
    'func float:sin(float:i) {}',
    'func float:tan(float:i) {}',
    'func int:ceil(float:i) {}',
    'func int:floor(float:i) {}',
    'func float:exp(float:i) {}',
    'func float:log(float:i) {}',
    'func float:sqrt(float:i) {}',
    'func float:atan2(float:y, float:x) {}',
    'func float:pow(float:y, float:x) {}',
    'func float:getNaN() {}',
].join('\n');


const RAW = Symbol('raw');

class BaseForeignType {
    constructor(env) {
        this.env = env;
    }
    equals(x) {
        return false;
    }

    flatTypeName() {
        return 'foreign';
    }

    toString() {
        return 'foreign';
    }

    hasMember() {
        return true;
    }

    hasMethod() {
        return false;
    }
    isSubscriptable() {
        return false;
    }
}


class StdlibType extends BaseForeignType {
    constructor(env, name, raw) {
        super(env);
        this.name = name;
        var parsed = parser(lexer(raw));
        parsed[symbols.IGNORE_ERRORS] = true;
        var hlir = parsed[symbols.FMAKEHLIR](env, true);
        this[RAW] = hlir[symbols.CONTEXT];

        this._type = '_stdlib';
    }

    hasMember(name) {
        return this[RAW].nameMap.has(name);
    }

    getMemberType(name) {
        return this[RAW].typeMap.get(this[RAW].nameMap.get(name));
    }
}

class ForeignType extends BaseForeignType {
    constructor(env) {
        super(env);
        this._type = '_foreign';
    }

    getMemberType(name) {
        return new CurriedForeignType(this.env, name, []);
    }

}

class CurriedForeignType extends BaseForeignType {
    constructor(env, funcName, typeChain) {
        super(env);
        this.funcName = funcName;
        this.typeChain = typeChain;

        this._type = '_foreign_curry';
    }

    getMemberType(name) {
        switch (name) {
            case 'int':
            case 'float':
            case 'bool':
            case 'str':
            case '_null':
                return new CurriedForeignType(this.env, this.funcName, this.typeChain.concat([name]));
        }

        var returnType = null;
        if (this.typeChain[0] !== '_null') {
            returnType = types.resolve(this.typeChain[0]);
        }
        return new Func(returnType, this.typeChain.slice(1).map(types.resolve));
    }

    getReturnType() {
        if (this.typeChain[0] === '_null') return null;
        return types.resolve(this.typeChain[0]);
    }

    getArgs() {
        return this.typeChain.slice(1).map(types.resolve);
    }

}


export function get(env) {
    var fakeRoot = new RootNode([], 0, 0);
    var hlir = fakeRoot[symbols.FMAKEHLIR](env, true);
    var ctx = hlir[symbols.CONTEXT];

    ctx.exports.set('Math', ctx.addVar('Math', new StdlibType(env, 'Math', MathRaw)));
    ctx.exports.set('external', ctx.addVar('external', new ForeignType(env)));

    return ctx;
};
